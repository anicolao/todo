import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { resetEmulators, firestoreEmulatorOrigin, emulatorProjectId } from '../helpers/emulator';
import { installAuthSession, seedAuthUsers } from '../helpers/auth';
import { TestStepHelper } from '../helpers/test-step-helper';
import {
	createList,
	ensureListMenuVisible,
	createTask,
	chooseDate,
	openDetails,
	saveDetails
} from '../helpers/task-details';

const user = {
	uid: 'details-reviewer',
	email: 'details-reviewer@example.com',
	password: 'password',
	name: 'Details reviewer',
	photoUrl: ''
};
test.use({ actionTimeout: 10000 });

test('remote edits offline save and retry preserve the draft', async ({
	page,
	context,
	request
}, testInfo) => {
	test.setTimeout(120000);
	await resetEmulators(request);
	await seedAuthUsers(request, [user]);
	await installAuthSession(page, request, user);
	await page.clock.setFixedTime(new Date('2026-09-16T12:00:00Z'));
	await page.goto('/');
	await createList(page, 'Shared details');
	await createTask(page, 'Water the plants');
	const url = page.url();
	const listId = new URL(url).searchParams.get('listId')!;
	const helper = new TestStepHelper(
		page,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'Synchronization and saving',
		'Two browser tabs edit the same task. Local drafts survive conflicts, offline writes finish on reconnection, and a rejected write can be retried.'
	);
	const other = await context.newPage();
	await other.clock.setFixedTime(new Date('2026-09-16T12:00:00Z'));
	await other.goto(url);
	await expect(other.getByLabel('Task Water the plants', { exact: true })).toBeVisible();
	await openDetails(page);
	await page.getByLabel('Task', { exact: true }).fill('Local watering instructions');
	await openDetails(other);
	await other.getByLabel('Task', { exact: true }).fill('Remote watering instructions');
	await saveDetails(other);
	await page.bringToFront();
	await helper.step('remote_conflict', {
		verifications: [
			{
				spec: 'A remote edit does not overwrite local text and Save waits for a decision',
				check: async () => {
					await expect(
						page.getByText('This task changed elsewhere. Your edits are still here.')
					).toBeVisible();
					await expect(page.getByLabel('Task', { exact: true })).toHaveValue(
						'Local watering instructions'
					);
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
				}
			}
		]
	});
	await page.getByRole('button', { name: 'Keep my edits', exact: true }).click();
	await saveDetails(page);
	await expect(other.getByLabel('Task Local watering instructions', { exact: true })).toBeVisible();
	await openDetails(page);
	await page.getByLabel('Task', { exact: true }).fill('Another local edit');
	await openDetails(other);
	await other.getByLabel('Task', { exact: true }).fill('Latest shared title');
	await saveDetails(other);
	await page.getByRole('button', { name: 'Reload latest task', exact: true }).click();
	await expect(page.getByLabel('Task', { exact: true })).toHaveValue('Latest shared title');
	// A remote change to an untouched schedule merges while local text stays dirty.
	await page.getByLabel('Task', { exact: true }).fill('My preserved title');
	await openDetails(other);
	await chooseDate(other);
	await saveDetails(other);
	await helper.step('untouched_fields_merge', {
		verifications: [
			{
				spec: 'An untouched due date updates without clobbering the edited title',
				check: async () => {
					await expect(page.getByRole('button', { name: /^Due date/ })).toContainText(
						'Fri, Sep 18, 2026'
					);
					await expect(page.getByLabel('Task', { exact: true })).toHaveValue('My preserved title');
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
				}
			}
		]
	});
	await other.close();
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await helper.step('offline_queue', {
		verifications: [
			{
				spec: 'Offline save keeps the draft and reports that synchronization is pending',
				check: async () => {
					await expect(page.getByRole('status')).toContainText('Waiting for connection');
					await expect(page.getByLabel('Task', { exact: true })).toHaveValue('My preserved title');
				}
			}
		]
	});
	await context.setOffline(false);
	await expect(page.locator('dialog.task-details')).not.toBeVisible({ timeout: 20000 });
	await page.reload();
	await openDetails(page);
	await expect(page.getByLabel('Task', { exact: true })).toHaveValue('My preserved title');
	await page.getByLabel('Task', { exact: true }).fill('Retry this title');
	// Change only this isolated emulator's rules, retaining reads while rejecting
	// writes. Restore them even if a verification fails.
	const rulesUrl = `${firestoreEmulatorOrigin}/emulator/v1/projects/${emulatorProjectId}:securityRules`;
	const originalRules = readFileSync('firestore.rules', 'utf8');
	const setRules = async (content: string) => {
		const response = await request.put(rulesUrl, {
			data: { rules: { files: [{ name: 'firestore.rules', content }] } }
		});
		expect(response.ok()).toBe(true);
	};
	await setRules(
		"rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read: if request.auth != null; allow write: if false; } } }"
	);
	try {
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await helper.step('save_failure', {
			verifications: [
				{
					spec: 'A rejected write preserves the draft and offers Retry',
					check: async () => {
						await expect(page.getByRole('alert')).toContainText('Could not save changes');
						await expect(page.getByLabel('Task', { exact: true })).toHaveValue('Retry this title');
						await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
					}
				}
			]
		});
	} finally {
		await setRules(originalRules);
	}
	await page.getByRole('button', { name: 'Retry', exact: true }).click();
	await expect(page.locator('dialog.task-details')).not.toBeVisible();
	await page.reload();
	await openDetails(page);
	await helper.step('retry_persisted', {
		verifications: [
			{
				spec: 'Retry writes the preserved draft and survives reload',
				check: async () =>
					expect(page.getByLabel('Task', { exact: true })).toHaveValue('Retry this title')
			}
		]
	});
	await page.getByLabel('Task', { exact: true }).fill('Draft after removal');
	const deletingTab = await context.newPage();
	await deletingTab.goto(url);
	await expect(deletingTab.getByLabel('Task Retry this title', { exact: true })).toBeVisible();
	await ensureListMenuVisible(deletingTab);
	await deletingTab.getByRole('button', { name: 'Edit list', exact: true }).click();
	await deletingTab.getByRole('button', { name: 'delete', exact: true }).click();
	await helper.step('removed_remotely', {
		verifications: [
			{
				spec: 'Removing the list elsewhere disables Save without deleting the open draft',
				check: async () => {
					await expect(page.getByRole('alert')).toContainText('This task is no longer available');
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
					await expect(page.getByLabel('Task', { exact: true })).toHaveValue('Draft after removal');
				}
			}
		]
	});
	await deletingTab.close();
	await helper.generateDocs();
});
