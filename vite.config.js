import { sveltekit } from '@sveltejs/kit/vite';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

let commitHash = 'unknown';
try {
	commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
	// ignore
}

if (process.env.COMMIT_HASH) {
	commitHash = process.env.COMMIT_HASH.substring(0, 7);
}

let isDirty = false;
if (!process.env.CI) {
	try {
		isDirty = execSync('git status --porcelain').toString().trim().length > 0;
	} catch (e) {
		// ignore
	}
}

/** @type {import('vite').UserConfig} */
const config = {
	plugins: [sveltekit()],
	define: {
		'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
		'import.meta.env.VITE_APP_COMMIT_HASH': JSON.stringify(commitHash),
		'import.meta.env.VITE_APP_DIRTY_FLAG': JSON.stringify(isDirty)
	},
	test: { include: ['tests/**/*.unit.ts'] }
};

export default config;
