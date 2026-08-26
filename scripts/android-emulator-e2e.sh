#!/usr/bin/env bash
set -euo pipefail

readonly avd_name="todo-e2e-api36-${ANDROID_EMULATOR_ABI:-x86_64}"
readonly emulator_port="5556"
readonly emulator_serial="emulator-${emulator_port}"
readonly artifact_dir="test-results/android-emulator"
readonly screenshot_on_device="/data/local/tmp/todo-app-launch.png"

if [[ -z "${ANDROID_HOME:-}" || -z "${ANDROID_EMULATOR_IMAGE:-}" ]]; then
	echo "Android SDK environment is missing; run this command inside 'nix develop'." >&2
	exit 1
fi

mkdir -p "$artifact_dir" "${ANDROID_AVD_HOME:-$ANDROID_USER_HOME/avd}"

cleanup() {
	adb -s "$emulator_serial" emu kill >/dev/null 2>&1 || true
	if [[ -n "${emulator_pid:-}" ]]; then
		wait "$emulator_pid" 2>/dev/null || true
	fi
}
trap cleanup EXIT INT TERM

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

npm run android:sync

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

adb -s "$emulator_serial" shell settings put global window_animation_scale 0
adb -s "$emulator_serial" shell settings put global transition_animation_scale 0
adb -s "$emulator_serial" shell settings put global animator_duration_scale 0
adb -s "$emulator_serial" shell rm -f "$screenshot_on_device"

ANDROID_SERIAL="$emulator_serial" ./android/gradlew \
	-p android \
	--no-daemon \
	:app:connectedDebugAndroidTest

adb -s "$emulator_serial" pull "$screenshot_on_device" "$artifact_dir/app-launch.png" >/dev/null
if [[ ! -s "$artifact_dir/app-launch.png" ]]; then
	echo "Emulator screenshot was not created." >&2
	exit 1
fi
echo "Android emulator E2E passed; screenshot: $artifact_dir/app-launch.png"
