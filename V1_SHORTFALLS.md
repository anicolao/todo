# V1 shortfalls

**Audit target:** `v1.0.0` / `54c3c00c0c97af721aad50389a6dc9952dc5144a`

**Audit date:** 2026-10-20

**Scope:** Web application, Firestore data model and rules, Cloud Functions,
notifications, CLI/service, native shells, tests, and release automation.

This is a source review and targeted production verification, not a complete
penetration test. Findings are ranked by urgency:

- **P0:** active exposure or practical account/data compromise; address now.
- **P1:** material correctness, privacy, or reliability failure; address before
  expanding use.
- **P2:** unfinished functionality, maintainability debt, or missing defence in
  depth.

## Executive summary

V1 has a polished client and substantial automated UI coverage, but its server
trust boundary is not ready for users outside a mutually trusted group. The
most important problem is not any single permissive rule: several rules and
client behaviours compose into an authorization bypass. Any authenticated
account can create its own editor record for a known list ID. Invitations do
this before acceptance, and revocation never removes the editor record. The
global user directory is writable by every authenticated account, and a Cloud
Function trusts those writes when assigning push tokens to UIDs.

There is also a currently deployed, unauthenticated HTTP function that returns
the complete user directory. An anonymous request during this audit returned
HTTP 200 with serialized email, UID, name, photo, and notification-token fields.
No values from that response are reproduced here.

Separately, both released native shells use Capacitor 8.5.0, which is in the
critical affected range of a published origin-confusion advisory. The direct
fix is available in 8.5.1.

The event-sourced client remains vulnerable to malformed or out-of-order
actions, many writes report success after failure, and the release CI does not
run the repository's currently failing typecheck or lint gates. These are the
main reasons V1 can pass CI while still containing production-impacting faults.

## P0 — immediate security work

### 1. The deployed `users` HTTP function exposes the user directory anonymously

**Evidence**

- [`functions/src/index.ts`](functions/src/index.ts) lines 19–24 registers an
  `onRequest` function, performs an unrestricted `users` collection query, and
  serializes the result. It performs no authentication, authorization, App
  Check, method check, or rate limiting.
- A request without credentials to the deployed function on 2026-10-20 returned
  HTTP 200 and 18 records. The serialized field names included `email`, `uid`,
  `name`, `photo`, and `notificationToken`.
- The web client does not need this HTTP function; it currently obtains users
  through Firestore directly.

**Impact**

Anyone can enumerate personal profile information and device notification
tokens. The endpoint also permits anonymous repeated full-collection reads,
which creates an avoidable cost/denial-of-wallet surface.

**Recommendation**

Disable or delete the function immediately. If a directory endpoint remains
necessary, require verified authentication and membership, return only the
minimum fields required for an exact lookup, and add abuse controls. Treat the
exposed notification tokens as compromised metadata and rotate/re-register
them after containment.

### 2. List access is self-granting, and invitation rejection/revocation is cosmetic

**Evidence**

- [`firestore.rules`](firestore.rules) lines 14–18 allow an authenticated user
  to create `editors/{listId}/{theirUid}/editor` for any `listId`; no owner or
  invitation proof is required.
- Lines 10–12 then grant that editor full read/write access to every document
  below the list. Rules do not distinguish owner, collaborator, or operation.
- [`src/lib/database.ts`](src/lib/database.ts) lines 31–67 implements this
  self-grant in normal client code. Lines 447–469 call it while merely loading
  the names of pending shares, before the invitation has been accepted.
- Rejection in [`src/lib/components/ListMenuItem.svelte`](src/lib/components/ListMenuItem.svelte)
  lines 79–84 writes request actions only. Revocation in
  [`src/lib/components/AcceptShare.svelte`](src/lib/components/AcceptShare.svelte)
  lines 47–71 also writes actions only. There is no production call that deletes
  an editor record.
- [`firestore.rules`](firestore.rules) lines 20–21 let every signed-in account
  enumerate activity document IDs, which are list IDs and therefore weaken any
  assumption that IDs remain secret.
- No code or rule enforces the intended small-team membership boundary; any
  Firebase-authenticated account satisfies the top-level checks.

**Impact**

Any signed-in user who learns a list ID can grant themselves permanent read and
write access. An invited user receives full list contents before accepting and
keeps backend access after rejecting or being removed. Former collaborators can
continue reading actions, append actions, trigger notifications, and corrupt
the reconstructed client state.

**Recommendation**

Move membership changes behind a trusted server transaction/callable function.
Only an existing owner should be able to invite or revoke; acceptance should
consume a server-validated invitation; revocation must delete or disable the
membership record atomically. Rules should validate the membership role and
operation, not allow clients to manufacture their prerequisite. Add a
server-side allowlist/custom claim if the service is intended only for Andrew
and Alex.

### 3. Any signed-in user can bind their device token to another user's UID

**Evidence**

- [`firestore.rules`](firestore.rules) lines 7–9 allow every authenticated user
  to read, create, overwrite, or delete every document below `users`.
- [`functions/src/index.ts`](functions/src/index.ts) lines 103–119 trusts the
  document's `uid` and `notificationToken`, then uses Admin privileges to store
  that token below `notifications/{uid}/tokens`.
- Notification payloads include the serialized action and task description in
  [`functions/src/notifications.ts`](functions/src/notifications.ts) lines
  114–149.
- Email-to-UID sharing lookup uses the first matching client-readable profile in
  [`src/lib/components/users.ts`](src/lib/components/users.ts) lines 16–21, so a
  forged or duplicate profile can also redirect a share invitation.

**Impact**

An authenticated attacker can write a user profile containing a victim UID and
an attacker-controlled FCM token. The privileged trigger then subscribes that
device to the victim's future task notifications, exposing todo descriptions
and activity. Attackers can also overwrite directory identities and interfere
with sharing resolution.

**Recommendation**

Make `/users/{uid}` owner-write-only and derive identity from `request.auth`, not
request data. Prefer UID document keys; keep email lookup in a separately
validated, server-owned index. Register and revoke notification tokens through
an authenticated callable endpoint that always uses the caller's token UID.

### 4. The released iOS and Android shells contain a critical Capacitor vulnerability

**Evidence**

- `package-lock.json` installs `@capacitor/android@8.5.0` and
  `@capacitor/ios@8.5.0`.
- `npm audit --omit=dev` identifies both direct dependencies as critical under
  [GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv):
  remote content can be loaded at the app origin through the internal HTTP proxy
  path. The affected range is `>=8.5.0 <8.5.1` and a fix is available.
- The shells intentionally load the production website at runtime, as documented
  in [`README.md`](README.md) lines 72–76, making origin correctness part of the
  application security boundary.

**Impact**

With user interaction, hostile remote content may run with the app origin's
authority, threatening authenticated application data and native bridge access.

**Recommendation**

Upgrade all Capacitor platform/core/CLI packages together to at least 8.5.1,
rebuild both shells, rerun native tests, and ship replacement builds. Add a
production-dependency audit or equivalent advisory gate to release CI.

## P1 — correctness, privacy, and reliability

### 5. Persisted actions are neither schema-validated nor isolated during replay

**Evidence**

- The list write rule checks only editor existence. It does not constrain action
  type, payload shape, path/payload list ID agreement, creator, or timestamp.
- [`functions/src/index.ts`](functions/src/index.ts) lines 63–93 trusts action
  fields including `creator`, `type`, payload, and `timestamp._seconds` when
  updating activity and sending notifications.
- [`src/lib/store.ts`](src/lib/store.ts) lines 25–55 dispatches each persisted
  document directly into every reducer, without per-action validation or
  quarantine.
- Several item reducers assume prior state exists. For example,
  [`src/lib/components/items.ts`](src/lib/components/items.ts) lines 192–212
  dereferences list/item state, and lines 315–335 deliberately throw when a
  reorder target is absent.
- Initial global replay catches around the whole batch in
  [`src/lib/database.ts`](src/lib/database.ts) lines 586–617. One throwing action
  therefore prevents later valid actions in that snapshot from being applied.

**Impact**

A buggy, old, or malicious client can permanently poison a list's append-only
history. Fresh clients may fail or silently omit all actions after the bad one.
Forged timestamps can distort caches/activity, forged creators can suppress
notifications, and malformed actions can repeatedly break hydration.

**Recommendation**

Define versioned runtime schemas for every persisted action. Enforce the parts
Firestore Rules can express, stamp creator/time on a trusted server when
possible, validate again before reducers/functions, and quarantine invalid
documents individually while continuing ordered replay. Add migration and
poison-action fixtures to both web and CLI replay tests.

### 6. Sign-out does not end notification delivery or remove local web data

**Evidence**

- Notification registration only adds tokens. The `onLogin` trigger never
  removes a token except after a later send reports it stale.
- [`src/lib/components/ProfileSettings.svelte`](src/lib/components/ProfileSettings.svelte)
  lines 400–414 signs out of Firebase without unregistering the current token.
- On a shared device, a later account can register the same device token under a
  second UID while the first mapping remains.
- [`src/lib/store.ts`](src/lib/store.ts) lines 129–150 persists the complete
  reconstructed state, including todo text, in IndexedDB by email. Sign-out
  resets Redux but does not delete that database entry.

**Impact**

A signed-out or reassigned device can continue receiving a former user's task
content. Todo data also remains recoverable from the browser profile after the
user believes they have signed out.

**Recommendation**

Track token ownership explicitly and revoke the current installation token
before sign-out/account switching. Provide “sign out and remove local data” and
delete the user's IndexedDB cache. Document retention behaviour where offline
state is intentionally retained.

### 7. Write failures are commonly swallowed, allowing false success and partial state

**Evidence**

- [`src/lib/firebase.ts`](src/lib/firebase.ts) lines 41–75 catches request/write
  failures, logs them, and resolves or returns nothing to the caller.
- [`src/lib/components/ActionLog.ts`](src/lib/components/ActionLog.ts) lines
  25–32 and 42–58 also swallow normal and optimistic write failures.
- [`src/lib/database.ts`](src/lib/database.ts) lines 31–67 catches list setup
  failures and still resolves.
- These operations span editor creation, initial rename, global list creation,
  request bookkeeping, and list actions, so a user-visible operation can be
  only partly committed.

**Impact**

The web UI can appear to save while data is absent, can create orphaned
membership/list records, or can leave sharing state inconsistent. Logging to a
developer console is not an actionable failure mode for a mobile user.

**Recommendation**

Reject failed promises and make the initiating UI own retry/error state. Group
multi-document changes in atomic batches or trusted transactions. Reserve
catch-and-log for genuinely best-effort telemetry.

### 8. Database subscriptions leak across lifecycle changes and startup can hang

**Evidence**

- [`src/lib/database.ts`](src/lib/database.ts) lines 107–143 cleans up named
  Firestore and browser listeners.
- The nested `store.subscribe` created at lines 494–549 is not assigned to an
  unsubscribe variable and is never cleaned up. Recreating `load()` leaves the
  old subscriber alive, able to attach new list listeners from stale closures.
- The initial requests subscription at lines 582–617 and the users/activity
  subscriptions have no error callback that settles the initial `actionsPromise`.
  A denied query, missing index, or terminal listener error can leave the loading
  UI waiting forever.
- Pending-share loading launches an uncancelled async loop at lines 447–469 that
  may continue after sign-out or component destruction.

**Impact**

Sign-in/out and remount cycles can duplicate work and network listeners. Certain
backend errors produce an indefinite startup spinner rather than a recoverable
error, and stale async work can run against a changed authentication state.

**Recommendation**

Own every unsubscribe/cancellation handle in one session object. Cancel all
work on sign-out/destroy, and make every startup listener settle into ready,
offline, or explicit error with retry.

### 9. “Delete list” does not delete server data, and there is no automated recovery plan

**Evidence**

- The destructive UI calls `session.remove()` in
  [`src/lib/components/ListDetailsEditor.svelte`](src/lib/components/ListDetailsEditor.svelte)
  lines 223–242.
- [`src/lib/components/list-details-save.ts`](src/lib/components/list-details-save.ts)
  line 116 implements that operation by appending `delete_list`; it does not
  delete the action log, editor records, activity record, or request history.
- The design intentionally uses ever-growing action logs. There is no compaction,
  retention, or archive mechanism, so fresh hydration cost and poison-action
  exposure grow indefinitely.
- [`scripts/firestore-copy.mjs`](scripts/firestore-copy.mjs) provides a useful
  manual export and emulator seed path, but no workflow schedules encrypted
  backups or tests a production restore.

**Impact**

The product presents deletion while retaining todo contents and access metadata
on the server. Long-lived histories increase latency, Firestore cost, and blast
radius. A mistaken destructive write has no documented, tested recovery path.

**Recommendation**

Define deletion and retention semantics explicitly. Implement privileged,
recursive deletion or label the current action as archive/hide. Add snapshots
or compaction without discarding the audit/migration guarantees the client
needs. Automate encrypted backups and periodically exercise restoration.

### 10. Sensitive todo contents are copied into function logs

**Evidence**

- [`functions/src/index.ts`](functions/src/index.ts) lines 67–68 and 126–127
  log complete persisted actions as JSON. Item actions contain descriptions and
  other user content.

**Impact**

Todo content gains a second retention and access surface in Cloud Logging, with
different permissions and lifecycle from Firestore.

**Recommendation**

Log structured event type, opaque IDs, outcome, and a correlation ID only.
Never log descriptions, tokens, or whole actions. Review and shorten existing
log retention if appropriate.

## P2 — unfinished features and engineering gaps

### 11. The import route is an exposed prototype, not a safe migration tool

[`src/routes/(app)/import/+page.svelte`](<src/routes/(app)/import/+page.svelte>)
labels itself “Primitive import tool.” It parses arbitrary pasted JSON without
error handling or schema validation, assumes a legacy nested shape, mutates the
input, and launches most Firestore writes without awaiting them. Item follow-up
actions can therefore race item creation, which is particularly dangerous for
reducers that assume the item already exists. There is no dry run, progress,
idempotency key, rollback, or reliable completion/error report.

Either remove this route from production or turn it into a validated,
server-assisted import with deterministic action ordering and a preview.

### 12. The CLI is useful but not yet feature-complete

The CLI implements item queries/mutations, Today, and search, but
[`cli/src/application.ts`](cli/src/application.ts) lines 330–337 explicitly
rejects direct label queries. The help surface has no commands for list or label
creation/deletion/renaming/reordering, sharing, recurring due dates, or profile
settings. [`cli/README.md`](cli/README.md) lines 124–133 also correctly notes
that there is no offline write queue.

These are reasonable V1 scope cuts, but should be tracked as explicit product
gaps so “CLI access” is not mistaken for parity with the web/mobile clients.

### 13. Notification interaction is only half implemented

The native client decodes notification actions and supports `onAction` and
`onReceived` callbacks in
[`src/lib/notifications/capacitor.ts`](src/lib/notifications/capacitor.ts), but
[`src/lib/notifications/index.ts`](src/lib/notifications/index.ts) lines 88–99
constructs it without either callback. Tapping a notification therefore has no
application-specific navigation or state handling. The web foreground handler
in [`src/lib/notifications/web.ts`](src/lib/notifications/web.ts) lines 35–41
only logs receipt and provides no visible in-app notice.

Define a safe notification destination (normally the affected list/item), test
foreground/background/cold-start routing, and do not execute serialized actions
from a push as authority.

### 14. The global user-directory client is stale, broad, and non-scalable

[`src/lib/database.ts`](src/lib/database.ts) lines 145–155 subscribes every
signed-in client to the entire users collection and logs each profile. It only
handles `added`, so name/photo/email changes and deletions remain stale in open
clients. This design discloses every profile to every member and makes startup
cost grow with total users merely to support email-based sharing.

Replace it with an exact, normalized email lookup or server-mediated invitation
flow. Handle profile changes where a live directory is genuinely required and
remove profile logging.

### 15. Required static-analysis gates are broken and absent from CI

On the release commit:

- `npm run check` fails with 13 errors in 3 files.
- `npm run lint` fails because 31 files do not pass Prettier.
- Running ESLint directly fails before analysis because `.eslintrc.cjs` refers
  to the missing `svelte3/svelte3` processor even though the installed plugin is
  `eslint-plugin-svelte`.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs root unit/E2E/native
  tests and Functions lint/build, but never runs root `check` or `lint`.

This is a concrete CI-net gap: the release can be green while the repository's
declared validation commands fail. Repair the ESLint migration and formatting
baseline, then make formatting, lint, and typecheck required. Keep generated
story assets out of formatting scope if they are intentionally machine-owned.

### 16. Security regression coverage is missing

There is no `@firebase/rules-unit-testing` dependency and no focused suite that
asserts denied reads/writes. Existing E2E tests exercise happy-path synchronization
and occasionally replace emulator rules, but do not prove that an unrelated user
cannot self-grant, read a pending/revoked list, edit another profile, forge an
action, or redirect a notification token.

Add a compact authorization matrix test suite against the exact production
rules. Test at least anonymous, unrelated authenticated user, invitee, accepted
editor, revoked editor, and owner for every sensitive path. Add Functions tests
that prove UID/token binding and reject forged action metadata.

### 17. Dependency and supply-chain maintenance needs a release policy

Beyond the direct Capacitor criticals above, `npm audit --omit=dev` reports 31
production-tree advisories: 2 low, 9 moderate, 18 high, and 2 critical. Several
flow through old SvelteKit/build dependencies and may not be exploitable in this
static deployment, so the raw count should be triaged rather than blindly
auto-fixed. However, `@sveltejs/kit` is specified as `next` while the lockfile
contains 1.22.4, and GitHub Actions are referenced by mutable major tags rather
than commit SHAs. [`firebase.json`](firebase.json) also sets no explicit Content
Security Policy, `frame-ancestors`, Referrer Policy, or Permissions Policy.

Adopt a scheduled dependency review, pin intentional framework versions, block
known exploitable direct-runtime advisories, pin third-party actions by commit,
and define hosting security headers after testing Google sign-in, images, push,
and the native shell.

## Recommended sequence

1. **Contain current exposure:** disable the public `users` function; lock user
   documents to their authenticated owner; stop the token-copy trigger until UID
   binding is trustworthy; remove sensitive action logging.
2. **Replace released native builds:** upgrade Capacitor past 8.5.0 and publish
   rebuilt iOS/Android shells.
3. **Repair authorization:** introduce server-owned roles/invitations, an
   explicit membership allowlist, atomic acceptance/revocation, and tests for
   every denied case. Audit and remove stale production editor records.
4. **Protect the event log:** validate/stamp actions, quarantine individual bad
   records, and test old/malformed/out-of-order histories.
5. **Make client failure explicit:** propagate write errors, cancel all session
   listeners, revoke push tokens on sign-out, clear local data on request, and
   give startup a recoverable error state.
6. **Restore release confidence:** repair and require check/lint/audit gates,
   then address import, CLI parity, notification routing, retention/compaction,
   and backup restoration.

## Verification notes

The following checks were run from a clean `npm ci` installation at the audited
commit:

| Check                              | Result                                                     |
| ---------------------------------- | ---------------------------------------------------------- |
| Root Vitest suite                  | 126 passed, 1 skipped                                      |
| Functions Vitest suite             | 9 passed                                                   |
| CLI Bun suite                      | 22 passed, 4 emulator tests skipped locally                |
| `npm run check`                    | Failed: 13 errors in 3 files                               |
| `npm run lint`                     | Failed: 31 Prettier failures; ESLint is also misconfigured |
| `npm audit --omit=dev`             | 31 findings: 2 low, 9 moderate, 18 high, 2 critical        |
| Anonymous deployed `users` request | HTTP 200; user PII and token fields returned               |

Passing tests demonstrate useful functional coverage, but they do not reduce
the urgency of the authorization and production-exposure findings because those
boundaries are not represented in the current suites.
