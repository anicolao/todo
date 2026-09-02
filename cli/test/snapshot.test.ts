import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimePaths } from '../src/paths';
import { Projection } from '../src/projection';
import { SnapshotStore } from '../src/snapshot';
import { SNAPSHOT_VERSION, type SnapshotData } from '../src/types';

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'todo-snapshot-'));
	directories.push(root);
	process.env.TODO_CLI_HOME = root;
	process.env.TODO_CLI_RUNTIME_DIR = join(root, 'run');
	const store = new SnapshotStore(runtimePaths());
	const snapshot: SnapshotData = {
		version: SNAPSHOT_VERSION,
		projectId: 'project',
		uid: 'user',
		createdAt: new Date(0).toISOString(),
		projection: new Projection().snapshot(),
		cursors: { lists: {} }
	};
	return { store, snapshot };
}

describe('snapshot store', () => {
	test('atomically persists private derived state', async () => {
		const { store, snapshot } = await fixture();
		await store.write(snapshot);
		expect(await store.load('project', 'user')).toEqual(snapshot);
		expect((await stat(store.path('project', 'user'))).mode & 0o777).toBe(0o600);
	});

	test('ignores malformed and incompatible snapshots', async () => {
		const { store, snapshot } = await fixture();
		await store.write(snapshot);
		await writeFile(store.path('project', 'user'), '{not json');
		expect(await store.load('project', 'user')).toBeUndefined();
		await store.write({ ...snapshot, version: 999 });
		expect(await store.load('project', 'user')).toBeUndefined();
	});
});
