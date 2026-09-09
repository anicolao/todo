#!/bin/sh

set -eu
. "$(dirname "$0")/ios-common.sh"

xcodebuild \
	-workspace "$TODO_IOS_WORKSPACE" \
	-scheme "$TODO_IOS_SCHEME" \
	-configuration Debug \
	-sdk iphonesimulator \
	-destination 'generic/platform=iOS Simulator' \
	-derivedDataPath "$TODO_IOS_DERIVED_DATA/simulator" \
	CODE_SIGNING_ALLOWED=NO \
	build

xcodebuild \
	-workspace "$TODO_IOS_WORKSPACE" \
	-scheme "$TODO_IOS_SCHEME" \
	-configuration Debug \
	-sdk iphoneos \
	-destination 'generic/platform=iOS' \
	-derivedDataPath "$TODO_IOS_DERIVED_DATA/device-unsigned" \
	CODE_SIGNING_ALLOWED=NO \
	build
