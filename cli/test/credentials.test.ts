import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileCredentialStore } from '../src/credentials';
import { runtimePaths } from '../src/paths';

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('file credential store', () => {
	test('persists a refresh token in an owner-only file', async () => {
		const root = await mkdtemp(join(tmpdir(), 'todo-credentials-'));
		directories.push(root);
		const paths = runtimePaths();
		paths.root = join(root, 'state');
		paths.stateDir = join(paths.root, 'state');
		paths.runtimeDir = join(root, 'runtime');
		const credentials = fileCredentialStore('project/test', paths);

		await credentials.write('refresh-token');
		expect(await credentials.read()).toBe('refresh-token');
		const files = (await readdir(paths.root)).sort();
		expect(files).toEqual(['google-refresh-project_test.token', 'state']);
		expect((await stat(paths.root)).mode & 0o777).toBe(0o700);
		expect((await stat(join(paths.root, files[0]))).mode & 0o777).toBe(0o600);

		await credentials.remove();
		expect(await credentials.read()).toBeUndefined();
	});
});
