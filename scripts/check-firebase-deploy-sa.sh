#!/usr/bin/env bash
set -euo pipefail

usage() {
	cat <<'USAGE'
Usage:
  npm run deploy:preflight -- path/to/service-account.json

Credential sources, in priority order:
  1. First positional argument: path to a service account JSON key file.
  2. GOOGLE_APPLICATION_CREDENTIALS: path to a service account JSON key file.
  3. FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT: raw JSON secret value.

Optional environment:
  FIREBASE_PROJECT_ID       Firebase/GCP project ID. Defaults to .firebaserc.
  FUNCTIONS_REGION          Cloud Functions region. Defaults to us-central1.
  SKIP_FUNCTION_DESCRIBE=1  Skip checking existing functions are visible to gcloud.
USAGE
}

die() {
	echo "error: $*" >&2
	exit 1
}

note() {
	echo "==> $*" >&2
}

require_cmd() {
	command -v "$1" >/dev/null 2>&1 || die "$1 is required. Enter nix develop, then retry."
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
	usage
	exit 0
fi

require_cmd gcloud
require_cmd node
require_cmd npx

if [ -f functions/package.json ]; then
	FUNCTIONS_NODE_ENGINE="$(
		node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('functions/package.json', 'utf8'));
process.stdout.write(String((pkg.engines && pkg.engines.node) || ''));
"
	)"
	if [ "$FUNCTIONS_NODE_ENGINE" != "20" ]; then
		die "functions/package.json must set engines.node to 20 for this Firebase CLI and current Cloud Functions runtime policy; found '${FUNCTIONS_NODE_ENGINE:-unset}'"
	fi
fi

PROJECT_ID="${FIREBASE_PROJECT_ID:-${GCLOUD_PROJECT:-${GOOGLE_CLOUD_PROJECT:-${GCP_PROJECT:-}}}}"
if [ -z "$PROJECT_ID" ] && [ -f .firebaserc ]; then
	PROJECT_ID="$(
		node -e "const fs = require('fs'); const rc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8')); process.stdout.write(rc.projects && rc.projects.default || '')"
	)"
fi
[ -n "$PROJECT_ID" ] || die "set FIREBASE_PROJECT_ID or define projects.default in .firebaserc"

TMP_ROOT="$(mktemp -d)"
cleanup() {
	rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

export CLOUDSDK_CONFIG="$TMP_ROOT/gcloud"

CREDS_FILE=""
if [ -n "${1:-}" ]; then
	CREDS_FILE="$1"
elif [ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]; then
	CREDS_FILE="$GOOGLE_APPLICATION_CREDENTIALS"
else
	RAW_CREDS="${FIREBASE_SERVICE_ACCOUNT_JSON:-${FIREBASE_SERVICE_ACCOUNT:-}}"
	if [ -n "$RAW_CREDS" ]; then
		CREDS_FILE="$TMP_ROOT/firebase-service-account.json"
		printf '%s' "$RAW_CREDS" > "$CREDS_FILE"
		chmod 0600 "$CREDS_FILE"
	fi
fi

[ -n "$CREDS_FILE" ] || die "provide credentials as an argument, GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_SERVICE_ACCOUNT"
[ -f "$CREDS_FILE" ] || die "credentials file does not exist: $CREDS_FILE"

SA_EMAIL="$(
	node -e "
const fs = require('fs');
const file = process.argv[1];
const json = JSON.parse(fs.readFileSync(file, 'utf8'));
if (json.type !== 'service_account') throw new Error('credentials are not a service_account key');
if (!json.client_email) throw new Error('credentials are missing client_email');
process.stdout.write(json.client_email);
" "$CREDS_FILE"
)"

CRED_PROJECT="$(
	node -e "
const fs = require('fs');
const json = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
process.stdout.write(json.project_id || '');
" "$CREDS_FILE"
)"

if [ -n "$CRED_PROJECT" ] && [ "$CRED_PROJECT" != "$PROJECT_ID" ]; then
	die "credential project_id is $CRED_PROJECT, but target project is $PROJECT_ID"
fi

export GOOGLE_APPLICATION_CREDENTIALS="$CREDS_FILE"

note "Activating service account $SA_EMAIL for project $PROJECT_ID"
gcloud --quiet auth activate-service-account "$SA_EMAIL" --key-file="$CREDS_FILE" --project="$PROJECT_ID" >/dev/null
gcloud --quiet config set project "$PROJECT_ID" >/dev/null

ACTIVE_ACCOUNT="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
[ "$ACTIVE_ACCOUNT" = "$SA_EMAIL" ] || die "gcloud active account is $ACTIVE_ACCOUNT, expected $SA_EMAIL"

note "Checking Firebase CLI can see the project"
NO_COLOR=1 npx firebase projects:list --non-interactive > "$TMP_ROOT/firebase-projects.txt"
grep -Fq "$PROJECT_ID" "$TMP_ROOT/firebase-projects.txt" || die "Firebase CLI could not list target project $PROJECT_ID"

REQUIRED_PERMISSIONS=(
	"cloudbuild.builds.create"
	"cloudbuild.builds.get"
	"cloudfunctions.functions.create"
	"cloudfunctions.functions.delete"
	"cloudfunctions.functions.get"
	"cloudfunctions.functions.list"
	"cloudfunctions.functions.sourceCodeGet"
	"cloudfunctions.functions.sourceCodeSet"
	"cloudfunctions.functions.update"
	"cloudfunctions.operations.get"
	"cloudfunctions.operations.list"
	"datastore.databases.get"
	"datastore.indexes.create"
	"datastore.indexes.delete"
	"datastore.indexes.get"
	"datastore.indexes.list"
	"datastore.indexes.update"
	"firebase.projects.get"
	"firebasehosting.sites.get"
	"firebasehosting.sites.list"
	"firebasehosting.sites.update"
	"firebaserules.releases.create"
	"firebaserules.releases.get"
	"firebaserules.releases.list"
	"firebaserules.releases.update"
	"firebaserules.rulesets.create"
	"firebaserules.rulesets.get"
	"firebaserules.rulesets.list"
	"firebaserules.rulesets.test"
	"iam.serviceAccounts.actAs"
	"resourcemanager.projects.get"
	"serviceusage.apiKeys.get"
	"serviceusage.apiKeys.list"
	"serviceusage.services.get"
	"serviceusage.services.list"
)

note "Checking deploy IAM permissions"
ACCESS_TOKEN="$(gcloud auth print-access-token)"
PERMISSIONS_JSON="$(
	printf '%s\n' "${REQUIRED_PERMISSIONS[@]}" | node -e "
const fs = require('fs');
const permissions = fs.readFileSync(0, 'utf8').split('\n').filter(Boolean);
process.stdout.write(JSON.stringify({ permissions }));
"
)"
GRANTED_JSON="$(
	ACCESS_TOKEN="$ACCESS_TOKEN" PROJECT_ID="$PROJECT_ID" PERMISSIONS_JSON="$PERMISSIONS_JSON" node -e "
const endpoint = 'https://cloudresourcemanager.googleapis.com/v1/projects/' +
	encodeURIComponent(process.env.PROJECT_ID) + ':testIamPermissions';
const response = await fetch(endpoint, {
	method: 'POST',
	headers: {
		authorization: 'Bearer ' + process.env.ACCESS_TOKEN,
		'content-type': 'application/json',
	},
	body: process.env.PERMISSIONS_JSON,
});
const text = await response.text();
if (!response.ok) {
	console.error(text);
	process.exit(1);
}
process.stdout.write(text);
"
)"

EXPECTED_PERMISSIONS="$(
	printf '%s\n' "${REQUIRED_PERMISSIONS[@]}"
)" GRANTED_JSON="$GRANTED_JSON" node -e "
const expected = process.env.EXPECTED_PERMISSIONS.split('\n').filter(Boolean);
const granted = new Set((JSON.parse(process.env.GRANTED_JSON).permissions) || []);
const missing = expected.filter((permission) => !granted.has(permission));
if (missing.length) {
	console.error('Missing IAM permissions:');
	for (const permission of missing) console.error('  ' + permission);
	console.error('');
	console.error('Expected role coverage includes:');
	console.error('  roles/firebaserules.admin');
	console.error('  roles/datastore.indexAdmin');
	console.error('  roles/firebasehosting.admin');
	console.error('  roles/serviceusage.apiKeysViewer');
	console.error('  roles/cloudfunctions.admin');
	console.error('  roles/iam.serviceAccountUser');
	process.exit(1);
}
"

note "Checking enabled APIs used by this deploy"
gcloud services list \
	--enabled \
	--project="$PROJECT_ID" \
	--filter='config.name:(cloudfunctions.googleapis.com OR cloudbuild.googleapis.com OR artifactregistry.googleapis.com OR firebasehosting.googleapis.com OR firebaserules.googleapis.com OR firestore.googleapis.com)' \
	--format='value(config.name)' > "$TMP_ROOT/enabled-services.txt"

for service in \
	cloudfunctions.googleapis.com \
	cloudbuild.googleapis.com \
	artifactregistry.googleapis.com \
	firebasehosting.googleapis.com \
	firebaserules.googleapis.com \
	firestore.googleapis.com
do
	grep -Fxq "$service" "$TMP_ROOT/enabled-services.txt" || die "required API is not enabled: $service"
done

if [ "${SKIP_FUNCTION_DESCRIBE:-}" != "1" ] && [ -f functions/src/index.ts ]; then
	FUNCTIONS_REGION="${FUNCTIONS_REGION:-us-central1}"
	node -e "
const fs = require('fs');
const src = fs.readFileSync('functions/src/index.ts', 'utf8');
const names = [...src.matchAll(/exports\\.([A-Za-z0-9_]+)\\s*=/g)].map((match) => match[1]);
process.stdout.write([...new Set(names)].join('\n'));
" > "$TMP_ROOT/functions.txt"

	if [ -s "$TMP_ROOT/functions.txt" ]; then
		note "Checking existing Cloud Functions are visible in $FUNCTIONS_REGION"
		while IFS= read -r function_name; do
			[ -n "$function_name" ] || continue
			function_json="$(
				gcloud functions describe "$function_name" \
					--region="$FUNCTIONS_REGION" \
					--project="$PROJECT_ID" \
					--format=json
			)" || die "cannot describe function $function_name in $FUNCTIONS_REGION"
			FUNCTION_JSON="$function_json" FUNCTION_NAME="$function_name" node -e "
const fn = JSON.parse(process.env.FUNCTION_JSON);
if (!fn.name || fn.status !== 'ACTIVE') {
	console.error('Function is not ACTIVE: ' + process.env.FUNCTION_NAME);
	process.exit(1);
}
if (fn.serviceAccountEmail) {
	console.error('  ' + process.env.FUNCTION_NAME + ' runtime service account: ' + fn.serviceAccountEmail);
}
"
		done < "$TMP_ROOT/functions.txt"
	fi
fi

note "Service account credentials passed Firebase deploy preflight"
