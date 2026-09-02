import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { TodoServiceError } from './errors';

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
		return {
			async read() {
				try {
					const result = await run('secret-tool', ['lookup', ...attributes]);
					return result.code === 0 ? result.stdout.trim() : undefined;
				} catch {
					throw new TodoServiceError(
						'credential_store',
						'secret-tool is required to restore Todo login on Linux'
					);
				}
			},
			async write(value) {
				let result: CommandResult;
				try {
					result = await run(
						'secret-tool',
						['store', '--label', 'Todo CLI Google login', ...attributes],
						value
					);
				} catch {
					throw new TodoServiceError('credential_store', 'secret-tool is required on Linux');
				}
				if (result.code !== 0) {
					throw new TodoServiceError('credential_store', 'Could not save login in the keyring');
				}
			},
			async remove() {
				try {
					await run('secret-tool', ['clear', ...attributes]);
				} catch {
					// There is nothing useful to remove when secret-tool is unavailable.
				}
			}
		};
	}
	throw new TodoServiceError(
		'credential_store',
		`No credential-store adapter is available on ${platform()}`
	);
}
