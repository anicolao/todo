import { spawn } from 'node:child_process';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { platform } from 'node:os';
import { join } from 'node:path';
import { TodoServiceError } from './errors';
import { ensurePrivateDirectories, runtimePaths, type RuntimePaths } from './paths';

interface CommandResult {
	stdout: string;
	stderr: string;
	code: number;
}

function run(command: string, args: string[], input?: string): Promise<CommandResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
		child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
		child.once('error', reject);
		child.once('close', (code) => resolve({ stdout, stderr, code: code ?? 1 }));
		child.stdin.end(input);
	});
}

export interface CredentialStore {
	read(): Promise<string | undefined>;
	write(value: string): Promise<void>;
	remove(): Promise<void>;
}

export function fileCredentialStore(
	projectId: string,
	paths: RuntimePaths = runtimePaths()
): CredentialStore {
	const safeProjectId = projectId.replace(/[^A-Za-z0-9._-]/g, '_');
	const path = join(paths.root, `google-refresh-${safeProjectId}.token`);
	return {
		async read() {
			try {
				return (await readFile(path, 'utf8')).trim() || undefined;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
				throw error;
			}
		},
		async write(value) {
			await ensurePrivateDirectories(paths);
			const temporary = `${path}.${process.pid}.tmp`;
			await writeFile(temporary, `${value}\n`, { mode: 0o600 });
			await rename(temporary, path);
		},
		async remove() {
			await rm(path, { force: true });
		}
	};
}

export function credentialStore(projectId: string): CredentialStore {
	const service = `todo-cli-google-refresh-${projectId}`;
	if (platform() === 'darwin') {
		return {
			async read() {
				const result = await run('security', [
					'find-generic-password',
					'-a',
					projectId,
					'-s',
					service,
					'-w'
				]);
				return result.code === 0 ? result.stdout.trim() : undefined;
			},
			async write(value) {
				const result = await run('security', [
					'add-generic-password',
					'-U',
					'-a',
					projectId,
					'-s',
					service,
					'-w',
					value
				]);
				if (result.code !== 0) {
					throw new TodoServiceError('credential_store', 'Could not save login in macOS Keychain');
				}
			},
			async remove() {
				await run('security', ['delete-generic-password', '-a', projectId, '-s', service]);
			}
		};
	}
	if (platform() === 'linux') {
		const attributes = ['service', 'todo-cli', 'project', projectId];
		const fallback = fileCredentialStore(projectId);
		return {
			async read() {
				try {
					const result = await run('secret-tool', ['lookup', ...attributes]);
					if (result.code === 0 && result.stdout.trim()) return result.stdout.trim();
				} catch {
					// Minimal and headless Linux sessions often have no Secret Service.
				}
				return fallback.read();
			},
			async write(value) {
				try {
					const result = await run(
						'secret-tool',
						['store', '--label', 'Todo CLI Google login', ...attributes],
						value
					);
					if (result.code === 0) {
						await fallback.remove();
						return;
					}
				} catch {
					// Fall through to the private file credential store.
				}
				console.warn('Secret Service unavailable; using the private file credential store');
				await fallback.write(value);
			},
			async remove() {
				try {
					await run('secret-tool', ['clear', ...attributes]);
				} catch {
					// There is nothing useful to remove when secret-tool is unavailable.
				}
				await fallback.remove();
			}
		};
	}
	throw new TodoServiceError(
		'credential_store',
		`No credential-store adapter is available on ${platform()}`
	);
}
