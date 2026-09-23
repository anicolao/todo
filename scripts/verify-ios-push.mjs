#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { GoogleAuth } from 'google-auth-library';

const require = createRequire(import.meta.url);

/** @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} Fetch */
/**
 * @typedef {{
 *   new(options: {
 *     credentials?: Record<string, unknown>,
 *     keyFilename?: string,
 *     scopes: string[]
 *   }): { getAccessToken(): Promise<string | null | undefined> }
 * }} GoogleAuthConstructor
 */

function usage() {
	console.log(`Usage:
  npm run ios:push:verify -- EMAIL [--dry-run]

Sends a token-redacting FCM delivery test to every token registered for EMAIL.
Use --dry-run to validate requests without delivering notifications.

Authentication, in priority order:
  FIREBASE_ACCESS_TOKEN
  FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_JSON
  GOOGLE_APPLICATION_CREDENTIALS
  Firebase CLI login (TODO_FIREBASE_ACCOUNT selects a non-default account)

Optional environment:
  FIREBASE_PROJECT_ID     Defaults to the project in .firebaserc.
  TODO_FIREBASE_ACCOUNT   Defaults to alex@stockgamblers.com.`);
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
	throw new Error(message);
}

/**
 * @param {string[]} argv
 * @returns {{help: true} | {help: false, dryRun: boolean, targetEmail: string}}
 */
export function parseArguments(argv) {
	let targetEmail = '';
	let dryRun = false;
	for (const argument of argv) {
		if (argument === '-h' || argument === '--help') return { help: true };
		if (argument === '--dry-run') {
			dryRun = true;
			continue;
		}
		if (argument.startsWith('-')) fail(`unknown option: ${argument}`);
		if (targetEmail) fail('only one target email may be supplied');
		targetEmail = argument;
	}
	if (!targetEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(targetEmail)) {
		fail('provide the Todo account email to test');
	}
	return { dryRun, help: false, targetEmail };
}

/** @param {Record<string, string | undefined>} [env] */
export function projectId(env = process.env) {
	if (env.FIREBASE_PROJECT_ID) return env.FIREBASE_PROJECT_ID;
	const firebaseRc = JSON.parse(fs.readFileSync('.firebaserc', 'utf8'));
	const project = firebaseRc.projects?.default;
	if (!project) fail('FIREBASE_PROJECT_ID is unset and .firebaserc has no default project');
	return project;
}

/**
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   GoogleAuthClass?: GoogleAuthConstructor,
 *   loadFirebaseAuth?: () => {
 *     findAccountByEmail(email: string): {tokens?: {refresh_token?: string}} | undefined,
 *     getGlobalDefaultAccount(): {tokens?: {refresh_token?: string}} | undefined,
 *     getAccessToken(refreshToken: string, scopes: string[]): Promise<{access_token?: string}>
 *   }
 * }} [options]
 */
export async function accessToken({
	env = process.env,
	GoogleAuthClass = /** @type {GoogleAuthConstructor} */ (GoogleAuth),
	loadFirebaseAuth = () => require('firebase-tools/lib/auth')
} = {}) {
	if (env.FIREBASE_ACCESS_TOKEN) return env.FIREBASE_ACCESS_TOKEN;

	const rawCredentials = env.FIREBASE_SERVICE_ACCOUNT_JSON ?? env.FIREBASE_SERVICE_ACCOUNT;
	const keyFilename = env.GOOGLE_APPLICATION_CREDENTIALS;
	if (rawCredentials || keyFilename) {
		let credentials;
		if (rawCredentials) {
			try {
				credentials = JSON.parse(rawCredentials);
			} catch {
				fail('Firebase service-account environment value is not valid JSON');
			}
		}
		const auth = new GoogleAuthClass({
			credentials,
			keyFilename,
			scopes: ['https://www.googleapis.com/auth/cloud-platform']
		});
		const token = await auth.getAccessToken();
		if (!token) fail('Google application credentials did not produce an access token');
		return token;
	}

	const firebaseAuth = loadFirebaseAuth();
	const requestedAccount = env.TODO_FIREBASE_ACCOUNT ?? 'alex@stockgamblers.com';
	const account =
		firebaseAuth.findAccountByEmail(requestedAccount) ?? firebaseAuth.getGlobalDefaultAccount();
	const refreshToken = account?.tokens?.refresh_token;
	if (!refreshToken) {
		fail(`Firebase CLI account ${requestedAccount} is not authenticated`);
	}
	const token = await firebaseAuth.getAccessToken(refreshToken, []);
	if (!token?.access_token) fail('Firebase CLI login did not produce an access token');
	return token.access_token;
}

/**
 * @param {string} url
 * @param {RequestInit} options
 * @param {string} context
 * @param {Fetch} fetchImpl
 */
async function fetchJson(url, options, context, fetchImpl) {
	const response = await fetchImpl(url, options);
	if (!response.ok) {
		let status = `HTTP ${response.status}`;
		try {
			const body = await response.json();
			status = body.error?.status ?? status;
		} catch {}
		fail(`${context}: ${status}`);
	}
	return response.json();
}

/**
 * @param {string} project
 * @param {string} token
 * @param {string} targetEmail
 * @param {Fetch} [fetchImpl]
 */
export async function registeredTokens(project, token, targetEmail, fetchImpl = fetch) {
	const headers = { authorization: `Bearer ${token}` };
	const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
		project
	)}/databases/(default)/documents`;
	const user = await fetchJson(
		`${base}/users/${encodeURIComponent(targetEmail)}`,
		{ headers },
		'Todo user lookup failed',
		fetchImpl
	);
	const uid = user.fields?.uid?.stringValue;
	if (!uid) fail(`Todo user ${targetEmail} has no UID`);

	const tokens = [];
	let pageToken = '';
	do {
		const query = new URLSearchParams({ pageSize: '100' });
		if (pageToken) query.set('pageToken', pageToken);
		const page = await fetchJson(
			`${base}/notifications/${encodeURIComponent(uid)}/tokens?${query}`,
			{ headers },
			'Notification-token lookup failed',
			fetchImpl
		);
		for (const document of page.documents ?? []) {
			tokens.push(decodeURIComponent(document.name.split('/').at(-1)));
		}
		pageToken = page.nextPageToken ?? '';
	} while (pageToken);

	if (tokens.length === 0) fail(`Todo user ${targetEmail} has no registered notification tokens`);
	return tokens;
}

/**
 * @param {{error?: {details?: Array<{errorCode?: string}>, status?: string}}} body
 * @param {number} status
 */
function deliveryErrorCode(body, status) {
	for (const detail of body.error?.details ?? []) {
		if (detail.errorCode) return detail.errorCode;
	}
	return body.error?.status ?? `HTTP_${status}`;
}

/**
 * @param {string} project
 * @param {string} accessTokenValue
 * @param {string} registrationToken
 * @param {boolean} dryRun
 * @param {Fetch} [fetchImpl]
 */
export async function deliver(
	project,
	accessTokenValue,
	registrationToken,
	dryRun,
	fetchImpl = fetch
) {
	const response = await fetchImpl(
		`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`,
		{
			method: 'POST',
			headers: {
				authorization: `Bearer ${accessTokenValue}`,
				'content-type': 'application/json'
			},
			body: JSON.stringify({
				validate_only: dryRun,
				message: {
					token: registrationToken,
					notification: {
						title: 'Todo notification delivery test',
						body: 'Automated FCM/APNs credential verification.'
					},
					data: {
						action: JSON.stringify({
							type: 'notification_test',
							payload: { description: 'Automated FCM/APNs credential verification.' }
						})
					},
					apns: { payload: { aps: { sound: 'default' } } }
				}
			})
		}
	);
	if (response.ok) return { ok: true };
	let body = {};
	try {
		body = await response.json();
	} catch {}
	return { code: deliveryErrorCode(body, response.status), ok: false };
}

/**
 * @param {{
 *   argv?: string[],
 *   env?: Record<string, string | undefined>,
 *   fetchImpl?: Fetch,
 *   getAccessToken?: () => Promise<string>,
 *   log?: (message: string) => void
 * }} [options]
 */
export async function main({
	argv = process.argv.slice(2),
	env = process.env,
	fetchImpl = fetch,
	getAccessToken = () => accessToken({ env }),
	log = console.log
} = {}) {
	const options = parseArguments(argv);
	if (options.help) {
		usage();
		return;
	}

	const project = projectId(env);
	const token = await getAccessToken();
	const tokens = await registeredTokens(project, token, options.targetEmail, fetchImpl);
	const results = await Promise.all(
		tokens.map((registrationToken) =>
			deliver(project, token, registrationToken, options.dryRun, fetchImpl)
		)
	);
	const failures = results.flatMap((result, index) =>
		result.ok ? [] : [{ code: result.code, index }]
	);
	const summary = {
		target: options.targetEmail,
		mode: options.dryRun ? 'validation' : 'delivery',
		tokenCount: tokens.length,
		successCount: results.length - failures.length,
		failureCount: failures.length,
		failures
	};
	log(JSON.stringify(summary));
	return summary;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
	main()
		.then((summary) => {
			if (summary && summary.failureCount > 0) process.exitCode = 1;
		})
		.catch((error) => {
			console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
			process.exitCode = 1;
		});
}
