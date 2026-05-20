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
