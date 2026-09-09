# iOS development and release

TODO keeps Capacitor as its iOS host because native Google authentication and
Firebase Cloud Messaging already depend on its supported plugin bridge. The app
loads the production site at `https://todo-firebase-1a740.web.app` and keeps the
bundle identifier `com.stockgamblers.todo`.

## Prerequisites

- Xcode with an iOS simulator runtime
- access to Apple team `Q3Q9984929` for a signed device build
- Node.js 22 and npm
- CocoaPods, either installed locally or supplied by `nix develop`
- a physical device registered with the Apple team for push testing

Never add an APNs `.p8` key, provisioning profile, FCM token, or APNs token to
the repository or to a test artifact.

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
TODO_IOS_DEVICE_ID=00000000-0000000000000000 npm run ios:device
```

The signed result is
`ios/DerivedData/device/Build/Products/Debug-iphoneos/App.app`. Xcode can install
and run it from the workspace, or it can be installed with `xcrun devicectl`
after the device has trusted the development team.

## Why Google sign-in uses two layers

The Capacitor Firebase Authentication plugin presents Google's native sign-in
UI and returns an ID token. `skipNativeAuth` must remain `true`: the hosted
Firebase JavaScript client exchanges that token for its own credential and owns
the session used by Firestore. Setting it to `false` can leave the native SDK
signed in while the hosted TODO UI still appears signed out.

Before diagnosing code, verify that:

- `GoogleService-Info.plist` belongs to `com.stockgamblers.todo`;
- its reversed client ID is present in `Info.plist` URL schemes;
- the OAuth client remains enabled in the Firebase/Google project;
- the device can reach Google and the hosted TODO origin.

## Push setup and device acceptance

The Apple App ID must have Push Notifications enabled. Firebase Cloud Messaging
must have an APNs authentication key for the same Apple team. The key is managed
in Firebase and is not part of the app repository.

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

Before internal TestFlight distribution:

- increment the build number and confirm the marketing version;
- use the production hosted origin and iOS 15 minimum;
- archive with bundle ID `com.stockgamblers.todo` and the expected Apple team;
- inspect the signed app and confirm `aps-environment` is `production`;
- confirm the embedded Firebase plist bundle ID and Google URL scheme;
- confirm no local server URL, test account, private key, token, or development
  provisioning material is in the archive;
- rerun Google sign-in and the physical-device notification matrix on the exact
  candidate build.

If notification initialization fails, sign-in and TODO synchronization must
continue. Push is degraded functionality, not a launch requirement.
