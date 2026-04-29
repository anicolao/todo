# Setting up PR Previews with Firebase Hosting

To enable automated PR Previews, you need to set up a service account in Firebase and add it as a secret to your GitHub repository.

## Steps

1.  **Open the Firebase Console**
    Go to [https://console.firebase.google.com/](https://console.firebase.google.com/).

2.  **Select the project**
    Select the project `todo-firebase-1a740`.

3.  **Navigate to Service Accounts**
    Go to **Project Settings** (gear icon) -> **Service Accounts**.

4.  **Verify Permissions**
    - For **PR Previews** (Hosting only), ensure the service account has the **Firebase Hosting Admin** role.
    - For **Production Deployments** (Full deploy including Functions and Firestore), a more comprehensive set of permissions is required. Please refer to [FIREBASE_ADMIN_SETUP.md](./FIREBASE_ADMIN_SETUP.md) for detailed instructions.

5.  **Generate Private Key**
    Click **Generate new private key**, then click **Generate key** to download the JSON file.

6.  **Add Secret to GitHub**
    In your GitHub repository, go to **Settings** -> **Secrets and variables** -> **Actions**.

7.  **Create New Secret**
    Click **New repository secret**.

8.  **Configure the Secret**
    Name it `FIREBASE_SERVICE_ACCOUNT` and paste the entire content of the downloaded JSON file.

Once this secret is added, any new or updated Pull Request will automatically trigger a preview deployment.
