import {
	installAvatarFixtures,
	recipientPhoto,
	brokenPhoto,
	expectRecipientPhoto
} from '../helpers/avatars';
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
const owner = {
	uid: 'directory-owner',
	email: 'directory-owner@example.com',
	password: 'password',
	name: 'Directory owner',
	photoUrl: ''
};
const longEmail = 'a.long.email.address.for.a.person.with.no.display.name@example.com';

test('search preserves selection and failed multi-person sharing retries once', async ({
	page,
	request
}, testInfo) => {
	test.setTimeout(120000);
	await resetEmulators(request);
	await installAvatarFixtures(page);
	await seedAuthUsers(request, [owner]);
	await installAuthSession(page, request, owner);
	const documents = `${firestoreEmulatorOrigin}/v1/projects/${emulatorProjectId}/databases/(default)/documents`;
	for (let index = 0; index < 25; index++) {
		const email = index === 0 ? longEmail : `person-${index}@example.com`;
		const response = await request.patch(`${documents}/users/${encodeURIComponent(email)}`, {
			headers: { Authorization: 'Bearer owner' },
			data: {
				fields: {
					uid: { stringValue: `person-${index}` },
					email: { stringValue: email },
					name: { stringValue: index === 0 ? '' : `Person ${index}` },
					photo: {
						stringValue:
							index === 0 || index === 24 ? recipientPhoto : index === 1 ? brokenPhoto : ''
					}
				}
			}
		});
		expect(response.ok()).toBe(true);
	}
	await page.goto('/');
	await createList(page, 'Directory sharing');
	await openSettings(page);
	await setting(page, 'Sharing');
	const helper = new TestStepHelper(
		page,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'Sharing search and atomic retry',
		'Profile photos and separate Shared with/Add people groups survive searching and sharing updates. Missing or broken photos fall back safely. A denied recipient prevents the whole save; retry creates exactly one request per selected person.'
	);
	await expect(settings(page).getByRole('checkbox')).toHaveCount(25);
	const addPeople = page.getByRole('region', { name: 'Add people', exact: true });
	const sharedPeople = page.getByRole('region', { name: 'Shared with', exact: true });
	await expect(addPeople.getByRole('checkbox')).toHaveCount(25);
	await expect(sharedPeople).toHaveCount(0);
	await expectRecipientPhoto(addPeople.locator('.choice').filter({ hasText: longEmail }));
	// Broken and absent photos have a readable fallback, without broken image icons.
	for (const email of ['person-1@example.com', 'person-2@example.com']) {
		const row = addPeople.locator('.choice').filter({ hasText: email });
		await expect(row.locator('img')).toHaveCount(0);
		await expect(row.locator('.avatar')).toHaveText(/P[12]/);
	}
	await page.getByLabel('Search people').fill(longEmail);
	await page.getByRole('checkbox', { name: `Share with ${longEmail}`, exact: true }).check();
	await page.getByLabel('Search people').fill('person-24@example.com');
	await page
		.getByRole('checkbox', { name: 'Share with person-24@example.com', exact: true })
		.check();
	await expect(
		addPeople.getByRole('checkbox', { name: 'Share with person-24@example.com', exact: true })
	).toBeChecked();
	await expect(sharedPeople).toHaveCount(0);
	await page.getByLabel('Search people').fill('nothing matches');
	await expect(page.getByText('No matching people', { exact: true })).toBeVisible();
	await page.getByLabel('Search people').fill(longEmail);
	await helper.step('search_keeps_selection', {
		verifications: [
			{
				spec: 'Filtering preserves both selections and missing names fall back to wrapped email',
				check: async () => {
					await expect(
						page.getByRole('checkbox', { name: `Share with ${longEmail}`, exact: true })
					).toBeChecked();
					await expect(settings(page).getByRole('listitem')).toHaveCount(2);
					expect(
						await settings(page)
							.locator('.editor-body')
							.evaluate((el) => el.scrollWidth <= el.clientWidth)
					).toBe(true);
				}
			}
		]
	});
	const rulesUrl = `${firestoreEmulatorOrigin}/emulator/v1/projects/${emulatorProjectId}:securityRules`;
	const originalRules = readFileSync('firestore.rules', 'utf8');
	const setRules = async (content: string) => {
		const result = await request.put(rulesUrl, {
			data: { rules: { files: [{ name: 'firestore.rules', content }] } }
		});
		expect(result.ok()).toBe(true);
	};
	const count = async (uid: string) => {
		const result = await request.get(`${documents}/from/${owner.uid}/to/${uid}/requests`, {
			headers: { Authorization: 'Bearer owner' }
		});
		expect(result.ok()).toBe(true);
		return ((await result.json()).documents || []).length;
	};
	await setRules(
		"rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read: if request.auth != null; } match /from/{uid}/to/{target}/requests/{id} { allow write: if request.auth.uid == uid && target != 'person-24'; } } }"
	);
	try {
		await page.getByRole('button', { name: 'Save', exact: true }).click();
		await helper.step('sharing_batch_rejected', {
			verifications: [
				{
					spec: 'One denied target sends neither invitation and leaves both selections available for retry',
					check: async () => {
						await expect(page.getByRole('alert')).toContainText('Could not save changes');
						await expect(
							page.getByRole('checkbox', { name: `Share with ${longEmail}`, exact: true })
						).toBeChecked();
						expect(await count('person-0')).toBe(0);
						expect(await count('person-24')).toBe(0);
					}
				}
			]
		});
	} finally {
		await setRules(originalRules);
	}
	await saveSetting(page);
	await closeSettings(page);
	await page.reload();
	await openSettings(page);
	await setting(page, 'Sharing');
	await helper.step('retry_sends_once', {
		verifications: [
			{
				spec: 'Retry sends exactly one invitation to each recipient and pending rows cannot be selected again',
				check: async () => {
					expect(await count('person-0')).toBe(1);
					expect(await count('person-24')).toBe(1);
					await expect(settings(page).getByText('Invitation pending', { exact: true })).toHaveCount(
						2
					);
					await expect(addPeople.getByRole('checkbox')).toHaveCount(23);
					await expect(sharedPeople.locator('.choice')).toHaveCount(2);
					await expect(sharedPeople.getByRole('checkbox')).toHaveCount(0);
					await expectRecipientPhoto(
						sharedPeople.locator('.choice').filter({ hasText: longEmail })
					);
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
				}
			}
		]
	});
	await page.getByLabel('Search people').fill('person-2');
	await helper.step('shared_and_available_groups', {
		verifications: [
			{
				spec: 'Pending recipients have photos in Shared with; uninvited matches have their own Add people group',
				check: async () => {
					await expect(sharedPeople.locator('.choice')).toHaveCount(1);
					await expectRecipientPhoto(sharedPeople.locator('.choice'));
					await expect(addPeople.getByRole('checkbox')).toHaveCount(5);
					await expect(settings(page).getByRole('status')).toHaveText('6 people');
				}
			}
		]
	});
	// Search applies to both groups without losing their status or headings.
	await page.getByLabel('Search people').fill('person-24@example.com');
	await expect(sharedPeople.locator('.choice')).toHaveCount(1);
	await expect(addPeople).toHaveCount(0);
	await page.getByLabel('Search people').fill('person-2@example.com');
	await expect(addPeople.locator('.choice')).toHaveCount(1);
	await expect(sharedPeople).toHaveCount(0);
	await page.getByLabel('Search people').fill('nothing matches');
	await expect(page.getByText('No matching people', { exact: true })).toBeVisible();
	await helper.generateDocs();
});
