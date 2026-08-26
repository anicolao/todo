# todo

[![CI](https://github.com/anicolao/todo/actions/workflows/ci.yml/badge.svg)](https://github.com/anicolao/todo/actions/workflows/ci.yml)

Everything you need to build a Svelte project, powered by [`create-svelte`](https://github.com/sveltejs/kit/tree/master/packages/create-svelte).

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

Run the launch test in a clean, headless emulator with:

```bash
npm run android:test:emulator
```

The test requires Linux KVM access. It creates an API 36 AVD under the ignored
`.android/` directory and saves its launch screenshot to
`test-results/android-emulator/app-launch.png`. CI runs the same test and uploads
the screenshot and emulator log as build artifacts.

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
