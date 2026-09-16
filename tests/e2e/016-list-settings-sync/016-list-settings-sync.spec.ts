import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { resetEmulators, firestoreEmulatorOrigin, emulatorProjectId } from '../helpers/emulator';
import { installAuthSession, seedAuthUsers } from '../helpers/auth';
import { createList } from '../helpers/task-details';
import {
	openSettings,
	setting,
	settings,
	saveSetting,
	closeSettings
} from '../helpers/list-settings';
import { TestStepHelper } from '../helpers/test-step-helper';
const user = {
	uid: 'list-reviewer',
	email: 'list-reviewer@example.com',
	password: 'password',
	name: 'List reviewer',
	photoUrl: ''
};

test('remote changes offline saving and atomic retry', async ({
	page,
	context,
	request
}, testInfo) => {
	test.setTimeout(120000);
	await resetEmulators(request);
	await seedAuthUsers(request, [user]);
	await installAuthSession(page, request, user);
	await page.goto('/');
	await createList(page, 'Shared plans');
	const url = page.url();
	const helper = new TestStepHelper(
		page,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'List settings synchronization',
		'Remote edits preserve drafts, offline saves wait for acknowledgment, and rejected label writes retry without duplicates.'
	);
	const other = await context.newPage();
	await other.goto(url);
	await openSettings(page);
	await setting(page, 'Name');
	await page.getByLabel('List name', { exact: true }).fill('My local name');
	await openSettings(other);
	await setting(other, 'Name');
	await other.getByLabel('List name', { exact: true }).fill('Remote name');
	await saveSetting(other);
	await helper.step('name_conflict', {
		verifications: [
			{
				spec: 'Remote rename preserves local text and requires a conflict choice',
				check: async () => {
					await expect(page.getByRole('alert')).toContainText('This setting changed elsewhere');
					await expect(page.getByLabel('List name', { exact: true })).toHaveValue('My local name');
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
				}
			}
		]
	});
	await page.getByRole('button', { name: 'Keep my changes', exact: true }).click();
	await saveSetting(page);
	await expect(settings(other).getByRole('button', { name: /^Name / })).toContainText(
		'My local name'
	);
	await setting(page, 'Name');
	await page.getByLabel('List name', { exact: true }).fill('Another local name');
	await setting(other, 'Name');
	await other.getByLabel('List name', { exact: true }).fill('Latest name');
	await saveSetting(other);
	await page.getByRole('button', { name: 'Reload latest', exact: true }).click();
	await expect(page.getByLabel('List name', { exact: true })).toHaveValue('Latest name');
	await page.getByLabel('List name', { exact: true }).fill('Offline name');
	await other.close();
	await context.setOffline(true);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await helper.step('offline_save', {
		verifications: [
			{
				spec: 'Offline save retains the setting until the connection returns',
				check: async () => {
					await expect(page.getByRole('status')).toContainText('Waiting for connection');
					await expect(page.getByLabel('List name', { exact: true })).toHaveValue('Offline name');
				}
			}
		]
	});
	await context.setOffline(false);
	await expect(
		settings(page).getByRole('heading', { name: 'List details', exact: true })
	).toBeVisible({ timeout: 20000 });
	await closeSettings(page);
	await page.reload();
	await openSettings(page);
	await expect(settings(page).getByRole('button', { name: /^Name / })).toContainText(
		'Offline name'
	);
	await setting(page, 'Labels');
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await page.getByLabel('New label', { exact: true }).fill('Existing label');
	await saveSetting(page);
	await setting(page, 'Labels');
	await page.getByLabel('Include in Existing label').uncheck();
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await page.getByLabel('New label', { exact: true }).fill('Retry label');
	const rulesUrl = `${firestoreEmulatorOrigin}/emulator/v1/projects/${emulatorProjectId}:securityRules`;
	const originalRules = readFileSync('firestore.rules', 'utf8');
	const setRules = async (content: string) => {
		const response = await request.put(rulesUrl, {
			data: { rules: { files: [{ name: 'firestore.rules', content }] } }
		});
		expect(response.ok()).toBe(true);
	};
	// Allow prerequisite editor creation but reject list actions. The global label
	// creation and existing membership removal must both fail with the same batch.
	await setRules(
		"rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read: if request.auth != null; } match /editors/{document=**} { allow write: if request.auth != null; } match /from/{document=**} { allow write: if request.auth != null; } } }"
	);
	try {
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await helper.step('atomic_failure', {
			verifications: [
				{
					spec: 'Rejected batch retains both membership edits and the new-label input',
					check: async () => {
						await expect(page.getByRole('alert')).toContainText('Could not save changes');
						await expect(page.getByLabel('New label', { exact: true })).toHaveValue('Retry label');
						await expect(page.getByLabel('Include in Existing label')).not.toBeChecked();
						await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeEnabled();
					}
				}
			]
		});
		const verifier = await context.newPage();
		await verifier.goto(url);
		await openSettings(verifier);
		await setting(verifier, 'Labels');
		await expect(verifier.getByLabel('Include in Existing label')).toBeChecked();
		await expect(verifier.getByLabel('Include in Retry label')).toHaveCount(0);
		await verifier.getByRole('button', { name: '‹ Details', exact: true }).click();
		await settings(verifier)
			.getByRole('button', { name: /Delete list… Confirmation required/ })
			.click();
		await settings(verifier).getByRole('button', { name: 'Delete list', exact: true }).click();
		await expect(verifier.getByRole('alert')).toContainText('Could not save changes');
		await expect(verifier.getByRole('button', { name: 'Keep list', exact: true })).toBeEnabled();
		await verifier.close();
	} finally {
		await setRules(originalRules);
	}
	await saveSetting(page);
	await closeSettings(page);
	await page.reload();
	await openSettings(page);
	await setting(page, 'Labels');
	await helper.step('retry_persisted', {
		verifications: [
			{
				spec: 'Retry creates exactly one new label and applies the membership removal',
				check: async () => {
					await expect(page.getByLabel('Include in Retry label')).toHaveCount(1);
					await expect(page.getByLabel('Include in Retry label')).toBeChecked();
					await expect(page.getByLabel('Include in Existing label')).not.toBeChecked();
				}
			}
		]
	});
	// Label subscriptions merge untouched memberships while preserving typed creation text.
	const labelPeer = await context.newPage();
	await labelPeer.goto(url);
	await openSettings(labelPeer);
	await setting(labelPeer, 'Labels');
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await page.getByLabel('New label', { exact: true }).fill('Local label retained');
	await labelPeer.getByLabel('Include in Existing label').check();
	await saveSetting(labelPeer);
	await helper.step('label_update_preserves_input', {
		verifications: [
			{
				spec: 'Remote membership updates merge without replacing a new-label draft',
				check: async () => {
					await expect(page.getByLabel('Include in Existing label')).toBeChecked();
					await expect(page.getByLabel('New label', { exact: true })).toHaveValue(
						'Local label retained'
					);
				}
			}
		]
	});
	await page.getByRole('button', { name: 'Cancel new label', exact: true }).click();
	await page.getByLabel('Include in Retry label').uncheck();
	await setting(labelPeer, 'Labels');
	await labelPeer.getByLabel('Include in Retry label').uncheck();
	await saveSetting(labelPeer);
	await expect(page.getByRole('alert')).toContainText('This setting changed elsewhere');
	await page.getByRole('button', { name: 'Reload latest', exact: true }).click();
	await labelPeer.close();
	await page.getByRole('button', { name: '‹ Details', exact: true }).click();
	// Editing permission disappearance is observable without submitting another write.
	await setting(page, 'Name');
	await page.getByLabel('List name', { exact: true }).fill('Permission draft');
	const listId = new URL(url).searchParams.get('listId');
	const editorUrl = `${firestoreEmulatorOrigin}/v1/projects/${emulatorProjectId}/databases/(default)/documents/editors/${listId}/${user.uid}/editor`;
	const removedEditor = await request.delete(editorUrl, {
		headers: { Authorization: 'Bearer owner' }
	});
	expect(removedEditor.ok()).toBe(true);
	await expect(page.getByRole('alert')).toContainText('no longer available');
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await expect(page.getByLabel('List name', { exact: true })).toHaveValue('Permission draft');
	await request.patch(editorUrl, {
		headers: { Authorization: 'Bearer owner' },
		data: { fields: { email: { stringValue: user.email } } }
	});
	// A permission-denied listener is terminal: reopen after permissions are restored.
	await page.getByRole('button', { name: '‹ Details', exact: true }).click();
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await closeSettings(page);
	await page.reload();
	await openSettings(page);
	// Remote deletion disables any unsaved setting rather than recreating a list.
	const remover = await context.newPage();
	await remover.goto(url);
	await openSettings(remover);
	await setting(page, 'Name');
	await page.getByLabel('List name', { exact: true }).fill('Keep this draft');
	await settings(remover)
		.getByRole('button', { name: /Delete list… Confirmation required/ })
		.click();
	await settings(remover).getByRole('button', { name: 'Delete list', exact: true }).click();
	await helper.step('remote_deletion', {
		verifications: [
			{
				spec: 'Deleted list leaves the draft readable and disables Save',
				check: async () => {
					await expect(page.getByRole('alert')).toContainText('no longer available');
					await expect(page.getByLabel('List name', { exact: true })).toHaveValue(
						'Keep this draft'
					);
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
				}
			}
		]
	});
	await remover.close();
	await helper.generateDocs();
});
