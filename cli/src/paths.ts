import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { chmod, mkdir } from 'node:fs/promises';

export interface RuntimePaths {
	root: string;
	stateDir: string;
	runtimeDir: string;
	socket: string;
	lock: string;
	pid: string;
	log: string;
	config: string;
}

function defaultStateRoot() {
	if (process.env.TODO_CLI_HOME) return process.env.TODO_CLI_HOME;
	if (platform() === 'darwin') return join(homedir(), 'Library', 'Application Support', 'todo-cli');
	return process.env.XDG_STATE_HOME
		? join(process.env.XDG_STATE_HOME, 'todo-cli')
		: join(homedir(), '.local', 'state', 'todo-cli');
}

function defaultRuntimeRoot() {
	if (process.env.TODO_CLI_RUNTIME_DIR) return process.env.TODO_CLI_RUNTIME_DIR;
	const uid = typeof process.getuid === 'function' ? process.getuid() : 'user';
	return process.env.XDG_RUNTIME_DIR
		? join(process.env.XDG_RUNTIME_DIR, `todo-cli-${uid}`)
		: join(tmpdir(), `todo-cli-${uid}`);
}

export function runtimePaths(): RuntimePaths {
	const root = defaultStateRoot();
	const runtimeDir = defaultRuntimeRoot();
	return {
		root,
		stateDir: join(root, 'state'),
		runtimeDir,
		socket: join(runtimeDir, 'service.sock'),
		lock: join(runtimeDir, 'service.lock'),
		pid: join(runtimeDir, 'service.pid'),
		log: join(root, 'service.log'),
		config: join(root, 'config.json')
	};
}

export async function ensurePrivateDirectories(paths = runtimePaths()) {
	await mkdir(paths.root, { recursive: true, mode: 0o700 });
	await mkdir(paths.stateDir, { recursive: true, mode: 0o700 });
	await mkdir(paths.runtimeDir, { recursive: true, mode: 0o700 });
	await Promise.all([
		chmod(paths.root, 0o700),
		chmod(paths.stateDir, 0o700),
		chmod(paths.runtimeDir, 0o700)
	]);
	return paths;
}
