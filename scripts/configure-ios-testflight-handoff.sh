#!/usr/bin/env bash

set -euo pipefail
set +x

umask 077

fail() {
	printf 'Error: %s\n' "$1" >&2
	exit 1
}

required_value() {
	local variable_name="$1"
	local prompt="$2"
	local value="${!variable_name:-}"
	if [[ -z "$value" ]]; then
		read -r -p "${prompt}: " value
	fi
	[[ -n "$value" ]] || fail "${prompt} is required"
	printf '%s' "$value"
}

default_value() {
	local variable_name="$1"
	local prompt="$2"
	local fallback="$3"
	local value="${!variable_name:-}"
	if [[ -z "$value" ]]; then
		read -r -p "${prompt} [${fallback}]: " value
	fi
	printf '%s' "${value:-$fallback}"
}

team_id="$(required_value TODO_APPLE_TEAM_ID 'Apple Developer Team ID')"
issuer_id="$(required_value TODO_ASC_ISSUER_ID 'App Store Connect API Issuer ID')"
key_id="$(required_value TODO_ASC_KEY_ID 'App Store Connect API Key ID')"
key_source="$(required_value TODO_ASC_KEY_PATH 'App Store Connect API private key path')"
app_name="$(default_value TODO_ASC_APP_NAME 'Exact App Store Connect app name' "Today's Todos")"
app_sku="$(default_value TODO_ASC_APP_SKU 'Exact App Store Connect SKU' 'todo-ios')"
testflight_group="$(default_value TODO_TESTFLIGHT_GROUP 'Internal TestFlight group name' 'Internal')"
tester_email="$(required_value TODO_TESTFLIGHT_TESTER_EMAIL 'Existing App Store Connect tester email')"

[[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'Team ID must contain 10 uppercase letters or digits'
[[ "$key_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'API Key ID must contain 10 uppercase letters or digits'
[[ "$issuer_id" =~ ^[0-9A-Fa-f-]{36}$ ]] || fail 'Issuer ID must be a UUID'
[[ "$tester_email" == *@*.* ]] || fail 'Tester email does not look valid'
[[ -f "$key_source" ]] || fail "Private key was not found at $key_source"
openssl pkey -in "$key_source" -noout >/dev/null 2>&1 || fail 'Private key is not parseable'

key_directory="$HOME/.appstoreconnect/private_keys"
key_target="$key_directory/AuthKey_${key_id}.p8"
config_directory="$HOME/.config/todo"
config_path="$config_directory/testflight.env"

mkdir -p "$key_directory" "$config_directory"

if [[ "$key_source" != "$key_target" ]]; then
	[[ ! -e "$key_target" ]] || fail "A key already exists at $key_target"
	mv "$key_source" "$key_target"
fi
chmod 600 "$key_target"

temporary_config="$(mktemp "$config_directory/testflight.env.XXXXXX")"
cleanup() {
	if [[ -n "${temporary_config:-}" && -f "$temporary_config" ]]; then
		find "$temporary_config" -delete
	fi
}
trap cleanup EXIT

{
	printf 'TODO_APPLE_TEAM_ID=%q\n' "$team_id"
	printf 'TODO_ASC_ISSUER_ID=%q\n' "$issuer_id"
	printf 'TODO_ASC_KEY_ID=%q\n' "$key_id"
	printf 'TODO_ASC_KEY_PATH=%q\n' "$key_target"
	printf 'TODO_ASC_APP_BUNDLE_ID=%q\n' 'com.spnss.todo'
	printf 'TODO_ASC_APP_NAME=%q\n' "$app_name"
	printf 'TODO_ASC_APP_SKU=%q\n' "$app_sku"
	printf 'TODO_TESTFLIGHT_GROUP=%q\n' "$testflight_group"
	printf 'TODO_TESTFLIGHT_TESTER_EMAIL=%q\n' "$tester_email"
} > "$temporary_config"

chmod 600 "$temporary_config"
mv "$temporary_config" "$config_path"
temporary_config=''
trap - EXIT

printf 'Todo TestFlight handoff installed at %s.\n' "$config_path"
printf 'The API private key remains outside the repository.\n'
