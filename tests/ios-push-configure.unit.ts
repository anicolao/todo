import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];

function executable(path: string, contents: string) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, contents);
	chmodSync(path, 0o755);
}

function fixture() {
	const root = mkdtempSync(join(tmpdir(), 'todo-ios-push-'));
	temporaryDirectories.push(root);
	const repository = join(root, 'repository');
	const home = join(root, 'home');
	const bin = join(root, 'bin');
	mkdirSync(join(repository, 'scripts'), { recursive: true });
	mkdirSync(join(repository, 'ios', 'secrets'), { recursive: true });
	mkdirSync(home, { recursive: true });
	cpSync('scripts/configure-ios-push.sh', join(repository, 'scripts', 'configure-ios-push.sh'));
	writeFileSync(join(repository, 'ios', 'secrets', 'apns.enc.json'), '{}\n');

	executable(
		join(bin, 'openssl'),
		`#!/usr/bin/env bash
exit 0
`
	);
	executable(
		join(bin, 'sops'),
		`#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" --encrypt "* ]]; then
	output=''
	input="\${!#}"
	while [[ $# -gt 0 ]]; do
		if [[ "$1" == '--output' ]]; then
			output="$2"
			break
		fi
		shift
	done
	cp "$input" "$output"
	exit 0
fi
case "$*" in
	*TODO_APNS_KEY_ID*) printf 'B953ZM4LJZ' ;;
	*TODO_APPLE_TEAM_ID*) printf 'ZHQLA4T47N' ;;
	*TODO_APNS_AUTH_KEY_P8*) printf '%s\n' 'FAKE PRIVATE KEY MATERIAL' ;;
	*) exit 2 ;;
esac
`
	);
	executable(
		join(bin, 'gh'),
		`#!/usr/bin/env bash
touch "$root/gh-was-called"
exit 91
`
	);

	const run = (args: string[] = []) =>
		execFileSync('bash', [join(repository, 'scripts', 'configure-ios-push.sh'), ...args], {
			cwd: repository,
			encoding: 'utf8',
			env: {
				...process.env,
				HOME: home,
				PATH: `${bin}:${process.env.PATH}`
			}
		});

	return { home, repository, root, run };
}

afterEach(() => {
	for (const directory of temporaryDirectories.splice(0)) {
		rmSync(directory, { force: true, recursive: true });
	}
});

describe('iOS push credential installer', () => {
	it('recovers the encrypted key locally without invoking GitHub', () => {
		const { home, root, run } = fixture();
		const output = run();
		const keyDirectory = join(home, '.config', 'todo', 'private_keys');
		const keyPath = join(keyDirectory, 'AuthKey_B953ZM4LJZ.p8');

		expect(readFileSync(keyPath, 'utf8')).toBe('FAKE PRIVATE KEY MATERIAL\n');
		expect(statSync(keyDirectory).mode & 0o777).toBe(0o700);
		expect(statSync(keyPath).mode & 0o777).toBe(0o600);
		expect(output).toContain('Installed APNs key B953ZM4LJZ for Apple team ZHQLA4T47N');
		expect(output).not.toContain('FAKE PRIVATE KEY MATERIAL');
		expect(existsSync(join(root, 'gh-was-called'))).toBe(false);
	});

	it('rotates the encrypted source while preserving an earlier team key', () => {
		const { home, repository, root, run } = fixture();
		const keyDirectory = join(home, '.config', 'todo', 'private_keys');
		const oldKey = join(keyDirectory, 'AuthKey_OLDKEY0001.p8');
		const importedKey = join(root, 'AuthKey_NEWKEY0001.p8');
		mkdirSync(keyDirectory, { recursive: true });
		writeFileSync(oldKey, 'OLDER TEAM KEY\n');
		writeFileSync(importedKey, 'NEW PRIVATE KEY MATERIAL\n');

		run(['--import', importedKey, '--key-id', 'NEWKEY0001', '--team-id', 'ZHQLA4T47N']);

		expect(readFileSync(oldKey, 'utf8')).toBe('OLDER TEAM KEY\n');
		expect(readFileSync(join(keyDirectory, 'AuthKey_NEWKEY0001.p8'), 'utf8')).toBe(
			'NEW PRIVATE KEY MATERIAL\n'
		);
		expect(
			JSON.parse(readFileSync(join(repository, 'ios', 'secrets', 'apns.enc.json'), 'utf8'))
		).toEqual({
			TODO_APNS_AUTH_KEY_P8: 'NEW PRIVATE KEY MATERIAL\n',
			TODO_APNS_KEY_ID: 'NEWKEY0001',
			TODO_APPLE_TEAM_ID: 'ZHQLA4T47N'
		});
		expect(existsSync(join(root, 'gh-was-called'))).toBe(false);
	});
});
