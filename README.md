# todo

[![CI](https://github.com/anicolao/todo/actions/workflows/ci.yml/badge.svg)](https://github.com/anicolao/todo/actions/workflows/ci.yml)

Everything you need to build a Svelte project, powered by [`create-svelte`](https://github.com/sveltejs/kit/tree/master/packages/create-svelte).

## Command-line client

Run the Todo CLI directly from GitHub with Nix:

```bash
nix run github:anicolao/todo#todo -- help
nix run github:anicolao/todo#todo -- today
```

The flake bundles both the short-lived `todo` command and the resident local service; ordinary
commands start the service automatically. Install it persistently with
`nix profile install github:anicolao/todo#todo`. See [cli/README.md](cli/README.md) for login,
configuration, and local-state details.

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npm create svelte@latest

# create a new project in my-app
npm create svelte@latest my-app
```

## Developing

Enter the Nix shell to get Node.js and Google Cloud tooling, then install npm dependencies:

```bash
nix develop
npm ci
```

Start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

## Android

The Nix development shell provides Java, the Android SDK, build tools, and a pinned
API 36 Google APIs emulator image. Build fresh Android artifacts with:

```bash
nix develop
npm ci
npm run android:build
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk` and
the release bundle to `android/app/build/outputs/bundle/release/app-release.aab`.
The native shell loads `https://todo-firebase-1a740.web.app` at runtime, so deploying
the website updates the app without rebuilding the APK. The website retains control
of its existing caching and service-worker behavior.

Run the Android task-lifecycle E2E test in a clean, headless emulator with:

```bash
npm run android:test:emulator
```

The test requires Linux KVM access. It starts isolated Firebase Auth and Firestore
emulators, builds the web app with deterministic test settings, wipes and starts the
pinned API 36 AVD, then drives the Android app through the same eight task-lifecycle
states as `tests/e2e/005-task-lifecycle`. Every WebView screenshot is compared to its
committed baseline with exactly zero differing pixels. Actual screenshots, pixel diffs,
and service logs are written to `test-results/android-emulator/`; CI runs the same
command and uploads that directory as a build artifact.

After intentionally changing the UI, inspect and update the Android baselines with:

```bash
npm run android:test:emulator -- --update-screenshots
```

The committed baselines are in
`android/app/src/androidTest/assets/android-e2e/`, and the test implementation is
`android/app/src/androidTest/java/com/stockgamblers/todo/AndroidTaskLifecycleE2ETest.java`.

Once a physical device has USB debugging enabled, install the debug build with:

```bash
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## Firebase deploy credentials

Check that a Firebase deploy service account can see the project, has the required IAM permissions, and can inspect the configured Cloud Functions:

```bash
npm run deploy:preflight -- path/to/service-account.json
```

The same check can use the GitHub secret value directly:

```bash
FIREBASE_SERVICE_ACCOUNT="$(cat path/to/service-account.json)" npm run deploy:preflight
```

Deploys use the explicit production target:

```bash
npm run deploy
```

The deploy script installs `functions/` dependencies before invoking Firebase so the functions predeploy lint and build hooks work from a fresh clone. It also treats Firebase function deployment errors in the CLI output as fatal, even if the Firebase CLI exits successfully.

## Deployment Setup

For detailed instructions on setting up the necessary Firebase and Google Cloud permissions for production deployments, see [docs/FIREBASE_ADMIN_SETUP.md](docs/FIREBASE_ADMIN_SETUP.md).
