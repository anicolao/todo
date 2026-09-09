#!/bin/sh

set -eu
. "$(dirname "$0")/ios-common.sh"

if [ "${TODO_IOS_WEB_BUILT:-}" != "1" ]; then
	npm run build
	export TODO_IOS_WEB_BUILT=1
fi

if ! command -v pod >/dev/null 2>&1; then
	if command -v nix >/dev/null 2>&1 && [ -z "${TODO_IOS_IN_NIX_SHELL:-}" ]; then
		export TODO_IOS_IN_NIX_SHELL=1
		exec nix develop --command env DEVELOPER_DIR="$TODO_IOS_DEVELOPER_DIR" "$0" "$@"
	fi
	echo "CocoaPods is required. Install it or run this project with Nix." >&2
	exit 1
fi

CAPACITOR_APP_ID="${TODO_IOS_BUNDLE_ID:-com.spnss.todo}" npx cap sync ios
