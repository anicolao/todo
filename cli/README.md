# Todo CLI

The Todo CLI is a short-lived client for a resident local service. The service signs in as a
normal Firebase user, keeps the existing Redux projection hydrated through Firestore
listeners, and appends the same actions as the web application.

## Run from the repository

Bun 1.3.10 or newer is required.

```sh
npm ci
npm run todo -- service start
npm run todo -- auth login
npm run todo -- lists
npm run todo -- add --list Groceries "oat milk"
npm run todo -- list --list Groceries
npm run todo -- today
npm run todo -- search "oat milk"
```

`npm link` exposes the root package's `todo` and `todo-service` binaries for local development.
Ordinary commands start the service automatically, so an explicit `service start` is optional.

## Run with Nix

The root flake packages the CLI and its resident service as the default app and as the `todo`
app. Once this branch is merged, run either form directly from GitHub:

```sh
nix run github:anicolao/todo -- help
nix run github:anicolao/todo#todo -- today
```

To try the pull-request branch before it is merged:

```sh
nix run 'github:anicolao/todo?ref=agent/cli-design#todo' -- help
```

Nix caches the built package, while the service continues to keep its writable configuration,
credentials, logs, and snapshot in the platform-specific locations described below. Install the
command into your profile with `nix profile install github:anicolao/todo#todo`.

The Nix package also contains the production OAuth client configuration encrypted with SOPS for
Alex's and Andrew's GitHub SSH keys. SOPS automatically tries `~/.ssh/id_ed25519` and
`~/.ssh/id_rsa`. When the matching private key has another name, select it explicitly:

```sh
SOPS_AGE_SSH_PRIVATE_KEY_FILE=~/.ssh/other_key nix run github:anicolao/todo -- auth login
```

Only the encrypted document enters Git and the Nix store. The launcher decrypts it into its
process environment, and the resident service inherits it without writing the OAuth values to
disk. To rotate or add recipients, update `.sops.yaml` and run
`sops updatekeys cli/secrets/oauth.enc.json`.

Item commands currently include `add`, `list`, `complete`, `uncomplete`, `edit`, `star`,
`unstar`, `due`, and `undue`. Run `todo help` for their arguments. Item IDs may be shortened to
an unambiguous prefix.

Human-readable command output is Markdown. When stdout is an interactive terminal and `glow` is
installed, the CLI renders that Markdown automatically; redirected output remains plain Markdown.
Use `--verbose` to include IDs, state, due dates, and list types, or `--json` for structured output.

## Production login

Repository and Bun-based development still reads the Google OAuth desktop client from the
environment:

```sh
export TODO_GOOGLE_CLIENT_ID=example.apps.googleusercontent.com
todo auth login
```

The CLI prints the Google authorization URL before waiting and also attempts to open it in the
desktop browser. Use `todo auth login --no-open` to suppress the automatic browser launch and
paste the printed URL into a browser on the same machine. When running over SSH, the callback
URL's displayed port must be forwarded to the remote machine before opening it locally.

Set `TODO_GOOGLE_CLIENT_SECRET` only when the client registration requires it. The Google
refresh credential is stored in macOS Keychain or the Linux Secret Service; it is not written
to the Todo snapshot. Linux requires `secret-tool`.

## Emulator login

The emulator path accepts email/password credentials only when every endpoint is loopback:

```sh
export TODO_FIREBASE_EMULATOR=true
export TODO_AUTH_EMAIL=cli@example.test
export TODO_AUTH_PASSWORD=test-password
todo service stop
todo service start
```

The service uses Auth at `127.0.0.1:9099` and Firestore at `127.0.0.1:8080` by default. Override
them with `TODO_AUTH_EMULATOR_URL`, `TODO_FIRESTORE_EMULATOR_HOST`, and
`TODO_FIRESTORE_EMULATOR_PORT`.

## Local data

The owner-only Unix socket lives below `XDG_RUNTIME_DIR` when available and otherwise in the
system temporary directory. Configuration, logs, and the optional derived-state snapshot use
`~/Library/Application Support/todo-cli` on macOS or `XDG_STATE_HOME/todo-cli` on Linux.

`TODO_CLI_HOME` and `TODO_CLI_RUNTIME_DIR` override those locations for testing. Snapshots
contain task descriptions and should be treated as private user data. Firestore remains the
source of truth; there is no offline write queue. Set `TODO_CLI_DISABLE_SNAPSHOT=true` before
starting the service to disable the disk snapshot.
