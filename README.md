# create-svelte

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

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

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

> To deploy your app, you may need to install an [adapter](https://kit.svelte.dev/docs/adapters) for your target environment.

## Deployment

This project uses GitHub Actions for automated deployments:

- **PR Previews**: Every pull request triggers a preview deployment to Firebase Hosting. See [docs/PR_HOSTING_SETUP.md](docs/PR_HOSTING_SETUP.md) for setup instructions.
- **Production Deployments**: Merges to the `main` branch trigger a full deployment (Hosting, Functions, Firestore). See [docs/FIREBASE_ADMIN_SETUP.md](docs/FIREBASE_ADMIN_SETUP.md) for the necessary administrative setup.
