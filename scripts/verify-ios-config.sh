#!/bin/sh

set -eu
. "$(dirname "$0")/ios-common.sh"

TODO_IOS_PROJECT="ios/App/App.xcodeproj/project.pbxproj"
TODO_IOS_INFO="ios/App/App/Info.plist"
TODO_IOS_FIREBASE="ios/App/App/GoogleService-Info.plist"
TODO_IOS_ENTITLEMENTS="ios/App/App/App.entitlements"
TODO_IOS_APP_DELEGATE="ios/App/App/AppDelegate.swift"
TODO_PLIST_BUDDY="/usr/libexec/PlistBuddy"

fail() {
	echo "iOS configuration check failed: $1" >&2
	exit 1
}

plist_value() {
	"$TODO_PLIST_BUDDY" -c "Print :$2" "$1"
}

[ -x "$TODO_PLIST_BUDDY" ] || fail "PlistBuddy is unavailable."

firebase_bundle_id="$(plist_value "$TODO_IOS_FIREBASE" BUNDLE_ID)"
reversed_client_id="$(plist_value "$TODO_IOS_FIREBASE" REVERSED_CLIENT_ID)"
url_scheme="$(plist_value "$TODO_IOS_INFO" CFBundleURLTypes:0:CFBundleURLSchemes:0)"
aps_environment="$(plist_value "$TODO_IOS_ENTITLEMENTS" aps-environment)"
uses_non_exempt_encryption="$(plist_value "$TODO_IOS_INFO" ITSAppUsesNonExemptEncryption)"

[ "$firebase_bundle_id" = "com.spnss.todo" ] || fail "unexpected Firebase bundle ID."
[ "$url_scheme" = "$reversed_client_id" ] || fail "Google callback URL scheme does not match Firebase."
[ "$aps_environment" = '$(APS_ENVIRONMENT)' ] || fail "aps-environment must come from the build configuration."
[ "$uses_non_exempt_encryption" = "false" ] || fail "TestFlight encryption declaration is missing."

build_settings="$(
	xcodebuild \
		-workspace "$TODO_IOS_WORKSPACE" \
		-scheme "$TODO_IOS_SCHEME" \
		-configuration Debug \
		-sdk iphoneos \
		-destination 'generic/platform=iOS' \
		-showBuildSettings 2>/dev/null
)"

setting() {
	printf '%s\n' "$build_settings" | sed -n "s/^[[:space:]]*$1 = //p" | head -n 1
}

[ "$(setting PRODUCT_BUNDLE_IDENTIFIER)" = "$firebase_bundle_id" ] || fail "Xcode and Firebase bundle IDs differ."
[ "$(setting IPHONEOS_DEPLOYMENT_TARGET)" = "15.0" ] || fail "deployment target is not iOS 15."
[ "$(setting CODE_SIGN_ENTITLEMENTS)" = "App/App.entitlements" ] || fail "the app target does not use App.entitlements."
[ "$(setting APS_ENVIRONMENT)" = "development" ] || fail "Debug does not request the development APNs environment."

grep -Fq 'APS_ENVIRONMENT = production;' "$TODO_IOS_PROJECT" || fail "Release does not request the production APNs environment."
grep -Fq 'com.apple.Push' "$TODO_IOS_PROJECT" || fail "Push Notifications capability is missing."
grep -Fq '.capacitorDidRegisterForRemoteNotifications' "$TODO_IOS_APP_DELEGATE" || fail "APNs success is not forwarded to Capacitor."
grep -Fq '.capacitorDidFailToRegisterForRemoteNotifications' "$TODO_IOS_APP_DELEGATE" || fail "APNs failure is not forwarded to Capacitor."
grep -Fq 'skipNativeAuth: true' capacitor.config.ts || fail "native Google sign-in must hand its ID token to Firebase JS auth."
grep -Fq "https://todo-firebase-1a740.web.app" capacitor.config.ts || fail "the production hosted origin is missing."
grep -Fq '"appId": "com.spnss.todo"' ios/App/App/capacitor.config.json || fail "the generated iOS Capacitor app ID is incorrect."

if grep -Fq 'FirebaseAppDelegateProxyEnabled' "$TODO_IOS_INFO"; then
	fail "Firebase app-delegate swizzling must remain enabled."
fi

echo "iOS configuration is consistent (bundle ID, Google callback, iOS 15, auth, and APNs)."
