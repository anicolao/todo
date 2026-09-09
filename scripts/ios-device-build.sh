#!/bin/sh

set -eu
. "$(dirname "$0")/ios-common.sh"

if [ -z "${TODO_IOS_DEVICE_ID:-}" ]; then
	echo "Set TODO_IOS_DEVICE_ID to the Xcode destination identifier for the phone." >&2
	echo "Find it with: xcrun devicectl list devices" >&2
	exit 1
fi

xcodebuild \
	-workspace "$TODO_IOS_WORKSPACE" \
	-scheme "$TODO_IOS_SCHEME" \
	-configuration Debug \
	-destination "id=$TODO_IOS_DEVICE_ID" \
	-derivedDataPath "$TODO_IOS_DERIVED_DATA/device" \
	-allowProvisioningUpdates \
	build

echo "Signed app: $TODO_IOS_DERIVED_DATA/device/Build/Products/Debug-iphoneos/App.app"
