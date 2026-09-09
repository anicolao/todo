#!/bin/sh

set -eu

TODO_IOS_DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

if [ ! -x "$TODO_IOS_DEVELOPER_DIR/usr/bin/xcodebuild" ]; then
	echo "Xcode was not found at $TODO_IOS_DEVELOPER_DIR." >&2
	echo "Set DEVELOPER_DIR to the Xcode Developer directory and retry." >&2
	exit 1
fi

export DEVELOPER_DIR="$TODO_IOS_DEVELOPER_DIR"
export PATH="$TODO_IOS_DEVELOPER_DIR/usr/bin:$PATH"

TODO_IOS_WORKSPACE="ios/App/App.xcworkspace"
TODO_IOS_SCHEME="App"
TODO_IOS_DERIVED_DATA="${TODO_IOS_DERIVED_DATA:-$PWD/ios/DerivedData}"

export TODO_IOS_WORKSPACE TODO_IOS_SCHEME TODO_IOS_DERIVED_DATA
