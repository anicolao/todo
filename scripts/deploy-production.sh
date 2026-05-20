#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${FIREBASE_PROJECT_ID:-${GCLOUD_PROJECT:-${GOOGLE_CLOUD_PROJECT:-${GCP_PROJECT:-}}}}"
if [ -z "$PROJECT_ID" ] && [ -f .firebaserc ]; then
       PROJECT_ID="$(
               node -e "const fs = require('fs'); const rc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8')); process.stdout.write(rc.projects && rc.projects.default || '')"
       )"
fi
PROJECT_ID="${PROJECT_ID:-todo-firebase-1a740}"
DEPLOY_TARGETS="${FIREBASE_DEPLOY_TARGETS:-hosting,functions,firestore}"
LOG_FILE="$(mktemp)"

cleanup() {
	rm -f "$LOG_FILE"
}
trap cleanup EXIT

npm ci --prefix functions --engine-strict=false
npm run build

set +e
npm_config_engine_strict=false firebase deploy \
	--non-interactive \
	--project "$PROJECT_ID" \
	--only "$DEPLOY_TARGETS" 2>&1 | tee "$LOG_FILE"
firebase_status="${PIPESTATUS[0]}"
set -e

if grep -E \
	-e 'functions: failed to (create|update|delete) function' \
	-e 'Failed to (create|update|delete) function' \
	-e 'Functions deploy had errors' \
	-e 'Functions deploy failed' \
	-e '[1-9][0-9]* Functions Errored' \
	"$LOG_FILE" >/dev/null; then
	echo "error: Firebase reported function deployment failures" >&2
	exit 1
fi

exit "$firebase_status"
