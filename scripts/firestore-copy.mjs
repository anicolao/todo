import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { OAuth2Client } from 'google-auth-library';

const FIREBASE_CLIENT_ID =
	'563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const projectId = process.env.FIREBASE_PROJECT_ID || 'todo-firebase-1a740';
const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
const firestoreEmulatorHost = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').replace(
	/^https?:\/\//,
	''
);
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents`;
const emulatorBase = `http://${firestoreEmulatorHost}/v1/projects/${projectId}/databases/${databaseId}/documents`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readFirebaseCliTokens() {
	const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
	const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
	if (!config.tokens?.refresh_token) {
		throw new Error(`No Firebase CLI refresh token found in ${configPath}`);
	}
	return config.tokens;
}

async function getAccessToken() {
	const tokens = await readFirebaseCliTokens();
	if (tokens.access_token && tokens.expires_at && tokens.expires_at > Date.now() + 60000) {
		return tokens.access_token;
	}
	const client = new OAuth2Client(FIREBASE_CLIENT_ID, FIREBASE_CLIENT_SECRET);
	client.setCredentials({ refresh_token: tokens.refresh_token });
	try {
		const result = await client.getAccessToken();
		if (!result.token) {
			throw new Error('Could not obtain a Google access token from Firebase CLI credentials');
		}
		return result.token;
	} catch (error) {
		throw new Error(
			`Could not refresh Firebase CLI access token: ${error.code || error.message || error}`
		);
	}
}

async function requestJson(url, options = {}) {
	const response = await fetch(url, options);
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${body}`);
	}
	if (response.status === 204) {
		return {};
	}
	return response.json();
}

function encodeDocumentPath(documentPath) {
	return documentPath
		.split('/')
		.map((part) => encodeURIComponent(part))
		.join('/');
}

function relativeDocumentPath(name) {
	const marker = `/databases/${databaseId}/documents/`;
	const index = name.indexOf(marker);
	if (index === -1) {
		throw new Error(`Unexpected document name: ${name}`);
	}
	return name.slice(index + marker.length);
}

async function listDocuments(baseUrl, token, collectionPath) {
	const documents = [];
	let pageToken;
	do {
		const url = new URL(`${baseUrl}/${encodeDocumentPath(collectionPath)}`);
		url.searchParams.set('pageSize', '300');
		if (pageToken) {
			url.searchParams.set('pageToken', pageToken);
		}
		const json = await requestJson(url, {
			headers: { authorization: `Bearer ${token}` }
		});
		documents.push(...(json.documents || []));
		pageToken = json.nextPageToken;
	} while (pageToken);
	return documents;
}

async function runCollectionGroupQuery(baseUrl, token, collectionId) {
	const results = await requestJson(`${baseUrl}:runQuery`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${token}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({
			structuredQuery: {
				from: [{ collectionId, allDescendants: true }]
			}
		})
	});
	return results.map((result) => result.document).filter((document) => document);
}

async function collectTodoDocuments(baseUrl, token) {
	const documentsByPath = new Map();
	const addDocuments = (documents) => {
		for (const document of documents) {
			documentsByPath.set(relativeDocumentPath(document.name), document);
		}
	};

	addDocuments(await listDocuments(baseUrl, token, 'users'));
	addDocuments(await listDocuments(baseUrl, token, 'activity'));
	addDocuments(await listDocuments(baseUrl, token, 'share'));
	addDocuments(await runCollectionGroupQuery(baseUrl, token, 'actions'));
	addDocuments(await runCollectionGroupQuery(baseUrl, token, 'editor'));
	addDocuments(await runCollectionGroupQuery(baseUrl, token, 'requests'));

	return [...documentsByPath.values()];
}

function documentBackup(document) {
	return {
		path: relativeDocumentPath(document.name),
		fields: document.fields || {},
		createTime: document.createTime,
		updateTime: document.updateTime
	};
}

async function backup(outputPath) {
	const token = await getAccessToken();
	const documents = await collectTodoDocuments(firestoreBase, token);
	documents.sort((a, b) =>
		relativeDocumentPath(a.name).localeCompare(relativeDocumentPath(b.name))
	);
	const backupData = {
		projectId,
		databaseId,
		createdAt: new Date().toISOString(),
		documentCount: documents.length,
		documents: documents.map(documentBackup)
	};
	await fs.mkdir(path.dirname(outputPath), { recursive: true });
	await fs.writeFile(outputPath, `${JSON.stringify(backupData, null, 2)}\n`);
	console.log(`Backed up ${backupData.documentCount} documents to ${outputPath}`);
}

async function seed(inputPath) {
	const backupData = JSON.parse(await fs.readFile(inputPath, 'utf8'));
	const batchSize = 400;
	for (let index = 0; index < backupData.documents.length; index += batchSize) {
		const batch = backupData.documents.slice(index, index + batchSize);
		for (let attempt = 1; ; attempt++) {
			try {
				await requestJson(`${emulatorBase}:commit`, {
					method: 'POST',
					headers: {
						authorization: 'Bearer owner',
						'content-type': 'application/json'
					},
					body: JSON.stringify({
						writes: batch.map((document) => ({
							update: {
								name: `projects/${projectId}/databases/${databaseId}/documents/${document.path}`,
								fields: document.fields || {}
							}
						}))
					})
				});
				break;
			} catch (error) {
				if (!String(error.message).includes('409') || attempt >= 5) {
					throw error;
				}
				await sleep(attempt * 1000);
			}
		}
		console.log(
			`Seeded ${Math.min(index + batch.length, backupData.documents.length)} / ${
				backupData.documents.length
			}`
		);
	}
	console.log(`Seeded ${backupData.documents.length} documents from ${inputPath}`);
}

const [command, file] = process.argv.slice(2);
if (!command || !file || !['backup', 'seed'].includes(command)) {
	console.error('Usage: node scripts/firestore-copy.mjs <backup|seed> <file>');
	process.exit(1);
}

if (command === 'backup') {
	await backup(file);
} else {
	await seed(file);
}
