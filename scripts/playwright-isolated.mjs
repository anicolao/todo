import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function gitTopLevel() {
	try {
		return execFileSync('git', ['rev-parse', '--show-toplevel'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return process.cwd();
	}
}

function portBaseForWorktree(worktreePath) {
	if (process.env.E2E_PORT_BASE) {
		const portBase = Number(process.env.E2E_PORT_BASE);
		if (!Number.isInteger(portBase) || portBase < 1024 || portBase > 65530) {
			throw new Error(`E2E_PORT_BASE must be an integer from 1024 to 65530: ${portBase}`);
		}
		return portBase;
	}

	const hash = createHash('sha256').update(worktreePath).digest('hex');
	const bucket = Number.parseInt(hash.slice(0, 8), 16) % 2000;
	return 30000 + bucket * 10;
}

const worktreePath = gitTopLevel();
const hash = createHash('sha256').update(worktreePath).digest('hex').slice(0, 8);
const portBase = portBaseForWorktree(worktreePath);
const host = '127.0.0.1';
const ports = {
	app: portBase,
	firestore: portBase + 1,
	auth: portBase + 2,
	ui: portBase + 3,
	hub: portBase + 4
};
const projectId = process.env.E2E_FIREBASE_PROJECT_ID || `todo-e2e-${hash}`;
const e2eDir = path.join(worktreePath, '.e2e');
const firebaseConfigPath = path.join(e2eDir, 'firebase.json');

fs.mkdirSync(e2eDir, { recursive: true });
fs.writeFileSync(
	firebaseConfigPath,
	`${JSON.stringify(
		{
			firestore: {
				rules: 'firestore.rules',
				indexes: 'firestore.indexes.json'
			},
			emulators: {
				auth: {
					host,
					port: ports.auth
				},
				firestore: {
					host,
					port: ports.firestore
				},
				ui: {
					enabled: true,
					host,
					port: ports.ui
				},
				hub: {
					host,
					port: ports.hub
				},
				singleProjectMode: true
			}
		},
		null,
		2
	)}\n`
);

const env = {
	...process.env,
	E2E_ISOLATED: 'true',
	E2E_APP_PORT: String(ports.app),
	E2E_FIREBASE_CONFIG: firebaseConfigPath,
	E2E_FIREBASE_PROJECT_ID: projectId,
	E2E_FIRESTORE_EMULATOR_HOST: host,
	E2E_FIRESTORE_EMULATOR_PORT: String(ports.firestore),
	E2E_AUTH_EMULATOR_HOST: host,
	E2E_AUTH_EMULATOR_PORT: String(ports.auth),
	E2E_FIREBASE_UI_PORT: String(ports.ui),
	E2E_FIREBASE_HUB_PORT: String(ports.hub),
	FIREBASE_PROJECT_ID: projectId,
	FIRESTORE_EMULATOR_HOST: `${host}:${ports.firestore}`,
	VITE_FIREBASE_PROJECT_ID: projectId,
	VITE_FIRESTORE_EMULATOR_HOST: host,
	VITE_FIRESTORE_EMULATOR_PORT: String(ports.firestore),
	VITE_AUTH_EMULATOR_URL: `http://${host}:${ports.auth}`
};

console.log(
	[
		`E2E worktree: ${worktreePath}`,
		`E2E project: ${projectId}`,
		`E2E ports: app=${ports.app}, firestore=${ports.firestore}, auth=${ports.auth}, ui=${ports.ui}, hub=${ports.hub}`
	].join('\n')
);

const args = process.argv.slice(2);
const result = spawnSync('npx', ['playwright', 'test', ...args], {
	cwd: worktreePath,
	env,
	stdio: 'inherit'
});

process.exit(result.status ?? 1);
