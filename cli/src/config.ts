import { readFile, rename, writeFile } from 'node:fs/promises';
import type { RuntimePaths } from './paths';
import { ensurePrivateDirectories } from './paths';

interface ConfigData {
	defaultLists?: Record<string, string>;
}

export class ConfigStore {
	constructor(readonly paths: RuntimePaths) {}

	async read(): Promise<ConfigData> {
		try {
			return JSON.parse(await readFile(this.paths.config, 'utf8')) as ConfigData;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
			throw error;
		}
	}

	async defaultList(projectId: string, uid: string) {
		return (await this.read()).defaultLists?.[`${projectId}:${uid}`];
	}

	async setDefaultList(projectId: string, uid: string, defaultListId: string) {
		await ensurePrivateDirectories(this.paths);
		const current = await this.read();
		const value: ConfigData = {
			...current,
			defaultLists: { ...current.defaultLists, [`${projectId}:${uid}`]: defaultListId }
		};
		const temporary = `${this.paths.config}.${process.pid}.tmp`;
		await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
		await rename(temporary, this.paths.config);
	}
}
