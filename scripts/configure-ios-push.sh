#!/usr/bin/env bash

set -euo pipefail
set +x

umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
secret_file="$repo_root/ios/secrets/apns.enc.json"
sync_github=1
import_path=''
key_id=''
team_id=''

usage() {
	cat <<'USAGE'
Usage:
  npm run ios:push:configure
  npm run ios:push:configure -- --local-only
  npm run ios:push:configure -- --import PATH --key-id ID --team-id ID

Without --import, decrypts the committed SOPS file, installs the APNs key under
~/.config/todo/private_keys, and mirrors it to GitHub Actions secrets.

Options:
  --import PATH   Validate a newly downloaded APNs .p8 key and replace the
                  committed SOPS-encrypted credential before installing it.
  --key-id ID     Ten-character Apple APNs key ID. Required with --import.
  --team-id ID    Ten-character Apple Developer team ID. Required with --import.
  --local-only    Do not update GitHub Actions secrets.
  -h, --help      Show this help.
USAGE
}

fail() {
	printf 'Error: %s\n' "$1" >&2
	exit 1
}

require_command() {
	command -v "$1" >/dev/null 2>&1 || fail "$1 is required; enter nix develop and retry"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--import)
			[[ $# -ge 2 ]] || fail '--import requires a path'
			import_path="$2"
			shift 2
			;;
		--key-id)
			[[ $# -ge 2 ]] || fail '--key-id requires a value'
			key_id="$2"
			shift 2
			;;
		--team-id)
			[[ $# -ge 2 ]] || fail '--team-id requires a value'
			team_id="$2"
			shift 2
			;;
		--local-only)
			sync_github=0
			shift
			;;
		-h | --help)
			usage
			exit 0
			;;
		*) fail "unknown option: $1" ;;
	esac
done

require_command node
require_command openssl
require_command sops

temporary_directory="$(mktemp -d)"
cleanup() {
	find "$temporary_directory" -depth -delete
}
trap cleanup EXIT

plain_key="$temporary_directory/apns-key.p8"

if [[ -n "$import_path" ]]; then
	[[ -f "$import_path" ]] || fail "APNs key was not found: $import_path"
	[[ "$key_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'Key ID must contain 10 uppercase letters or digits'
	[[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'Team ID must contain 10 uppercase letters or digits'
	openssl pkey -in "$import_path" -noout >/dev/null 2>&1 || fail 'APNs key is not a parseable private key'
	cp "$import_path" "$plain_key"
	chmod 600 "$plain_key"

	plain_json="$temporary_directory/apns.json"
	encrypted_json="$temporary_directory/apns.enc.json"
	APNS_KEY_PATH="$plain_key" APNS_KEY_ID="$key_id" APPLE_TEAM_ID="$team_id" node <<'NODE' > "$plain_json"
import fs from 'node:fs';

process.stdout.write(
	JSON.stringify(
		{
			TODO_APNS_AUTH_KEY_P8: fs.readFileSync(process.env.APNS_KEY_PATH, 'utf8'),
			TODO_APNS_KEY_ID: process.env.APNS_KEY_ID,
			TODO_APPLE_TEAM_ID: process.env.APPLE_TEAM_ID
		},
		null,
		2
	) + '\n'
);
NODE
	mkdir -p "$(dirname "$secret_file")"
	(
		cd "$repo_root"
		sops --config .sops.yaml \
			--encrypt \
			--filename-override ios/secrets/apns.enc.json \
			--output "$encrypted_json" \
			"$plain_json"
	)
	mv "$encrypted_json" "$secret_file"
	printf 'Updated %s with the encrypted APNs credential.\n' "$secret_file"
else
	[[ -f "$secret_file" ]] || fail "encrypted APNs credential was not found: $secret_file"
	key_id="$(sops --decrypt --extract '["TODO_APNS_KEY_ID"]' --output-type binary "$secret_file")"
	team_id="$(sops --decrypt --extract '["TODO_APPLE_TEAM_ID"]' --output-type binary "$secret_file")"
	sops --decrypt --extract '["TODO_APNS_AUTH_KEY_P8"]' --output-type binary "$secret_file" > "$plain_key"
fi

[[ "$key_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'decrypted Key ID is invalid'
[[ "$team_id" =~ ^[A-Z0-9]{10}$ ]] || fail 'decrypted Team ID is invalid'
openssl pkey -in "$plain_key" -noout >/dev/null 2>&1 || fail 'decrypted APNs key is not parseable'

key_directory="$HOME/.config/todo/private_keys"
key_target="$key_directory/AuthKey_${key_id}.p8"
mkdir -p "$key_directory"
chmod 700 "$key_directory"

if [[ -e "$key_target" ]] && ! cmp -s "$plain_key" "$key_target"; then
	fail "a different key already exists at $key_target"
fi
install -m 600 "$plain_key" "$key_target"

if [[ "$sync_github" -eq 1 ]]; then
	require_command gh
	gh auth status >/dev/null 2>&1 || fail 'GitHub CLI is not authenticated'
	gh secret set TODO_APNS_AUTH_KEY_P8 < "$key_target"
	printf '%s' "$key_id" | gh secret set TODO_APNS_KEY_ID
	printf '%s' "$team_id" | gh secret set TODO_APPLE_TEAM_ID
	printf 'Updated GitHub Actions APNs secrets.\n'
fi

printf 'Installed APNs key %s for Apple team %s at %s.\n' "$key_id" "$team_id" "$key_target"
printf 'Firebase upload URL: %s\n' 'https://console.firebase.google.com/project/todo-firebase-1a740/settings/cloudmessaging'
printf 'If Firebase lost the credential, upload this key to both APNs auth-key rows for Todo (Dobutsu).\n'
