#!/usr/bin/env bash
set -euo pipefail

readonly avd_name="todo-e2e-api36-${ANDROID_EMULATOR_ABI:-x86_64}"
readonly emulator_port="5556"
readonly emulator_serial="emulator-${emulator_port}"
readonly app_port="14173"
readonly auth_port="19099"
readonly firestore_port="18080"
readonly firebase_project="todo-android-e2e"
readonly artifact_dir="test-results/android-emulator"
readonly screenshot_artifact_dir="$artifact_dir/screenshots"
readonly baseline_dir="android/app/src/androidTest/assets/android-e2e"
readonly screenshots_on_device="/sdcard/Download/todo-android-e2e"

update_screenshots=false
if [[ "${1:-}" == "--update-screenshots" ]]; then
	update_screenshots=true
	shift
fi
if (( $# > 0 )); then
	echo "Usage: $0 [--update-screenshots]" >&2
	exit 2
fi

if [[ -z "${ANDROID_HOME:-}" || -z "${ANDROID_EMULATOR_IMAGE:-}" ]]; then
	echo "Android SDK environment is missing; run this command inside 'nix develop'." >&2
	exit 1
fi

mkdir -p "$artifact_dir" "$screenshot_artifact_dir" "${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"
find "$screenshot_artifact_dir" -mindepth 1 -maxdepth 1 -type f -delete

cleanup() {
	adb -s "$emulator_serial" emu kill >/dev/null 2>&1 || true
	for process_id in "${preview_pid:-}" "${firebase_pid:-}"; do
		if [[ -n "$process_id" ]]; then
			kill "$process_id" >/dev/null 2>&1 || true
			wait "$process_id" 2>/dev/null || true
		fi
	done
	if [[ -n "${emulator_pid:-}" ]]; then
		wait "$emulator_pid" 2>/dev/null || true
	fi
	CAPACITOR_SERVER_URL= npx cap sync android >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

wait_for_port() {
	local host="$1"
	local port="$2"
	local process_id="$3"
	local label="$4"
	local deadline=$((SECONDS + 120))
	while ! (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; do
		if (( SECONDS >= deadline )); then
			echo "$label did not listen on $host:$port; see $artifact_dir/$label.log" >&2
			exit 1
		fi
		if ! kill -0 "$process_id" 2>/dev/null; then
			echo "$label exited during startup; see $artifact_dir/$label.log" >&2
			exit 1
		fi
		sleep 1
	done
}

if adb devices | grep -q "^${emulator_serial}[[:space:]]"; then
	echo "Emulator port ${emulator_port} is already in use." >&2
	exit 1
fi

if ! avdmanager list avd | grep -q "Name: ${avd_name}$"; then
	printf 'no\n' | avdmanager create avd \
		--force \
		--name "$avd_name" \
		--package "$ANDROID_EMULATOR_IMAGE" \
		--device "pixel_6"
fi

export VITE_USE_FIREBASE_EMULATOR="true"
export VITE_FIREBASE_PROJECT_ID="$firebase_project"
export VITE_FIRESTORE_EMULATOR_HOST="localhost"
export VITE_FIRESTORE_EMULATOR_PORT="$firestore_port"
export VITE_AUTH_EMULATOR_URL="http://localhost:${auth_port}"
export VITE_DISABLE_FIRESTORE_PERSISTENCE="true"
export VITE_DISABLE_NOTIFICATIONS="true"
export VITE_TEST_LOGIN_EMAIL="android@example.com"
export VITE_TEST_LOGIN_PASSWORD="android-e2e-password"
export VITE_TEST_LOGIN_NAME="Android Test User"
export VITE_TEST_LOGIN_PHOTO="http://localhost:${app_port}/favicon.png"

npx firebase emulators:start \
	--config firebase.android-e2e.json \
	--only auth,firestore \
	--project "$firebase_project" \
	--non-interactive \
	>"$artifact_dir/firebase.log" 2>&1 &
firebase_pid=$!
wait_for_port 127.0.0.1 "$auth_port" "$firebase_pid" firebase
wait_for_port 127.0.0.1 "$firestore_port" "$firebase_pid" firebase

if [[ "${ANDROID_E2E_SKIP_WEB_BUILD:-false}" != "true" ]]; then
	npm run build
fi
CAPACITOR_SERVER_URL="http://localhost:${app_port}" npx cap sync android
npm run preview -- --host 0.0.0.0 --port "$app_port" >"$artifact_dir/preview.log" 2>&1 &
preview_pid=$!
wait_for_port 127.0.0.1 "$app_port" "$preview_pid" preview

emulator \
	-avd "$avd_name" \
	-port "$emulator_port" \
	-no-window \
	-no-audio \
	-no-boot-anim \
	-no-snapshot \
	-wipe-data \
	-gpu swiftshader_indirect \
	>"$artifact_dir/emulator.log" 2>&1 &
emulator_pid=$!

adb -s "$emulator_serial" wait-for-device
adb -s "$emulator_serial" reverse "tcp:${app_port}" "tcp:${app_port}"
adb -s "$emulator_serial" reverse "tcp:${auth_port}" "tcp:${auth_port}"
adb -s "$emulator_serial" reverse "tcp:${firestore_port}" "tcp:${firestore_port}"
boot_deadline=$((SECONDS + 180))
while [[ "$(adb -s "$emulator_serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]]; do
	if (( SECONDS >= boot_deadline )); then
		echo "Emulator did not finish booting; see $artifact_dir/emulator.log" >&2
		exit 1
	fi
	if ! kill -0 "$emulator_pid" 2>/dev/null; then
		echo "Emulator exited during startup; see $artifact_dir/emulator.log" >&2
		exit 1
	fi
	sleep 2
done

adb -s "$emulator_serial" shell wm size 393x852
adb -s "$emulator_serial" shell wm density 160
adb -s "$emulator_serial" shell settings put system font_scale 1.0
adb -s "$emulator_serial" shell settings put system time_12_24 24
adb -s "$emulator_serial" shell settings put secure ui_night_mode 1
adb -s "$emulator_serial" shell settings put global window_animation_scale 0
adb -s "$emulator_serial" shell settings put global transition_animation_scale 0
adb -s "$emulator_serial" shell settings put global animator_duration_scale 0
adb -s "$emulator_serial" shell rm -rf "$screenshots_on_device"
adb -s "$emulator_serial" shell mkdir -p "$screenshots_on_device"

gradle_arguments=(
	-p android
	--no-daemon
	:app:connectedDebugAndroidTest
)
if [[ "$update_screenshots" == "true" ]]; then
	gradle_arguments+=(
		-Pandroid.testInstrumentationRunnerArguments.updateScreenshots=true
	)
fi

set +e
ANDROID_SERIAL="$emulator_serial" ./android/gradlew "${gradle_arguments[@]}"
test_status=$?
set -e

adb -s "$emulator_serial" pull "$screenshots_on_device/." "$screenshot_artifact_dir" >/dev/null || true
if ! compgen -G "$screenshot_artifact_dir/*.png" >/dev/null; then
	echo "Android E2E did not produce screenshots; inspect the logs in $artifact_dir." >&2
	exit 1
fi

if [[ "$update_screenshots" == "true" && "$test_status" == "0" ]]; then
	mkdir -p "$baseline_dir"
	find "$baseline_dir" -mindepth 1 -maxdepth 1 -type f -name '*.png' -delete
	cp "$screenshot_artifact_dir"/*.png "$baseline_dir/"
fi

if (( test_status != 0 )); then
	echo "Android emulator E2E failed; actual screenshots and pixel diffs are in $screenshot_artifact_dir." >&2
	exit "$test_status"
fi

if [[ "$update_screenshots" == "true" ]]; then
	echo "Android emulator E2E completed and updated baselines in $baseline_dir."
else
	echo "Android emulator E2E passed with 0 differing pixels across all screenshots."
fi
