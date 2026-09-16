# iOS development and release

TODO keeps Capacitor as its iOS host because native Google authentication and
Firebase Cloud Messaging already depend on its supported plugin bridge. The app
loads the production site at `https://todo-firebase-1a740.web.app`. Its Dobutsu
iOS identity is `com.spnss.todo`; Android retains its existing
`com.stockgamblers.todo` identity.

## Prerequisites

- Xcode with an iOS simulator runtime
- access to Dobutsu/SPNSS Apple team `ZHQLA4T47N` for a signed device build
- Node.js 22 and npm
- CocoaPods, either installed locally or supplied by `nix develop`
- a physical device registered with the Apple team for push testing

Never add an APNs `.p8` key, provisioning profile, FCM token, or APNs token to
the repository or to a test artifact.

## Dobutsu one-time setup

The Apple bundle ID `com.spnss.todo` is registered to team `ZHQLA4T47N` with
Push Notifications enabled. Firebase project `todo-firebase-1a740` contains the
matching Apple app named `Todo (Dobutsu)`, and its generated configuration is
committed as `GoogleService-Info.plist`.

Before the first TestFlight upload, create the initial app record manually in
App Store Connect because Apple does not provide a supported API for that
one-time operation:

- platform: iOS
- name: Todo
- bundle ID: `com.spnss.todo`
- SKU: `todo-ios`
- primary language: English (Canada)
- user access: Full Access

The APNs authentication key is separate from the App Store Connect API key used
by release automation. TODO's current team-scoped sandbox-and-production key is
`B953ZM4LJZ`. Its private material is committed only as
`ios/secrets/apns.enc.json`, encrypted for the Alex and Andrew SSH recipients in
`.sops.yaml`.

Install the encrypted key on a new development machine and mirror it into the
repository's GitHub Actions secrets with:

```sh
nix develop
npm run ios:push:configure
```

The command validates the private key, writes it to
`~/.config/todo/private_keys/AuthKey_B953ZM4LJZ.p8` with owner-only
permissions, and updates `TODO_APNS_AUTH_KEY_P8`, `TODO_APNS_KEY_ID`, and
`TODO_APPLE_TEAM_ID` through the authenticated GitHub CLI. The SOPS document is
the recoverable source; GitHub Actions secrets are write-only workflow inputs,
not a backup.

If the APNs key is ever rotated, use the **Dobutsu** browser profile to create a
team-scoped APNs key for both sandbox and production in Apple Developer, then
replace the encrypted document and the local/GitHub copies in one command:

```sh
npm run ios:push:configure -- \
  --import ~/Downloads/AuthKey_NEWKEYID.p8 \
  --key-id NEWKEYID \
  --team-id ZHQLA4T47N
```

Apple allows the `.p8` download only once. Do not leave it in Downloads after
the command succeeds. Review and commit the changed encrypted SOPS file; never
commit the downloaded plaintext key.

Firebase's documented APNs-key setup remains a console upload rather than a
supported Firebase CLI operation. If the Firebase credential is absent or the
key was rotated, use the **Alex (stockgamblers.com)** browser profile, open the
[Cloud Messaging settings](https://console.firebase.google.com/project/todo-firebase-1a740/settings/cloudmessaging),
select `Todo (Dobutsu)` / `com.spnss.todo`, and upload the installed key to both
the development and production APNs auth-key rows with its key ID and team ID.
Firebase documents the same development/production upload boundary in its
[Apple-platform FCM setup](https://firebase.google.com/docs/cloud-messaging/ios/get-started#upload_your_apns_authentication_key).

## Repeatable commands

From the repository root:

```sh
npm ci
npm run ios:sync
npm run ios:verify
npm run ios:test
npm run ios:build
npm run ios:open
```

Open `ios/App/App.xcworkspace`, not the `.xcodeproj`. `DEVELOPER_DIR` may be set
to select a non-default Xcode installation. `ios:test` selects the first
available iPhone simulator; set `TODO_IOS_SIMULATOR_ID` to select one explicitly.

For a phone connected to Xcode, find its destination identifier and build:

```sh
xcrun devicectl list devices
TODO_IOS_DEVICE_ID=00000000-0000000000000000 TODO_IOS_INSTALL=1 npm run ios:device
```

By default the command only builds. `TODO_IOS_INSTALL=1` also installs and
launches the app over the connected development-device transport. The signed
result is `ios/DerivedData/device/Build/Products/Debug-iphoneos/App.app`. Xcode
can install and run it from the workspace. The script uses the installed
development profile named `TODO USB Development` by default; set
`TODO_IOS_PROFILE_NAME` or `TODO_IOS_PROFILE_PATH` to select a replacement.
Profiles and signing keys stay outside the repository.

## Why Google sign-in uses two layers

The Capacitor Firebase Authentication plugin presents Google's native sign-in
UI and returns an ID token. `skipNativeAuth` must remain `true`: the hosted
Firebase JavaScript client exchanges that token for its own credential and owns
the session used by Firestore. Setting it to `false` can leave the native SDK
signed in while the hosted TODO UI still appears signed out.

Before diagnosing code, verify that:

- `GoogleService-Info.plist` belongs to `com.spnss.todo`;
- its reversed client ID is present in `Info.plist` URL schemes;
- the OAuth client remains enabled in the Firebase/Google project;
- the device can reach Google and the hosted TODO origin.

## Push setup and device acceptance

The Apple App ID must have Push Notifications enabled. Firebase Cloud Messaging
must have an APNs authentication key for the same Apple team. The key is managed
in Firebase; only its SOPS-encrypted recovery copy is part of the repository.

After changing the credential, send a real notification without copying an FCM
token or editing Firestore by hand:

```sh
npm run ios:push:verify -- anicolao@gmail.com
```

The verifier resolves the user's UID and registration-token documents, sends
through the FCM v1 API, and reports only token counts, indexes, and error codes.
It never prints an FCM token. It uses a service account when supplied by CI and
otherwise uses the Firebase CLI login selected by `TODO_FIREBASE_ACCOUNT`.

The same check can run entirely through GitHub after this workflow reaches the
default branch:

```sh
gh workflow run ios-push-smoke.yml -f target_email=anicolao@gmail.com
gh run watch
```

An all-success FCM result proves that Google accepted delivery for every stored
token and catches errors such as `messaging/third-party-auth-error`. It cannot
prove that iOS presented a banner. Background, foreground, tap, and terminated
app behavior still require the physical-device acceptance pass below.

On a clean physical-device install:

1. Sign in with Google and grant notification permission once.
2. Confirm `users/{email}.notificationToken` receives an FCM token and that the
   existing login function mirrors it under
   `notifications/{uid}/tokens/{token}`. Do not record the token itself.
3. From a second account sharing a list, create or complete an item.
4. Verify foreground receipt, background display, notification tap, and a tap
   from a terminated state.
5. Verify TODO remains signed in and synchronized after each transition.
6. Relaunch to prove registration is idempotent, then verify a rotated token is
   persisted and receives a notification.
7. Repeat on a clean install with permission denied. The app must remain usable
   and must not repeatedly prompt.

Simulator launch success is useful shell coverage but is not evidence that APNs
or Google native sign-in works.

## Archive preflight

Todo uses the same local App Store Connect handoff as Player. Configure it once:

```sh
scripts/configure-ios-testflight-handoff.sh
```

The helper stores the API private key under
`~/.appstoreconnect/private_keys/` and the Todo-specific identifiers under
`~/.config/todo/testflight.env`, both outside the repository. A team API key
already installed for another app can be reused by entering its existing path.

To archive and validate the next monotonically increasing build number:

```sh
npm run ios:testflight
```

Validation does not upload by default. Upload the same build by setting:

```sh
TODO_IOS_UPLOAD=1 npm run ios:testflight
```

The release command uses automatic signing, validates the distribution-signed
app inside the IPA and the IPA itself with App Store Connect, and leaves its output under
`ios/DerivedData/testflight/`. After Apple finishes processing the upload, add
the build to the configured internal TestFlight group.

Before internal TestFlight distribution:

- increment the build number and confirm the marketing version;
- use the production hosted origin and iOS 15 minimum;
- archive with bundle ID `com.spnss.todo` and Apple team `ZHQLA4T47N`;
- inspect the signed app and confirm `aps-environment` is `production`;
- confirm the embedded Firebase plist bundle ID and Google URL scheme;
- confirm no local server URL, test account, private key, token, or development
  provisioning material is in the archive;
- rerun Google sign-in and the physical-device notification matrix on the exact
  candidate build.

If notification initialization fails, sign-in and TODO synchronization must
continue. Push is degraded functionality, not a launch requirement.
