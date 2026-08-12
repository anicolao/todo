# Todo command-line client design

Status: proposed

## Summary

Add a `todo` command that signs in as a normal Todo user, discovers that user's visible lists, reconstructs list state from the existing Firestore action logs, and supports two primary operations:

```console
$ todo add --list Groceries "oat milk"
Added “oat milk” to Groceries (item 48c0…)

$ todo list --list Groceries
ID        STATE   DESCRIPTION
48c0…     active  oat milk
```

The CLI must use the same Firebase Authentication identity, Firestore paths, security rules, action shapes, and replay behavior as the web and mobile clients. It must not introduce a second task store or bypass Firestore with Admin credentials.

## Goals

- Add an active item to an existing list.
- List the current items in one or all visible lists.
- Work with both owned and accepted shared lists.
- Produce stable machine-readable output for scripts as well as useful terminal output.
- Preserve the app's append-only, replayable action-log model.
- Share action contracts and replay code with the app so the two clients cannot silently diverge.

## Non-goals for the first release

- Creating, renaming, deleting, reordering, or sharing lists.
- Editing, completing, starring, reordering, or assigning due dates to items.
- Accepting or rejecting a pending share.
- A long-running real-time `watch` mode.
- Offline writes or a local cache.
- Service-account access. The CLI always acts as an end user.

These are natural follow-ups, but limiting the first release to one append operation and read-only replay keeps the compatibility surface small.

## How Todo works today

Todo is an event-sourced SvelteKit application backed by Firebase:

- Global, per-user actions are stored below `from/{creatorUid}/to/{targetUid}/requests/{actionId}`. A collection-group query for `requests`, filtered by `target == currentUid` and ordered by `timestamp`, reconstructs visible-list metadata. Actions written by the current user are applied automatically; incoming share requests remain pending until accepted.
- Per-list actions are stored below `lists/{listId}/actions/{actionId}` and ordered by `timestamp`. Actions such as `rename_list`, `create_item`, `complete_item`, and `reorder_item` reconstruct the list name and its ordered items.
- Firestore contains actions, not materialized item documents. `src/lib/components/lists.ts` and `src/lib/components/items.ts` are the effective read model.
- Creating an item currently writes a `create_item` action from `src/lib/components/ActionLog.ts`. The items reducer prepends a previously unseen item ID, initializes it as active and unstarred, and stores its description.
- List access is represented by `editors/{listId}/{uid}/editor`. Firestore rules permit list reads and writes only when the authenticated UID has that editor document, so the same mechanism covers an owner and an accepted collaborator.
- A Cloud Function observes new list actions, updates `activity/{listId}`, and may notify other editors. A conforming CLI write gets these behaviors without special handling.
- The browser caches a replayed state in IndexedDB and uses real-time listeners, but the action logs remain the source of truth.

This means the CLI is not a CRUD client over task rows. Listing is a deterministic fold over actions, and adding is an append to a list's action log.

## Proposed user experience

### Authentication and setup

```console
$ todo auth login
Opening a browser to sign in…
Signed in as person@example.com

$ todo auth status
person@example.com (todo-firebase-1a740)

$ todo auth logout
Signed out
```

`login` uses the existing Google/Firebase identity. It opens the system browser for a Google OAuth installed-application flow, receives the redirect on a random loopback port, exchanges the Google credential with Firebase Authentication, and stores the refresh credential in the operating system's credential store. The OAuth registration requests only `openid`, `email`, and `profile`.

A dedicated OAuth desktop client should be registered in the same Google Cloud project. The existing browser API key and Firebase project ID are identifiers, not secrets, and can remain in repository configuration. The OAuth client should be proven in a small implementation spike before the CLI structure is merged because the current application only exercises browser/native sign-in.

On each invocation, the CLI refreshes the narrowly scoped Google credential, creates a Firebase `GoogleAuthProvider` credential from the resulting Google token, signs in to the Firebase client SDK, and lets Firestore use the resulting Firebase user. It never stores a Firebase Admin key. Credentials must not appear in command arguments, logs, JSON output, or Git configuration.

Emulator tests use the Auth emulator's email/password accounts through the Firebase client SDK. Emulator configuration uses explicit Auth and Firestore host settings plus an explicit project ID; test credentials are accepted only when the configured hosts are loopback addresses. The first release has no non-interactive production login, avoiding a second token-injection path before there is a concrete automation use case.

If portable credential-store support is not available on a platform, login should fail with an actionable message. A plaintext refresh-token file is not an implicit fallback.

### Discovering lists

Although the first release changes only items, users need a way to disambiguate list names:

```console
$ todo lists
ID                                    NAME
85c4e109-…                            Groceries
9a852ee2-…                            Work

$ todo lists --json
[{"id":"85c4e109-…","name":"Groceries"},{"id":"9a852ee2-…","name":"Work"}]
```

Names are resolved by an exact, case-sensitive match first. A list ID is always accepted. If a name matches zero or multiple visible lists, the command exits with an error and prints matching IDs; it never guesses. `todo config set default-list <id>` may set a default using the stable ID.

### Adding an item

```console
todo add --list <name-or-id> <description>
todo add <description>                  # when a default list is configured
todo add --list Work --json "send report"
```

The description is required and must contain non-whitespace characters, matching the UI. Input is treated literally; shell quoting is the shell's responsibility. The default human output goes to stdout. Diagnostics go to stderr.

Successful JSON output has a stable envelope:

```json
{
	"item": {
		"id": "48c0f1c0-…",
		"listId": "85c4e109-…",
		"listName": "Groceries",
		"description": "oat milk",
		"completed": false,
		"starred": false
	}
}
```

### Listing items

```console
todo list                              # active items from all visible lists
todo list --list <name-or-id>          # active items from one list
todo list --completed                  # completed items only
todo list --all-states --json          # all items, stable JSON
```

Human output includes the list column when more than one list is selected. Items preserve the reducer's order within each list; lists preserve the global reducer's order. Cross-list output is grouped by list rather than implying a global task order that the data model does not have.

The JSON representation includes `id`, `listId`, `listName`, `description`, `completed`, `starred`, and `dueDate` when present. JSON mode emits only JSON on stdout. Empty results are successful (`[]`), while authentication, ambiguity, permission, network, and malformed-log failures are nonzero exits.

Recommended exit codes are `0` for success, `2` for command usage or ambiguous input, `3` for authentication, `4` for permission, and `1` for other runtime failures.

## Architecture

The implementation should add a small Node.js package while moving the event contracts into a browser-independent domain layer:

```text
src/lib/domain/
  actions.ts          typed action creators and persisted action schemas
  replay.ts           global and per-list replay functions
  state.ts            list/item read-model types and initial state
src/lib/components/
  lists.ts            web-facing re-exports or UI adapters
  items.ts            web-facing re-exports or UI adapters
cli/
  src/main.ts          argument parsing and exit behavior
  src/auth.ts          browser login and credential-store abstraction
  src/repository.ts    authenticated Firestore reads and action append
  src/format.ts        human and JSON output
  test/                replay, emulator, and command tests
```

The domain layer must not import Svelte, browser globals, IndexedDB, UI state, or Firebase. Both clients use it, and existing reducer tests move with it. Persisted actions should be validated at the Firestore boundary while unknown action types remain ignorable for forward compatibility. A known action with an invalid payload is a data error that identifies the document path without leaking its contents.

The CLI can be bundled to one ESM entry point and exposed through the root package's `bin` field as `todo`. Node.js 20 or newer provides `crypto.randomUUID`, `fetch`, and a consistent ESM baseline. A future standalone release can publish the bundled artifact without changing the internal API.

### Read path

For every command that needs list resolution:

1. Authenticate and obtain the Firebase UID.
2. Run the existing indexed collection-group query over `requests`: `target == uid`, ordered by `timestamp` ascending.
3. Apply only global actions the app auto-executes: actions created by the current UID plus `accept_request` and `reject_request` acknowledgements. Incoming, unaccepted share requests are not visible lists.
4. Replay list metadata actions to obtain ordered visible list IDs. `create_list`, `delete_list`, `reorder_list`, accepted `accept_pending_share`, and `revoke_share` therefore behave exactly as in the app.
5. Read `lists/{listId}/actions` ordered by `timestamp` for the selected visible lists and replay them. The timestamp-zero `rename_list` action supplies the authoritative name for a shared list, while later renames win through normal replay.
6. Select and format items from the resulting read model.

The first release intentionally performs a fresh, finite read rather than opening snapshots or using the browser's IndexedDB cache. This favors simple, current results. Large logs may be slow; timings should be available only behind `--verbose`. A later release can add a versioned local checkpoint keyed by Firebase project and UID, using the same replay boundary rules as the browser cache.

Firestore's timestamp order is the current compatibility contract. The CLI must not sort actions by document ID or client time. If a required timestamp is unresolved or missing in a server read, it reports a malformed action instead of inventing an order. Equal server timestamps are an existing ambiguity in the model and should be covered by a future schema/versioning design rather than solved differently in one client.

### Write path

After resolving a visible list and confirming the editor-protected action log is readable, `todo add` generates an item UUID and an action-document UUID and writes:

```json
{
	"type": "create_item",
	"payload": {
		"list_id": "85c4e109-…",
		"id": "48c0f1c0-…",
		"description": "oat milk"
	},
	"creator": "firebase-user-uid",
	"timestamp": "<Firestore server timestamp>"
}
```

The destination is `lists/85c4e109-…/actions/<action-uuid>`. This is the same shape produced by the web client. Using `setDoc` with a generated action UUID instead of an anonymous `addDoc` makes an SDK-level retry idempotent. The item UUID remains distinct because item and action identity are separate concepts.

The command waits for the acknowledged server write before printing success. It does not write `activity` or send notifications itself; the existing Firestore trigger owns those side effects. A permission denial is reported as a changed/revoked share rather than retried as another identity.

There is an unavoidable distinction between transport retries and a user rerunning a completed command: SDK retries reuse the action ID, while a new invocation creates a new item. `--request-id <uuid>` can be considered later for caller-controlled idempotency in automation.

## Compatibility and schema ownership

Today the action schema is implicit in TypeScript action creators and reducers. Adding another writer makes that implicit contract risky. The domain extraction should therefore be part of the CLI implementation, not deferred cleanup.

Rules for persisted actions:

- Existing action type strings and payload field names are wire formats and cannot be renamed casually.
- New action fields must be optional to older readers.
- Readers ignore unknown action types, permitting a newer client to add unrelated features.
- A schema version should be added only with a migration/replay plan. The MVP writes the existing unversioned `create_item` shape.
- Golden fixtures must prove that web-generated and CLI-generated logs replay to identical state.

The initial list-name document at action ID `name` and timestamp `0` is a special case already handled by the app. The CLI only adds to existing lists and must neither recreate nor modify that document.

## Security and privacy

- All Firestore operations use a Firebase end-user credential and are evaluated by the checked-in security rules.
- The CLI refuses service-account JSON and does not use the Admin SDK.
- Refresh credentials live in an OS credential store under a key scoped by Firebase project and account UID.
- Logout removes local credentials but does not revoke other app sessions. A future `--revoke` option may perform provider revocation explicitly.
- Descriptions can contain sensitive information, so verbose logs include paths, action IDs, counts, and timings but not action payloads.
- Error output must not print ID tokens, refresh credentials, OAuth authorization codes, or complete Firestore responses.
- Redirect state and PKCE verifier values are random per login; the loopback listener binds only to localhost and shuts down after one response or a short timeout.

The current Firestore rule for `users/{document=**}` permits any signed-in user to read all user profiles, and the global request stream has its existing sharing semantics. The CLI should not expand those permissions. Hardening those rules is valuable but outside this feature.

## Testing strategy

### Domain tests

- Move the existing list and item reducer tests to run against the shared domain layer.
- Add golden action logs containing create, rename, reorder, complete, due-date, delete/revoke, and accepted-share cases.
- Assert that unknown action types are ignored and malformed known actions fail with document context.
- Assert new items appear at the top, matching current reducer behavior.

### CLI unit tests

- Argument validation, exact name/ID resolution, ambiguous names, default-list behavior, formatting, JSON purity, and exit codes.
- Credential-store behavior with an in-memory fake; no live credentials in tests.
- A retry uses one action-document UUID.

### Emulator integration tests

Use the repository's Auth and Firestore emulators and checked-in rules to cover:

1. Seed a user and owned list, run `todo add`, and verify the web-compatible replay sees the new active item.
2. Seed multiple actions, run `todo list`, and verify order and active/completed filtering.
3. Accept a shared list as a second user, then list and add as that user.
4. Reject access to a list without an editor document.
5. Verify a CLI-shaped `create_item` document has the expected creator and server timestamp.

One Playwright interoperability test should add through the CLI against the emulators and assert that the running web UI receives and displays the item. This catches drift across authentication, rules, action shape, Cloud Function/activity behavior, and replay.

Live-production tests are not required and must not be part of CI.

## Delivery plan

1. Extract the shared action contracts and replay kernel with no behavior changes; keep existing unit and end-to-end tests green.
2. Add list discovery and finite replay behind a repository interface, with emulator tests.
3. Add browser login, credential storage, `auth` commands, and token redaction tests.
4. Add `lists`, `list`, and `add`, including JSON contracts and exit codes.
5. Add the CLI-to-web Playwright interoperability test and document installation.
6. Ship as an opt-in local binary, then decide whether to publish a standalone package after real-log performance is measured.

## Alternatives considered

### Call a new HTTP task API

A Cloud Function could expose CRUD-style endpoints. That would centralize replay but create a second authorization/API surface, add operational cost, and require the server to reproduce the current event-sourced read model. Direct authenticated Firestore access already has the correct security and side effects.

### Use the Firebase Admin SDK locally

This would simplify authentication and queries but bypass Firestore rules and place a project-wide credential on user machines. It is inappropriate for an end-user CLI.

### Automate the existing web UI

Browser automation would inherit current behavior but be slow, brittle, difficult to script, and unsuitable for headless use. It is useful as an interoperability test, not as the product architecture.

### Reimplement only `create_item` and parse logs ad hoc

This is initially smaller, but it creates a second interpretation of visibility, sharing, ordering, completion, and future action types. Extracting a shared replay kernel costs more up front and prevents subtle cross-client data divergence.

## Open questions

- Which platforms must the first credential-store implementation support beyond macOS and Linux?
- Should the initial binary be developer-only from this repository, or published under a package name immediately?
- Is case-sensitive exact list-name matching the preferred human behavior, or should a later interactive picker handle fuzzy matches?
- What action-log size should trigger work on persistent CLI checkpoints?
- Should caller-provided idempotency (`--request-id`) be included before the CLI is advertised for automation?
