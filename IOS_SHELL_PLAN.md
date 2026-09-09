# iOS Shell Plan

**Status:** Approved; implementation in progress

**Decision:** Keep Capacitor as TODO's iOS runtime and rebuild the existing iOS
target into a deliberate, tested shell. Borrow the deterministic project,
release, loading, recovery, and test practices from `../hunger` and
`../games/np/npa`, but do not replace Capacitor's bridge with a bespoke
`WKWebView` bridge.

The build normalization and auth/notification contract are implemented on this
branch. Physical-device acceptance remains the gate before adding shell polish,
as specified below.

## Executive summary

TODO already depends on Capacitor for more than presentation:

- Google sign-in uses `@capacitor-firebase/authentication`, obtains a native
  Google ID token, and signs the Firebase JavaScript client in with it.
- Native detection changes whether Firebase Web Messaging is initialized.
- iOS and Android use `@capacitor/push-notifications` plus
  `@capacitor-community/fcm` to obtain an FCM token and receive foreground push
  events.
- The backend stores and sends to **FCM registration tokens**, not raw APNs
  device tokens.

A Hunger-style bare `WKWebView` would therefore need a new versioned bridge for
native Google auth, APNs registration, APNs-to-FCM token mapping, token refresh,
foreground delivery, notification taps, error handling, and native-platform
detection. That is substantially more code at the most failure-prone boundary
of the app. It would also require changing working Android/web abstractions or
maintaining a second native API with equivalent semantics.

The chosen path keeps the Capacitor bridge and plugins, while making the iOS
target as intentional and reproducible as the Hunger and NPA wrappers. The
first milestone preserves the current hosted web origin and backend notification
schema. Bundling the web application for offline startup is a separate future
decision because changing the web origin affects Firebase Auth, IndexedDB, and
service-worker behavior independently of the shell.

## Reference implementations

The useful patterns in the adjacent apps are operational rather than a reason
to duplicate their exact runtime:

### Hunger

`../hunger/ios` provides:

- an explicit web-view lifecycle with loading, ready, failure, and recovery
  states;
- a narrow, versioned, validated JavaScript/native bridge;
- native unit and UI tests;
- generated project configuration;
- deterministic bundled assets and release documentation;
- notification lifecycle handling that queues an event until the web app is
  ready.

Hunger's notifications are local `UNUserNotificationCenter` schedules. They do
not solve TODO's APNs/FCM token and remote-delivery requirements.

### NPA

The likely intended reference is `../games/np/npa`; `../games/npa` does not
exist in this checkout. Its iOS app provides:

- a small SwiftUI `WKWebView` host;
- a committed, self-contained Xcode project;
- deterministic web-asset staging;
- a documented unsigned build preflight and TestFlight process.

NPA has no authentication or push-notification bridge, so its direct
`WKWebView` approach is not sufficient by itself for TODO.

## Existing notification contract

The implementation must preserve this contract before making any backend
improvements.

```text
iOS app
  -> APNs registration
  -> Firebase Messaging maps APNs identity to an FCM registration token
  -> web client writes users/{email}.notificationToken
  -> onLogin mirrors token to notifications/{uid}/tokens/{FCM_TOKEN}

Todo action in a shared list
  -> onTodoItemChanged / onTodoListShared
  -> notifyUser(uid, action)
  -> Firebase Admin sendEachForMulticast(... FCM tokens ...)
  -> FCM/APNs delivers notification to iOS
```

The outbound payload currently contains:

```ts
{
  notification: { title, body, image },
  data: { action: JSON.stringify(currentAction) }
}
```

The following are compatibility requirements:

- Store the FCM token in `users/{email}.notificationToken`; never substitute
  the raw APNs token.
- Preserve `notifications/{uid}/tokens/{token}` so one user may have multiple
  devices and existing Cloud Functions continue to work.
- Preserve the `notification` and `data.action` payload fields.
- Preserve server-side removal of invalid FCM tokens after multicast failures.
- Do not introduce a new persisted action or change action-log schemas as part
  of the shell work.
- Use bundle identifier `com.spnss.todo` under Dobutsu/SPNSS Apple team
  `ZHQLA4T47N`. The former `com.stockgamblers.todo` identifier is unavailable
  to the new team.
- Keep the existing Firebase project, but use a matching `com.spnss.todo`
  Firebase Apple app and `GoogleService-Info.plist` entry.

## Current iOS gaps

The checked-in project is a useful starting point, but it is not yet a proven
push-capable target:

1. The Xcode project declares iOS 13, while the installed Capacitor 8.5 and
   notification/authentication pods require iOS 15.
2. The target has no checked-in entitlements file and no visible Push
   Notifications capability.
3. `AppDelegate.swift` configures Firebase, but does not forward successful or
   failed APNs registration through
   `.capacitorDidRegisterForRemoteNotifications` and
   `.capacitorDidFailToRegisterForRemoteNotifications` as required by the
   installed Capacitor push plugin.
4. The web code asks for notification permission twice but never calls
   `PushNotifications.register()`.
5. It requests an FCM token before proving that APNs registration completed.
6. Registration, error, foreground, and tap listeners do not have one explicit
   lifecycle. Only the foreground listener exists, and it is installed late.
7. Token refresh/retry behavior is implicit. A failure can result in the user
   document being written with an empty token and no visible recovery path.
8. There is no iOS build job, shell smoke test, entitlement check, or physical
   device notification acceptance procedure.
9. CocoaPods transitive resolution is not pinned by a committed
   `Podfile.lock`.

These gaps should be fixed before adding native shell polish. A new SwiftUI host
would otherwise obscure whether a failure came from the host rewrite or push
configuration.

## Chosen architecture

### Native host

Retain:

- Capacitor 8;
- `CAPBridgeViewController` and Capacitor's supported plugin bridge;
- UIKit application delegate integration;
- CocoaPods for the first milestone;
- `@capacitor-firebase/authentication` for Google sign-in;
- `@capacitor/push-notifications` for permission, APNs registration, receipt,
  and action events;
- `@capacitor-community/fcm` for the FCM token expected by the backend.

Do not introduce a parallel custom `WKScriptMessageHandler`. If future native
features cannot be expressed by an existing plugin, add a narrow Capacitor
plugin with an explicit versioned API rather than a second general-purpose
bridge.

The initial target remains a normal Capacitor-generated Xcode project because
`cap sync ios` understands and maintains that structure. Do not adopt XcodeGen
or migrate CocoaPods to Swift Package Manager in the same change as push
stabilization. Either can be evaluated later as an isolated build-system change.

### Web content origin

Keep the production `server.url` at
`https://todo-firebase-1a740.web.app` for the first milestone.

This matches NPA's remote-content model and avoids silently changing:

- the origin that owns Firebase Auth and IndexedDB state;
- authorized-domain and redirect behavior;
- service-worker registration;
- cache migration and session continuity;
- the operational model in which a deployed web fix is available without an
  App Store release.

The built `webDir` remains useful for tests and a future bundled mode. A later
proposal may move production to staged, committed web assets like Hunger, but
it must include an origin/data migration and an explicit update policy.

### Notification client boundary

Move notification setup out of the root layout into a small platform adapter,
for example:

```text
src/lib/notifications/
  index.ts       chooses web, Capacitor native, or disabled implementation
  web.ts         browser permission, VAPID token, onMessage
  capacitor.ts   APNs registration, FCM token, native listeners
  types.ts       token and lifecycle interfaces
```

The root auth callback should ask the adapter for the current registration and
then persist the result. It should not directly coordinate plugin calls.

One initialization promise must be shared across Svelte remounts so listeners
are installed exactly once. The adapter returns cleanup handles for tests and
development hot reload.

The native sequence is:

1. Install `registration`, `registrationError`,
   `pushNotificationReceived`, and `pushNotificationActionPerformed` listeners.
2. Call `checkPermissions()`.
3. If status is `prompt`, call `requestPermissions()` once. Do not re-prompt a
   denied user automatically.
4. If granted, call `PushNotifications.register()`.
5. Wait for successful APNs registration before resolving the FCM token. The
   APNs token emitted by the `registration` listener is a readiness signal, not
   the token sent to TODO's backend.
6. Call `FCM.getToken()` and return the non-empty FCM token.
7. Persist it through the existing user-document write. Repeating this write is
   safe and causes `onLogin` to ensure the per-user token document exists.
8. On registration error or FCM failure, retain the signed-in session, expose a
   retryable notification status, and log a bounded diagnostic without a token.
9. Re-check registration on a later app foreground or sign-in so an APNs/FCM
   token rotation is eventually written. Do not cache a token as permanently
   valid in native storage.

Foreground receipt continues to notify the JavaScript layer. For compatibility,
the first milestone will not add a foreground system banner. Notification taps
will be observed and decoded, but no new deep-link behavior will be inferred
from the serialized action. Firestore listeners already bring the app current;
tap routing can be designed separately once list/item identifiers and behavior
are specified as a stable payload contract.

## Native project configuration

The implementation should make these settings explicit and reviewable:

- Raise `IPHONEOS_DEPLOYMENT_TARGET` to 15.0, the minimum required by the
  installed Capacitor 8 plugins. Do not drop iOS 15 users merely to match the
  higher minimums chosen by Hunger or NPA.
- Add the Push Notifications capability and a target entitlements file managed
  by Xcode signing. Verify the archived application has the correct
  `aps-environment`; do not hard-code a production entitlement into Debug.
- Keep automatic signing and the existing application/team identity unless a
  release owner deliberately changes it.
- Keep Firebase app-delegate swizzling enabled. Do not add
  `FirebaseAppDelegateProxyEnabled = NO` unless all Firebase Messaging delegate
  forwarding is implemented and tested manually.
- Keep `FirebaseApp.configure()` once at launch.
- Add both Capacitor APNs registration callbacks to `AppDelegate.swift`.
- Do not enable Background Modes merely for the current alert payload. Add
  `remote-notification` only if TODO later commits to data-only background
  processing and implements the corresponding completion-handler path.
- Commit a regenerated `Podfile.lock`; continue ignoring `Pods/`, derived data,
  archives, provisioning profiles, and credentials.
- Confirm the Apple App ID has Push Notifications enabled and that an APNs
  authentication key for the correct Apple team is uploaded to the Firebase
  project's iOS Cloud Messaging configuration. The private `.p8` key must never
  enter this repository.

Relevant platform requirements are documented by the installed plugin and by
the official [Capacitor Push Notifications API](https://capacitorjs.com/docs/apis/push-notifications),
[Firebase Cloud Messaging Apple setup](https://firebase.google.com/docs/cloud-messaging/ios/get-started),
and [Apple APNs registration documentation](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns).

## Deliberate shell improvements

After a real-device push passes on the minimally changed Capacitor target, add
the shell qualities borrowed from Hunger/NPA without replacing the bridge:

- a branded launch screen and canonical asset-catalog app icon;
- correct safe-area and keyboard behavior on iPhone and iPad;
- a native loading state until the hosted app completes initial navigation;
- a bounded retry/error screen for initial network or web-process failure;
- external-link policy that opens untrusted origins in the system browser while
  allowing Firebase/Google authentication callbacks required by the plugins;
- web-process recovery without clearing Firebase/IndexedDB state;
- Debug-only Web Inspector support and no production debugging affordance;
- explicit version/build metadata and release preflight documentation.

Prefer a small `CAPBridgeViewController` subclass or supported Capacitor hooks
for these improvements. Do not fork Capacitor internals. Each improvement must
be independently removable if it interferes with authentication or push.

## Build and repository workflow

Add scripts with single purposes, modeled on the adjacent projects:

```text
npm run ios:sync       install/sync the version-locked Capacitor plugins
npm run ios:build      unsigned simulator and generic-device build preflight
npm run ios:test       Swift/native shell tests on a named simulator
npm run ios:open       open the committed workspace
```

Rules:

- `package-lock.json` and `Podfile.lock` define dependency resolution.
- Open `ios/App/App.xcworkspace`, not only the `.xcodeproj`, while CocoaPods is
  in use.
- A clean checkout followed by the documented sync command must produce no
  unexplained tracked diff.
- Any generated `ios/App/App/public` payload remains ignored unless a later
  bundled-web proposal deliberately changes that ownership model.
- Build scripts must accept an explicit `DEVELOPER_DIR` rather than relying on
  a developer's global selection.
- Add a macOS CI job for dependency sync, a simulator build, and native unit
  tests. Do not put real APNs credentials in pull-request CI.

## Test strategy

### JavaScript tests

Mock the notification adapter and cover:

- web, native, and disabled selection;
- listener installation before registration;
- prompt/granted/denied permission states;
- exactly one permission request;
- APNs readiness followed by FCM token retrieval;
- rejection, timeout, and later retry;
- repeated initialization without duplicate listeners;
- persistence of the FCM token, never the APNs token;
- foreground receipt and tap payload decoding without mutating the action log.

### Native tests

Add focused tests or injectable seams for:

- app-delegate forwarding of APNs registration success and failure;
- initial navigation allow-list behavior;
- loading, failure, retry, and web-process recovery states;
- preservation of the Capacitor bridge/controller class;
- configuration consistency among bundle ID, Firebase plist, entitlements, and
  deployment target.

Add one simulator UI smoke test that launches the shell, reaches TODO's sign-in
screen, and verifies a controlled initial-load failure is recoverable. Simulator
tests do not count as evidence of APNs delivery.

### Physical-device notification acceptance

Before TestFlight, verify on a signed physical device using two accounts and a
shared list:

1. Install cleanly and sign in with Google.
2. Grant notification permission once.
3. Confirm an FCM token is written to `users/{email}.notificationToken` and
   mirrored under `notifications/{uid}/tokens/{token}`.
4. Confirm the stored value is the FCM token returned by the plugin, not the
   APNs token emitted by Capacitor registration.
5. From the second account, create and complete an item in the shared list.
6. With TODO in the foreground, confirm the native receipt callback fires and
   the Firestore UI updates.
7. With TODO backgrounded, confirm the system notification is displayed.
8. Tap it and confirm TODO foregrounds without losing auth or corrupting
   navigation.
9. Terminate TODO, send another notification, tap it, and confirm a cold launch
   reaches a signed-in, synchronized state.
10. Relaunch and confirm registration is idempotent.
11. Reinstall or otherwise rotate the token, then confirm the new token is
    persisted and receives a notification.
12. Deny permission on a clean install and confirm the rest of the app works,
    no repeated prompt appears, and settings can be used to recover.

Capture redacted evidence of the state transitions, but never commit full FCM
or APNs tokens.

### Release preflight

For every archive, verify:

- bundle ID and signing team;
- marketing version and monotonically increasing build number;
- iOS 15 minimum deployment target;
- production `aps-environment` in the signed archive;
- embedded `GoogleService-Info.plist` bundle ID;
- expected Capacitor, auth, push, and FCM frameworks only;
- no private keys, provisioning profiles, development server URL, emulator
  configuration, or test credentials;
- Google sign-in and the physical-device notification matrix on the candidate
  build.

## Implementation sequence and commits

Keep implementation reviewable in this order:

1. **Normalize the iOS build.** Raise the deployment target, regenerate the
   Capacitor project integration, commit `Podfile.lock`, add scripts, and prove
   clean simulator/device builds without changing runtime behavior.
2. **Make notification registration correct.** Add capability/entitlements and
   app-delegate forwarding; fix listener, permission, registration, FCM-token,
   retry, and cleanup ordering behind the notification adapter.
3. **Add automated contract tests.** Cover the adapter, native configuration,
   shell launch, and failure recovery.
4. **Prove end-to-end push on hardware.** Record redacted results for
   foreground, background, terminated, denied, and rotated-token cases.
5. **Add shell polish.** Introduce native loading/recovery and navigation policy
   one small change at a time, rerunning Google sign-in and push acceptance
   after each.
6. **Document TestFlight release.** Add the release checklist and archive
   inspection steps only after the candidate behaves correctly on hardware.

Do not mix a web-origin migration, FCM backend rewrite, SwiftUI conversion,
XcodeGen adoption, SPM migration, or notification deep links into these commits.

## Rollout and rollback

- Ship first through an internal TestFlight group.
- Use the same bundle ID and Firebase iOS app so existing installations upgrade
  normally.
- The server accepts multiple tokens, so old and candidate installations may
  coexist during rollout.
- Watch Firebase Messaging failures and invalid-token pruning after rollout.
- Roll back by distributing the previous TestFlight/App Store build; no backend
  schema rollback is required because the token and payload contracts are
  unchanged.
- If native notification initialization fails, the app must still sign in and
  synchronize TODO data. Notification failure is degraded functionality, not a
  launch blocker.

## Deferred work

- A custom SwiftUI/`WKWebView` replacement for Capacitor.
- Bundling the production web app and migrating its origin/state.
- XcodeGen or Swift Package Manager migration.
- Data-only/background pushes.
- Notification categories, actions, badges, or deep-link routing.
- Backend token schema changes, explicit sign-out token revocation, and token
  preference UI.
- App Store submission automation.

These may be valuable, but none is required to produce a maintainable iOS shell
that continues to work with TODO's existing remote-notification system.

## Review decision

Approval of this plan means approval of these defaults:

- Capacitor remains the bridge and host runtime.
- Production initially continues to load the hosted Firebase site.
- iOS 15 is the minimum supported version.
- CocoaPods remains the package manager for the first milestone.
- Existing FCM token storage and notification payloads remain unchanged.
- Foreground notifications update/log through the app but do not add a new
  system banner.
- Notification taps foreground and synchronize the app but do not introduce a
  new deep-link contract.

Any change to those defaults should be resolved in review before implementation.
