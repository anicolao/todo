#!/bin/sh

set -eu
. "$(dirname "$0")/ios-common.sh"

if [ -z "${TODO_IOS_DEVICE_ID:-}" ]; then
	echo "Set TODO_IOS_DEVICE_ID to the Xcode destination identifier for the phone." >&2
	echo "Find it with: xcrun devicectl list devices" >&2
	exit 1
fi

find_profile() {
	profile_name="$1"
	for profile_directory in \
		"$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles" \
		"$HOME/Library/MobileDevice/Provisioning Profiles"
	do
		[ -d "$profile_directory" ] || continue
		for candidate in "$profile_directory"/*.mobileprovision; do
			[ -f "$candidate" ] || continue
			candidate_name="$(
				security cms -D -i "$candidate" 2>/dev/null |
					plutil -extract Name raw -o - - 2>/dev/null || true
			)"
			if [ "$candidate_name" = "$profile_name" ]; then
				printf '%s\n' "$candidate"
				return 0
			fi
		done
	done
	return 1
}

profile_name="${TODO_IOS_PROFILE_NAME:-TODO USB Development}"
profile_path="${TODO_IOS_PROFILE_PATH:-}"
if [ -z "$profile_path" ]; then
	profile_path="$(find_profile "$profile_name")" || {
		echo "No installed provisioning profile named '$profile_name' was found." >&2
		exit 1
	}
fi

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT
profile_plist="$temporary_directory/profile.plist"
entitlements_plist="$temporary_directory/entitlements.plist"

security cms -D -i "$profile_path" > "$profile_plist"
plutil -extract Entitlements xml1 -o "$entitlements_plist" "$profile_plist"

profile_team="$(plutil -extract TeamIdentifier.0 raw "$profile_plist")"
application_identifier="$(plutil -extract Entitlements.application-identifier raw "$profile_plist")"
aps_environment="$(plutil -extract Entitlements.aps-environment raw "$profile_plist")"
provisioned_devices="$(plutil -extract ProvisionedDevices json -o - "$profile_plist")"

[ "$profile_team" = "ZHQLA4T47N" ] || {
	echo "Provisioning profile belongs to unexpected team $profile_team." >&2
	exit 1
}
[ "$application_identifier" = "ZHQLA4T47N.com.spnss.todo" ] || {
	echo "Provisioning profile is for unexpected app $application_identifier." >&2
	exit 1
}
[ "$aps_environment" = "development" ] || {
	echo "Provisioning profile lacks the development APNs entitlement." >&2
	exit 1
}
printf '%s' "$provisioned_devices" | grep -Fq "$TODO_IOS_DEVICE_ID" || {
	echo "Provisioning profile does not include device $TODO_IOS_DEVICE_ID." >&2
	exit 1
}

device_derived_data="${TODO_IOS_DEVICE_DERIVED_DATA:-$TODO_IOS_DERIVED_DATA/device}"

xcodebuild \
	-workspace "$TODO_IOS_WORKSPACE" \
	-scheme "$TODO_IOS_SCHEME" \
	-configuration Debug \
	-sdk iphoneos \
	-destination 'generic/platform=iOS' \
	-derivedDataPath "$device_derived_data" \
	CODE_SIGNING_ALLOWED=NO \
	build

app_path="$device_derived_data/Build/Products/Debug-iphoneos/App.app"
signing_identity="${TODO_IOS_SIGNING_IDENTITY:-Apple Development: Created via API (L949S84RN2)}"

ditto "$profile_path" "$app_path/embedded.mobileprovision"
find "$app_path/Frameworks" -type d -name '*.framework' -prune -print | while IFS= read -r framework; do
	codesign --force --sign "$signing_identity" --timestamp=none "$framework"
done
find "$app_path" -maxdepth 1 -type f -name '*.dylib' -print | while IFS= read -r dylib; do
	codesign --force --sign "$signing_identity" --timestamp=none "$dylib"
done
codesign \
	--force \
	--sign "$signing_identity" \
	--entitlements "$entitlements_plist" \
	--timestamp=none \
	--generate-entitlement-der \
	"$app_path"

codesign --verify --deep --strict --verbose=2 "$app_path"
entitlements="$(codesign -d --entitlements :- "$app_path" 2>/dev/null)"
aps_environment="$(printf '%s' "$entitlements" | plutil -extract aps-environment raw -o - -)"
application_identifier="$(
	printf '%s' "$entitlements" | plutil -extract application-identifier raw -o - -
)"
team_identifier="${application_identifier%%.*}"

[ "$aps_environment" = "development" ] || {
	echo "Signed app has an unexpected aps-environment: $aps_environment" >&2
	exit 1
}
[ "$team_identifier" = "ZHQLA4T47N" ] || {
	echo "Signed app has an unexpected team identifier: $team_identifier" >&2
	exit 1
}

echo "Verified signed app for team $team_identifier with $aps_environment push entitlement."

if [ "${TODO_IOS_INSTALL:-}" = "1" ]; then
	xcrun devicectl device install app --device "$TODO_IOS_DEVICE_ID" "$app_path"
	xcrun devicectl device process launch \
		--device "$TODO_IOS_DEVICE_ID" \
		--terminate-existing \
		com.spnss.todo
fi

echo "Signed app: $app_path"
