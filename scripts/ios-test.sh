#!/bin/sh

set -eu
. "$(dirname "$0")/ios-common.sh"

"$(dirname "$0")/verify-ios-config.sh"

if [ -n "${TODO_IOS_SIMULATOR_ID:-}" ]; then
	simulator_id="$TODO_IOS_SIMULATOR_ID"
else
	simulator_id="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone/ { print $2; exit }')"
fi

if [ -z "$simulator_id" ]; then
	echo "No available iPhone simulator was found." >&2
	exit 1
fi

xcodebuild \
	-workspace "$TODO_IOS_WORKSPACE" \
	-scheme "$TODO_IOS_SCHEME" \
	-configuration Debug \
	-sdk iphonesimulator \
	-destination "id=$simulator_id" \
	-derivedDataPath "$TODO_IOS_DERIVED_DATA/tests" \
	CODE_SIGNING_ALLOWED=NO \
	build

xcrun simctl boot "$simulator_id" 2>/dev/null || true
xcrun simctl bootstatus "$simulator_id" -b

app_path="$TODO_IOS_DERIVED_DATA/tests/Build/Products/Debug-iphonesimulator/App.app"
xcrun simctl install "$simulator_id" "$app_path"
xcrun simctl launch --terminate-running-process "$simulator_id" com.spnss.todo

echo "Simulator shell launch passed on $simulator_id."
