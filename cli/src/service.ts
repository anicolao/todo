#!/usr/bin/env bun

import { open, readFile, rm, writeFile, type FileHandle } from 'node:fs/promises';
import { TodoApplication } from './application';
import { ensurePrivateDirectories, runtimePaths } from './paths';
import { RpcServer } from './rpc';

async function processIsAlive(pid: number) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function acquireLock(): Promise<FileHandle | undefined> {
	const paths = await ensurePrivateDirectories();
	for (let attempt = 0; attempt < 20; attempt++) {
		try {
			const handle = await open(paths.lock, 'wx', 0o600);
			await handle.writeFile(`${process.pid}\n`);
			await writeFile(paths.pid, `${process.pid}\n`, { mode: 0o600 });
			return handle;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
			const pid = Number(await readFile(paths.lock, 'utf8').catch(() => '0'));
			if (pid > 0 && (await processIsAlive(pid))) return undefined;
			if (attempt < 10) {
				await new Promise((resolve) => setTimeout(resolve, 25));
				continue;
			}
			await rm(paths.lock, { force: true });
			await rm(paths.pid, { force: true });
			await rm(paths.socket, { force: true });
		}
	}
	return undefined;
}

export async function runService() {
	const paths = await ensurePrivateDirectories(runtimePaths());
	const lock = await acquireLock();
	if (!lock) return;
	const application = new TodoApplication(paths);
	let shuttingDown = false;
	let rpc!: RpcServer;
	const shutdown = async () => {
		if (shuttingDown) return;
		shuttingDown = true;
		await application.stop().catch((error) => console.error('Shutdown snapshot failed:', error));
		await rpc.stop().catch(() => undefined);
		await lock.close().catch(() => undefined);
		await rm(paths.lock, { force: true });
		await rm(paths.pid, { force: true });
	};
	rpc = new RpcServer(paths.socket, async (request) => {
		if (request.method === 'service.stop') {
			setTimeout(() => void shutdown().then(() => process.exit(0)), 20);
			return { stopping: true };
		}
		return application.handle(request);
	});
	await rpc.start();
	process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
	process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));
	void application
		.initialize()
		.catch((error) => console.error('Todo service initialization failed:', error));
}

if (import.meta.main) {
	runService().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
