import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SNAPSHOT_VERSION, type SnapshotData } from './types';
import { ensurePrivateDirectories, type RuntimePaths } from './paths';

function safePart(value: string) {
	return value.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

export class SnapshotStore {
	readonly paths: RuntimePaths;
	#timer?: ReturnType<typeof setTimeout>;
	#pending = Promise.resolve();

	constructor(paths: RuntimePaths) {
		this.paths = paths;
	}

	path(projectId: string, uid: string) {
		return join(this.paths.stateDir, `${safePart(projectId)}-${safePart(uid)}.json`);
	}

	async load(projectId: string, uid: string): Promise<SnapshotData | undefined> {
		try {
			const parsed = JSON.parse(await readFile(this.path(projectId, uid), 'utf8')) as SnapshotData;
			if (
				parsed.version !== SNAPSHOT_VERSION ||
				parsed.projectId !== projectId ||
				parsed.uid !== uid ||
				!parsed.projection ||
				!parsed.cursors
			) {
				return undefined;
			}
			return parsed;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				console.error('Ignoring unreadable Todo CLI snapshot:', (error as Error).message);
			}
			return undefined;
		}
	}

	async write(snapshot: SnapshotData) {
		await ensurePrivateDirectories(this.paths);
		const destination = this.path(snapshot.projectId, snapshot.uid);
		const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
		await writeFile(temporary, `${JSON.stringify(snapshot)}\n`, { mode: 0o600 });
		await rename(temporary, destination);
	}

	schedule(snapshot: () => SnapshotData, delay = 500) {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = undefined;
			this.#pending = this.#pending
				.then(() => this.write(snapshot()))
				.catch((error) => console.error('Unable to write Todo CLI snapshot:', error));
		}, delay);
	}

	async flush(snapshot: SnapshotData) {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = undefined;
		}
		await this.#pending;
		await this.write(snapshot);
	}

	async remove(projectId: string, uid: string) {
		if (this.#timer) {
			clearTimeout(this.#timer);
			this.#timer = undefined;
		}
		await this.#pending;
		await rm(this.path(projectId, uid), { force: true });
	}
}
