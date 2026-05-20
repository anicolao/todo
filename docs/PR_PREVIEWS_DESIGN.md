# PR Previews Design

## Objective

Provide a way to test Pull Request (PR) changes in a production-like environment before merging them into the main branch. This allows for manual verification and stakeholder review on a live URL.

## Technology Selection

- **GitHub Actions**: For automating the build and deployment process.
- **Firebase Hosting Preview Channels**: To host temporary versions of the site for each PR.

## Workflow Details

1. **Trigger**: The workflow will trigger on `pull_request` events, specifically when a PR is `opened`, `synchronized`, or `reopened`.
2. **Build Process**:
   - Install dependencies: `npm ci`
   - Build the application: `npm run build`
3. **Deployment**:
   - Use the official `FirebaseExtended/action-hosting-deploy` GitHub Action.
   - Deploy to a Firebase Hosting preview channel.
4. **Communication**:
   - The action will automatically comment on the PR with the preview URL once the deployment is successful.

## Security and Secrets

- A `FIREBASE_SERVICE_ACCOUNT` secret must be added to the GitHub repository. This service account should have the necessary permissions to deploy to Firebase Hosting.

## Cleanup

- Firebase Hosting automatically handles the cleanup of preview channels. When a PR is closed, the associated preview channel and its temporary URL are eventually deleted, ensuring no orphaned resources remain.
