# Firebase Production Deployment Setup

This guide describes how to create and configure a service account with the necessary permissions for full production deployments, including Firebase Hosting, Cloud Functions, and Firestore.

## Prerequisites

- Access to the [Firebase Console](https://console.firebase.google.com/) for your project.
- Owner or IAM Admin permissions on the associated Google Cloud project.

## Step 1: Create a Service Account

1.  Open the [Google Cloud Console IAM & Admin - Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) page.
2.  Select your Firebase project from the project selector at the top.
3.  Click **+ CREATE SERVICE ACCOUNT**.
4.  Enter a name (e.g., `github-actions-deployer`) and an optional description.
5.  Click **CREATE AND CONTINUE**.

## Step 2: Assign Necessary Roles

In the **Grant this service account access to project** section, add the following roles:

- **Firebase Admin**: Provides broad access to Firebase resources (Hosting, Firestore, etc.).
- **Service Account User**: Required to deploy Cloud Functions.
- **Cloud Build Editor**: Required for the build step of Cloud Functions.
- **Artifact Registry Administrator**: Required to store the function images.

_Note: If you have a highly complex setup, you might need additional roles like "API Gateway Admin" or "Secret Manager Secret Accessor", but the above are the standard requirements for a full Firebase CLI deployment._

Click **CONTINUE** and then **DONE**.

## Step 3: Generate a JSON Key

1.  In the Service Accounts list, click on the newly created service account.
2.  Navigate to the **KEYS** tab.
3.  Click **ADD KEY** -> **Create new key**.
4.  Select **JSON** and click **CREATE**.
5.  Save the downloaded JSON file securely. **Do not commit this file to version control.**

## Step 4: Add the Secret to GitHub

1.  In your GitHub repository, go to **Settings** -> **Secrets and variables** -> **Actions**.
2.  Click **New repository secret**.
3.  Name the secret `FIREBASE_SERVICE_ACCOUNT`.
4.  Open the downloaded JSON key file, copy its entire contents, and paste them into the **Secret** field.
5.  Click **Add secret**.

## Verification

The production deploy workflow (typically `.github/workflows/production-deploy.yml`) will now use this secret to authenticate with Firebase and perform the deployment.

---

For simpler setups like PR Previews (Hosting only), see [PR_HOSTING_SETUP.md](./PR_HOSTING_SETUP.md).
