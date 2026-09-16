#!/usr/bin/env bash

set -euo pipefail
set +x

source "$(dirname "$0")/ios-common.sh"

fail() {
	printf 'TestFlight release failed: %s\n' "$1" >&2
	exit 1
}

require_variable() {
	local name="$1"
	[[ -n "${!name:-}" ]] || fail "$name is missing from the release configuration"
}

config_path="${TODO_IOS_TESTFLIGHT_CONFIG:-$HOME/.config/todo/testflight.env}"
[[ -f "$config_path" ]] || fail "run scripts/configure-ios-testflight-handoff.sh first"
# shellcheck disable=SC1090
source "$config_path"

for variable in \
	TODO_APPLE_TEAM_ID \
	TODO_ASC_ISSUER_ID \
	TODO_ASC_KEY_ID \
	TODO_ASC_KEY_PATH \
	TODO_ASC_APP_BUNDLE_ID \
	TODO_ASC_APP_NAME \
	TODO_ASC_APP_SKU
do
	require_variable "$variable"
done

[[ "$TODO_APPLE_TEAM_ID" == 'ZHQLA4T47N' ]] || fail 'the configured Apple team is unexpected'
[[ "$TODO_ASC_APP_BUNDLE_ID" == 'com.spnss.todo' ]] || fail 'the configured bundle ID is unexpected'
[[ -f "$TODO_ASC_KEY_PATH" ]] || fail 'the configured API private key does not exist'
command -v jq >/dev/null || fail 'jq is required'
command -v curl >/dev/null || fail 'curl is required'

api_token() {
	xcrun altool \
		--generate-jwt \
		--apiKey "$TODO_ASC_KEY_ID" \
		--apiIssuer "$TODO_ASC_ISSUER_ID" \
		--p8-file-path "$TODO_ASC_KEY_PATH" \
		2>&1 | tail -n 1
}

asc_get() {
	local path="$1"
	shift
	curl --silent --show-error --fail --get \
		"https://api.appstoreconnect.apple.com/v1/$path" \
		-H "Authorization: Bearer $(api_token)" \
		"$@"
}

app_json="$(
	asc_get apps \
		--data-urlencode "filter[bundleId]=$TODO_ASC_APP_BUNDLE_ID" \
		--data-urlencode 'limit=2'
)"
app_count="$(jq '.data | length' <<< "$app_json")"
[[ "$app_count" == '1' ]] || fail "expected one App Store Connect record for $TODO_ASC_APP_BUNDLE_ID"
app_id="$(jq -r '.data[0].id' <<< "$app_json")"
actual_name="$(jq -r '.data[0].attributes.name' <<< "$app_json")"
actual_sku="$(jq -r '.data[0].attributes.sku' <<< "$app_json")"
[[ "$actual_name" == "$TODO_ASC_APP_NAME" ]] || fail "App Store Connect name is '$actual_name', not '$TODO_ASC_APP_NAME'"
[[ "$actual_sku" == "$TODO_ASC_APP_SKU" ]] || fail "App Store Connect SKU is '$actual_sku', not '$TODO_ASC_APP_SKU'"

if [[ -n "${TODO_IOS_BUILD_NUMBER:-}" ]]; then
	build_number="$TODO_IOS_BUILD_NUMBER"
else
	builds_json="$(
		asc_get builds \
			--data-urlencode "filter[app]=$app_id" \
			--data-urlencode 'limit=200'
	)"
	latest_build="$(jq '[.data[].attributes.version | tonumber?] | max // 0' <<< "$builds_json")"
	build_number="$((latest_build + 1))"
fi
[[ "$build_number" =~ ^[1-9][0-9]*$ ]] || fail 'build number must be a positive integer'

release_root="${TODO_IOS_RELEASE_ROOT:-$TODO_IOS_DERIVED_DATA/testflight/build-$build_number}"
archive_path="$release_root/Todo.xcarchive"
export_path="$release_root/export"
export_options="ios/App/TestFlightExportOptions.plist"

[[ ! -e "$archive_path" ]] || fail "$archive_path already exists; choose another build number or release root"
mkdir -p "$release_root"

printf 'Archiving Today\047s Todos 1.0 (%s)…\n' "$build_number"
xcodebuild \
	-workspace "$TODO_IOS_WORKSPACE" \
	-scheme "$TODO_IOS_SCHEME" \
	-configuration Release \
	-destination 'generic/platform=iOS' \
	-archivePath "$archive_path" \
	-allowProvisioningUpdates \
	-authenticationKeyPath "$TODO_ASC_KEY_PATH" \
	-authenticationKeyID "$TODO_ASC_KEY_ID" \
	-authenticationKeyIssuerID "$TODO_ASC_ISSUER_ID" \
	CURRENT_PROJECT_VERSION="$build_number" \
	archive

printf 'Exporting signed App Store package…\n'
xcodebuild \
	-exportArchive \
	-archivePath "$archive_path" \
	-exportPath "$export_path" \
	-exportOptionsPlist "$export_options" \
	-allowProvisioningUpdates \
	-authenticationKeyPath "$TODO_ASC_KEY_PATH" \
	-authenticationKeyID "$TODO_ASC_KEY_ID" \
	-authenticationKeyIssuerID "$TODO_ASC_ISSUER_ID"

ipa_path="$(find "$export_path" -maxdepth 1 -type f -name '*.ipa' -print -quit)"
[[ -n "$ipa_path" ]] || fail 'export did not produce an IPA'

validation_path="$release_root/validation"
[[ ! -e "$validation_path" ]] || fail "$validation_path already exists"
mkdir -p "$validation_path"
ditto -x -k "$ipa_path" "$validation_path"
app_path="$(find "$validation_path/Payload" -maxdepth 1 -type d -name '*.app' -print -quit)"
[[ -n "$app_path" ]] || fail 'exported IPA does not contain an app'

bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Info.plist")"
archive_build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app_path/Info.plist")"
firebase_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :BUNDLE_ID' "$app_path/GoogleService-Info.plist")"
entitlements="$(codesign -d --entitlements :- "$app_path" 2>/dev/null)"
aps_environment="$(plutil -extract aps-environment raw -o - - <<< "$entitlements")"

[[ "$bundle_id" == "$TODO_ASC_APP_BUNDLE_ID" ]] || fail "exported app has bundle ID $bundle_id"
[[ "$archive_build" == "$build_number" ]] || fail "exported app has build number $archive_build"
[[ "$firebase_bundle_id" == "$TODO_ASC_APP_BUNDLE_ID" ]] || fail 'exported app contains the wrong Firebase configuration'
[[ "$aps_environment" == 'production' ]] || fail "exported app has $aps_environment APNs entitlement"

printf 'Validating signed package with App Store Connect…\n'
xcrun altool \
	--validate-app \
	-f "$ipa_path" \
	--apiKey "$TODO_ASC_KEY_ID" \
	--apiIssuer "$TODO_ASC_ISSUER_ID"

if [[ "${TODO_IOS_UPLOAD:-0}" == '1' ]]; then
	printf 'Uploading build %s to App Store Connect…\n' "$build_number"
	xcrun altool \
		--upload-app \
		-f "$ipa_path" \
		--apiKey "$TODO_ASC_KEY_ID" \
		--apiIssuer "$TODO_ASC_ISSUER_ID"
else
	printf 'Upload skipped. Set TODO_IOS_UPLOAD=1 to upload this validated package.\n'
fi

printf 'Validated build: %s\n' "$build_number"
printf 'Archive: %s\n' "$archive_path"
printf 'IPA: %s\n' "$ipa_path"
