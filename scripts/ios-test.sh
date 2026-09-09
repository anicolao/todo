#!/bin/sh

set -eu
. "$(dirname "$0")/ios-common.sh"

xcodebuild \
	-workspace "$TODO_IOS_WORKSPACE" \
	-scheme "$TODO_IOS_SCHEME" \
	-configuration Debug \
	-destination "${TODO_IOS_TEST_DESTINATION:-platform=iOS Simulator,name=iPhone 17}" \
	-derivedDataPath "$TODO_IOS_DERIVED_DATA/tests" \
	test
