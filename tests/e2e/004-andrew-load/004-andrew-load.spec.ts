import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectId = 'todo-firebase-1a740';
const backupPath = process.env.ANDREW_LOAD_BACKUP;
const maxLoadMs = Number(process.env.ANDREW_LOAD_MAX_MS || 120000);
const shouldResetFirestore = process.env.ANDREW_LOAD_RESET_FIRESTORE === 'true';
const shouldSeedFirestore = process.env.ANDREW_LOAD_SKIP_SEED !== 'true';
const andrew = {
	uid: 'mbQ1dSL9wRap9Uh6m4CK1LGBtZL2',
	email: 'andrew.blackledge@gmail.com',
	password: process.env.VITE_TEST_LOGIN_PASSWORD || 'password',
	name: 'Andrew Blackledge',
	photoUrl: 'https://i.pravatar.cc/150?u=andrew.blackledge%40gmail.com'
};

test.describe.configure({ mode: 'serial' });
test.setTimeout(300000);

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only performance harness.');
	test.skip(
		shouldSeedFirestore && !backupPath,
		'Set ANDREW_LOAD_BACKUP=firestore-backups/<backup>.json to run this local-only test.'
	);

	const resolvedBackupPath = backupPath ? path.resolve(backupPath) : '';
	if (shouldSeedFirestore && !fs.existsSync(resolvedBackupPath)) {
		throw new Error(`Andrew load backup does not exist: ${resolvedBackupPath}`);
	}

	if (shouldResetFirestore) {
		await request.delete(
			`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
			{ timeout: 180000 }
		);
	}
	await request.delete(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`);

	if (shouldSeedFirestore) {
		execFileSync(process.execPath, ['scripts/firestore-copy.mjs', 'seed', resolvedBackupPath], {
			cwd: process.cwd(),
			stdio: 'inherit'
		});
	}

	const response = await request.post(
		`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchCreate?key=fake-api-key`,
		{
			headers: {
				authorization: 'Bearer owner'
			},
			data: {
				allowOverwrite: true,
				users: [
					{
						localId: andrew.uid,
						email: andrew.email,
						emailVerified: true,
						displayName: andrew.name,
						photoUrl: andrew.photoUrl,
						rawPassword: andrew.password
					}
				]
			}
		}
	);
	if (!response.ok()) {
		throw new Error(`Could not import Andrew auth user: ${await response.text()}`);
	}
});

async function signInAsAndrew(page: Page) {
	await page.goto('/');
	await page.addStyleTag({
		content: '.firebase-emulator-warning { display: none !important; }'
	});
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

test('loads Andrew production data from the Firestore emulator', async ({ page }, testInfo) => {
	const consoleEvents: string[] = [];
	let cacheWriteMs: number | null = null;
	page.on('console', (message) => {
		const text = message.text();
		if (
			text.includes('uid ready') ||
			text.includes('Filtering ') ||
			text.includes('load list data') ||
			text.includes('initialDatabaseLoadComplete') ||
			text.includes('Initial data load for UI complete') ||
			text.includes('Write the database!')
		) {
			consoleEvents.push(text);
		}
		if (text.includes('Write the database!') && cacheWriteMs === null) {
			cacheWriteMs = Date.now() - start;
		}
	});

	const start = Date.now();
	await signInAsAndrew(page);
	await expect(page.locator('.drawer-container')).toBeVisible({ timeout: maxLoadMs });
	const appShellLoadMs = Date.now() - start;
	await expect(page.getByLabel('New list')).toBeVisible({ timeout: 10000 });
	await expect(page.locator('.mdc-drawer .listContainer .item:not(#ghost)').first()).toBeVisible({
		timeout: 10000
	});
	const firstListVisibleMs = Date.now() - start;
	const listCount = await page.locator('.mdc-drawer .listContainer .item:not(#ghost)').count();
	await expect
		.poll(() => cacheWriteMs, {
			timeout: maxLoadMs,
			message: 'Wait for the IndexedDB cache write to be scheduled'
		})
		.not.toBeNull();

	const summary = {
		appShellLoadMs,
		firstListVisibleMs,
		cacheWriteMs,
		listCount,
		consoleEvents
	};
	console.log(`Andrew load summary: ${JSON.stringify(summary, null, 2)}`);
	testInfo.annotations.push({
		type: 'andrew-load-summary',
		description: JSON.stringify({ appShellLoadMs, firstListVisibleMs, cacheWriteMs, listCount })
	});

	expect(appShellLoadMs).toBeLessThan(maxLoadMs);
});
