# Todo command-line client and local service design

Status: implemented for the initial macOS/Linux command set

## Decision

Add two local programs:

- `todo-service` is a long-running Bun process. It owns Firebase authentication, keeps the
  user's Todo state in memory, follows Firestore action streams, writes new actions, and
  periodically saves a local snapshot that can accelerate its next start.
- `todo` is a short-lived command-line client. It parses arguments, sends one request to
  `todo-service` over an owner-only local socket, formats the response, and exits.

Firestore remains the durable source of truth. The service is a resident projection and
command gateway, not a second task database. The disk snapshot is disposable derived data,
not an offline write queue.

The first implementation should import the existing action creators and Redux reducers in
place. It should not begin by moving them to a new domain package or changing the web app to
use a new abstraction. Small compatibility edits to existing files are acceptable only if a
short Bun import spike proves they are necessary; such edits should be proposed separately
and kept narrowly scoped.

## Why this replaces the previous proposal

The previous design authenticated, discovered lists, and replayed Firestore logs on every CLI
invocation. It also made extracting the action contracts and reducers into a new shared domain
layer the first delivery step. That adds latency to every command and puts a large web-app
refactor on the critical path.

The resident-service design changes those tradeoffs:

| Concern            | Previous proposal                         | Revised design                                       |
| ------------------ | ----------------------------------------- | ---------------------------------------------------- |
| Process lifetime   | Authenticate and replay per command       | Authenticate and hydrate once; keep listening        |
| State              | Fresh finite Firestore reads              | In-memory projection, continuously updated           |
| Startup            | No local cache initially                  | Optional versioned snapshot, then Firestore catch-up |
| Code reuse         | Move reducers and contracts first         | Import current reducers and action creators in place |
| CLI responsibility | Firebase client plus presentation         | Local RPC client plus presentation                   |
| Extensibility      | Add each operation to a standalone client | Add a typed service method and a thin CLI command    |

This keeps the initial change additive while giving repeated commands low and predictable
latency.

## Goals

- Keep an authenticated user's visible lists, labels, and items loaded in one local process.
- Reflect changes made by the web, mobile, sharing collaborators, or the CLI through Firestore
  listeners.
- Provide a versioned local interface for all current and future `todo ...` commands.
- Reuse the existing persisted action shapes, action creators, and reducers without moving or
  rewriting them.
- Use normal Firebase end-user credentials and the checked-in Firestore rules.
- Make repeated reads local and make writes wait for an unambiguous committed result.
- Support stable JSON output for scripts as well as concise human output.

## Non-goals

- Replacing Firestore with a local database.
- Changing the web or mobile application to talk to the local service.
- Introducing a cloud HTTP API, Firebase Admin credentials, or service-account access.
- Refactoring `src/lib/components` merely to make its organization more conventional.
- Treating a cached snapshot as proof that the client is current or authorized.
- Queueing offline mutations in the first release.
- Publishing a public third-party service API. The socket protocol is local and evolves with
  the bundled CLI.

## Existing behavior to preserve

Todo is event sourced:

- Global per-user actions live under
  `from/{creatorUid}/to/{targetUid}/requests/{actionId}`. The collection-group query over
  `requests`, filtered by `target`, reconstructs visible lists and sharing state.
- Per-list actions live under `lists/{listId}/actions/{actionId}` and reconstruct list names,
  labels, item order, descriptions, completion, stars, and due dates.
- Access is controlled by `editors/{listId}/{uid}/editor`; the service must pass the same rules
  as the web client.
- Cloud Functions observe list actions and own activity and notification side effects. The
  service must not duplicate them.
- `src/lib/components/lists.ts`, `items.ts`, `labels.ts`, and `requests.ts` contain the current
  read-model behavior. Their exported action creators define the action shapes used by the UI.
- The timestamp-zero `rename_list` document named `name` is a special existing part of list
  hydration.

The browser-specific plumbing in `src/lib/firebase.ts`, `src/lib/database.ts`,
`src/lib/components/ActionLog.ts`, and `src/lib/store.ts` initializes browser services or uses
IndexedDB and `window`. The service should not import those modules wholesale. It should add
small service-side adapters around the reusable reducers and action creators.

## User experience

The service is normally invisible. A command connects to it, and if it is not running the CLI
starts the installed service binary in the background and waits briefly for readiness.

```console
$ todo add --list Groceries "oat milk"
Added “oat milk” to Groceries (item 48c0…)

$ todo list --list Groceries
ID        STATE   DESCRIPTION
48c0…     active  oat milk

$ todo complete 48c0 --list Groceries
Completed “oat milk”
```

The architecture is not limited to `add` and `list`. Item completion, editing, starring, due
dates, reordering, and list operations use the same request path as commands are added. The
initial product slice can remain small, but it must not create a second transport for later
commands.

Useful lifecycle and authentication commands are:

```console
todo service status
todo service start
todo service stop
todo service logs
todo auth login
todo auth status
todo auth logout
```

`todo service start` is optional in normal use because ordinary commands autostart it. `stop`
asks the service to shut down cleanly; the CLI does not kill an arbitrary process found in a
PID file.

List names use exact, case-sensitive matching first, and a list ID is always accepted. A zero
or ambiguous name match is an error that includes candidate IDs. A configured default list is
stored by stable ID, not name.

`--json` prints only a stable response value on stdout. Diagnostics and service startup notices
go to stderr. Recommended exits are `0` for success, `2` for usage or ambiguous input, `3` for
authentication, `4` for permission, `5` when the service is unavailable or incompatible, and
`1` for other failures.

## Architecture

```text
todo <command>
    │  versioned request/response over an owner-only local socket
    ▼
todo-service (Bun, one process per local user)
    ├── command handlers ── validate IDs and construct existing Todo actions
    ├── in-memory Redux projection ── existing lists/items/labels/requests reducers
    ├── subscriptions ── global request stream plus visible per-list action streams
    ├── snapshot store ── versioned derived state and replay cursors
    └── Firebase client SDK ── end-user Auth and Firestore reads/writes
                                      │
                                      ▼
                                  Firestore
```

The implementation is additive:

```text
cli/
  package.json
  src/
    cli.ts              argument parsing, autostart, output, and exits
    service.ts          lifecycle and composition root
    rpc.ts              framed protocol, version negotiation, and limits
    commands.ts         typed query and mutation handlers
    projection.ts       service-owned Redux store using existing reducers
    subscriptions.ts    Firestore hydration and live listeners
    firebase.ts         service-safe Firebase initialization and action append
    auth.ts             login and credential-store integration
    snapshot.ts         atomic versioned disk snapshot
    paths.ts            runtime, state, config, and log locations
  test/
```

`projection.ts` imports reducer and action-creator exports directly from their current
locations under `src/lib/components`. A local check with Bun 1.3.10 found that direct imports
do not resolve the current `$lib` aliases until the root TypeScript configuration has
`baseUrl: "."`; with that option, the existing item and list reducers run unchanged. The
implementation should confirm this through its real entry point and either make that one-line
compatibility edit or supply an equally small build-time alias. If an existing module has an
avoidable browser side effect, prefer a tiny leaf-level fix over moving the reducer family or
replacing imports throughout the app.

Bun is the target runtime because it can run the TypeScript service directly during
development and can later produce self-contained executables. Bun-specific socket, process,
and packaging calls belong behind the small runtime boundary so a Node implementation remains
possible if Firebase SDK compatibility requires it. The web application continues to use its
current npm/Vite toolchain.

## Local protocol and lifecycle

On macOS and Linux, the service listens on a Unix domain socket beneath the user's private
runtime directory. The containing directory is mode `0700`; the socket is accessible only to
its owner. A Windows implementation can use a named pipe. Loopback TCP is not the default. If
it is ever required as a fallback, it must bind only to loopback and require a random secret
stored in an owner-readable file.

The protocol is length-limited request/response JSON. Each request contains:

```json
{
	"protocol": 1,
	"id": "request-uuid",
	"method": "items.create",
	"params": {
		"list": "Groceries",
		"description": "oat milk"
	}
}
```

Each response repeats `id` and contains either `result` or a structured `error` with a stable
code and safe message. Methods are semantic operations such as `lists.query`, `items.create`,
and `items.complete`; the protocol does not accept arbitrary Firestore paths or arbitrary
Redux actions. The service validates every request and constructs the persisted action with
the existing action creator.

The CLI and service negotiate the protocol version on connection. If an installed CLI finds
an incompatible service, it reports the mismatch and tells the user how to restart it. It must
not send a request whose interpretation is uncertain.

Autostart uses an atomic lock plus the socket readiness check so concurrent CLI invocations
start at most one service. The service writes its PID and logs for diagnostics, but the socket
handshake—not the PID file—is proof that the service is alive. OS login-item integration can
be added later; it is not needed for the first implementation.

## Authentication

The service, not each CLI invocation, owns the Firebase Auth session. `todo auth login` asks the
service to open the browser for Google sign-in, receive the redirect on a temporary loopback
listener, exchange the provider credential with Firebase Authentication, and retain the
resulting end-user session. The loopback listener is separate from the Todo command socket and
exists only for the login attempt.

Refresh credentials belong in the operating system credential store, scoped by Firebase
project and account. They do not belong in the state snapshot, command arguments, logs, JSON
output, or Git configuration. There is no plaintext fallback and no Admin SDK path.

The OAuth/Firebase flow currently runs only in browser and native clients, so the first
implementation milestone is a small Bun runtime spike covering sign-in restoration and a
Firestore listener. If the Firebase client SDK's Auth behavior is not viable under Bun, only
the service-side auth adapter should change; that finding does not justify changing the web
app or abandoning the resident service.

Emulator tests use explicit Auth and Firestore loopback settings and an explicit project ID.
Test credentials are accepted only while every configured emulator endpoint is loopback.

## Hydration and live state

The service has explicit readiness states: `starting`, `needs-auth`, `hydrating`, `ready`,
`offline`, and `error`. `todo service status` can always report them. Data commands normally
wait for `ready` up to a bounded timeout rather than silently returning a partially hydrated
view.

After authentication the service:

1. Loads a compatible snapshot for the Firebase project and UID, if one exists.
2. Creates a service-owned Redux store from the existing reducers and restores the saved
   projection.
3. Subscribes to the user's global `requests` query and applies the same auto-execution rules
   as the app: own actions and `accept_request`/`reject_request` acknowledgements are replayed;
   incoming unaccepted requests remain pending.
4. Adds or removes per-list listeners as the visible-list projection changes. List actions are
   ordered by Firestore `timestamp`, including the existing timestamp-zero name action.
5. Replays every action after the saved stream cursor, replaces uncertain or incompatible
   snapshot data with a clean replay, and becomes `ready` after every initially visible list
   has caught up.
6. Keeps the listeners open. Remote and local writes pass through the same snapshot handlers
   and reducers.

Replay cursors are part of the snapshot adapter, not a new domain model. A cursor must retain
enough Firestore timestamp precision and document identity to handle multiple actions at the
same timestamp. If the implementation cannot prove a cached boundary is complete, it replays
that stream from the beginning. Correctness is more important than a warm-start optimization.

The service serializes projection updates and command resolution through one queue. A command
therefore resolves list and item IDs against a coherent state version even while listener
callbacks arrive. Read handlers take a projection snapshot and do not expose mutable Redux
objects to protocol code.

### Snapshot cache

The snapshot contains only derived state required by the CLI, including item descriptions,
plus stream cursors, project ID, UID, schema version, and creation time. It excludes
credentials, pending writes, logs, UI-only state, and notification data. Because descriptions
may be sensitive, snapshot caching can be disabled and the file is treated as private user
data.

Snapshots are written after successful catch-up and then on a debounce after state changes.
The writer uses a temporary file, file sync where supported, and atomic rename; files and
parent directories are owner-only. A parse failure, unknown schema version, project/UID
mismatch, or impossible cursor discards the snapshot and triggers a clean replay.

`todo auth logout` unsubscribes, clears in-memory state, removes the account snapshot and local
credential, and leaves other accounts and browser sessions alone.

There are no offline writes in the first release. When Firestore is unavailable, status may be
`offline` and an explicitly requested cached read can be considered later, but mutations fail
without changing the local projection.

## Query path

For `todo lists`, `todo list`, and other reads:

1. The CLI connects and sends a semantic query.
2. The service requires the appropriate readiness state.
3. It resolves list names or IDs against the current projection.
4. It selects and copies the requested data from memory.
5. The CLI formats the typed result as terminal text or JSON.

No Firebase initialization, credential refresh, or action-log replay occurs in the CLI
process. Cross-list item output preserves reducer order within each list and groups by list;
it does not invent a global item order.

## Mutation path

For `todo add --list Groceries "oat milk"`:

1. The service requires `ready`, resolves the list, and confirms it is visible.
2. It validates the description and generates separate item and action UUIDs.
3. It calls the existing `create_item` action creator and adds only the existing server fields:
   `creator` and a Firestore server timestamp.
4. It writes the action at `lists/{listId}/actions/{actionId}` using the authenticated Firebase
   client SDK.
5. It waits for both the write acknowledgement and its listener to observe the same action
   document. Only then does it return the updated item.

Using a chosen action document ID makes an SDK-level retry idempotent. A request UUID is also
retained for the service process lifetime so a CLI reconnect after a dropped response does not
create a second mutation. Persisted caller-controlled idempotency can be added when there is a
concrete automation requirement.

The service does not optimistically dispatch a different local action path. This keeps the
in-memory state, the cache, and other clients aligned with the committed Firestore stream. If
the write is acknowledged but listener confirmation times out, the response reports
`commit_status_unknown` with the action ID; it must not claim the mutation failed or retry it
under a new ID.

Other mutations follow this same route and use the existing action creators. The service does
not write `activity`, editor documents, or notifications except where an existing user action
explicitly requires the same write sequence as the application.

## Security and privacy

- The command socket is local and owner-only; request sizes and connection counts are bounded.
- Every Firestore request uses a Firebase end-user identity and is checked by Firestore rules.
- The service never accepts an Admin credential or exposes a general Firestore proxy.
- Protocol errors and verbose logs never include descriptions. The optional snapshot does
  contain the projected descriptions and is protected as private user data.
- Tokens, refresh credentials, OAuth codes, PKCE verifiers, and complete Firebase responses are
  always redacted.
- Login redirect state and PKCE values are random per attempt; the temporary listener shuts
  down after one response or a short timeout.
- Snapshot paths and socket paths are scoped by local OS user and Firebase project. A UID is
  included after login so state from two Todo accounts cannot be mixed.

## Testing strategy

### Import spike

- Run the existing list, item, label, and request reducers in a Bun process without editing or
  moving those modules, and settle the `$lib` alias configuration described above.
- Initialize end-user Firebase Auth against the emulator, restore a session, and receive an
  `onSnapshot` update.
- Verify the selected Unix socket or named-pipe transport and executable packaging on the
  initially supported platforms.

The spike is a decision gate. It should produce evidence for any requested compatibility edit
rather than speculative refactoring.

### Unit tests

- Keep existing reducer tests in their current locations and run them unchanged.
- Test CLI parsing and formatting independently from the service with a fake RPC peer.
- Test method validation, exact name/ID resolution, ambiguity, readiness errors, and error-code
  mapping.
- Test snapshot versioning, atomic replacement, corrupt-cache fallback, account isolation, and
  same-timestamp cursor handling.
- Test autostart locking, protocol negotiation, request deduplication, and graceful shutdown.

### Emulator integration tests

1. Start from no snapshot, hydrate an owned list, and query it through the CLI.
2. Restart from a snapshot, append remote actions while stopped, and verify catch-up before
   `ready`.
3. Change an item from another Firebase client and verify the resident service updates without
   a CLI-triggered refresh.
4. Add, edit, complete, star, and date items through service methods and verify the existing
   reducers produce the expected state.
5. Accept a shared list as a second user and exercise permitted reads and writes.
6. Reject access without an editor document and after access is revoked.
7. Run concurrent CLI commands while listener changes arrive and verify coherent results.
8. Drop a mutation response after commit and verify retry does not duplicate the action.

One Playwright interoperability test should mutate through the CLI/service and assert that the
running web UI receives the item. Another should mutate through the web UI and assert that the
next CLI read sees it without restarting the service.

## Delivery plan

1. Complete the Bun import/Auth/listener/socket spike. Make no production refactor.
2. Add the service process, local protocol, lifecycle commands, and an in-memory projection
   backed by existing reducers.
3. Add authentication, cold hydration, live listeners, and emulator coverage.
4. Add the versioned disk snapshot and prove restart catch-up behavior.
5. Add `lists`, `list`, and `add`, including stable JSON and exit behavior.
6. Add item mutation commands through the same service interface, then list and sharing
   commands as needed.
7. Add CLI-to-web interoperability coverage and package the Bun executables.

Each implementation PR should be additive by default. Any edit outside `cli/` must explain why
the service cannot import or adapt the existing code as it stands.

## Alternatives considered

### Standalone Firebase CLI process

Authenticating and replaying on every invocation avoids lifecycle code, but it repeats the
most expensive work and makes a disk cache and live updates much less useful. It also spreads
Firebase concerns across every command.

### Extract a shared domain package first

The reducers may eventually deserve a browser-independent home, but moving them and rewiring
the existing app is not required to prove or ship this architecture. Importing them in place
keeps behavior shared without making a broad refactor a prerequisite.

### Cloud HTTP API

A hosted API would introduce a second deployed authorization and operations surface. The
locally authenticated Firebase client already receives the correct rules and Cloud Function
side effects.

### Firebase Admin SDK locally

Admin credentials would bypass Firestore rules and grant far more access than an end-user CLI
needs. They are explicitly unsupported.

### Automate the web UI

Browser automation is useful for interoperability tests, but it is too slow and fragile to be
the command implementation.

## Open questions

- Which platforms beyond macOS and Linux must the first service package support?
- Should ordinary read commands ever return cached data while offline, or should that require
  an explicit future `--stale-ok` option?
- How long should autostart and initial hydration wait before returning a service-unavailable
  error?
- Which command family should follow `lists`, `list`, and `add` first?
- Should OS login-item installation be opt-in after the autostart-on-first-command model is
  proven?
