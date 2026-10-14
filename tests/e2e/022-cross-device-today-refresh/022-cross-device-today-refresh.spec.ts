import { devices, expect, type APIRequestContext, type Page, test } from '@playwright/test';
import { installAuthSession, seedAuthUsers, type E2EAuthUser } from '../helpers/auth';
import { resetEmulators } from '../helpers/emulator';
import { closeSettings, saveSetting, setting, settings } from '../helpers/list-settings';
import {
	createList,
	createTask,
	ensureListMenuVisible,
	taskInputValues
} from '../helpers/task-details';

const owner: E2EAuthUser = {
	uid: 'cross-device-today-owner',
	email: 'cross-device-today-owner@example.com',
	password: 'password',
	name: 'Cross-device Today Owner',
	photoUrl: ''
};

const recipient: E2EAuthUser = {
	uid: 'cross-device-today-recipient',
	email: 'cross-device-today-recipient@example.com',
	password: 'password',
	name: 'Cross-device Today Recipient',
	photoUrl: ''
};

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only cross-device coverage.');
	await resetEmulators(request);
});

async function signInAs(page: Page, request: APIRequestContext, user: E2EAuthUser) {
	await installAuthSession(page, request, user);
	await page.goto('/profile');
	await expect(page.locator('.drawer-container')).toBeVisible();
	await expect(
		page.getByLabel('Signed-in account').getByText(user.email, { exact: true })
	).toBeVisible();
}

async function shareCurrentList(page: Page) {
	await ensureListMenuVisible(page);
	await page.locator('.mdc-drawer').getByRole('button', { name: 'Edit list' }).first().click();
	await expect(settings(page)).toBeVisible();
	await setting(page, 'Sharing');
	const recipientRow = page.locator('dialog.list-details .choice').filter({
		hasText: recipient.email
	});
	await expect(recipientRow).toBeVisible();
	await recipientRow.locator('input[type="checkbox"]').check({ force: true });
	await saveSetting(page);
	await closeSettings(page);
}

test('Today hydrates a newly discovered list without opening it first', async ({
	browser,
	page: laptop,
	request
}) => {
	test.setTimeout(120_000);
	await seedAuthUsers(request, [owner, recipient]);

	const registrationContext = await browser.newContext({ viewport: laptop.viewportSize()! });
	const phoneContext = await browser.newContext({
		...devices['Pixel 5'],
		viewport: { width: 393, height: 852 },
		deviceScaleFactor: 1,
		isMobile: true,
		hasTouch: true
	});
	const phone = await phoneContext.newPage();
	try {
		const registrationPage = await registrationContext.newPage();
		await signInAs(registrationPage, request, recipient);
		await registrationContext.close();

		await signInAs(laptop, request, owner);
		await signInAs(phone, request, owner);
		await phone.goto('/today');
		await expect(phone.locator('.mdc-top-app-bar__title')).toHaveText('Today');

		const listName = 'Cross-device Today list';
		const taskNames = ['First cross-device Today task', 'Second cross-device Today task'];
		await createList(laptop, listName);
		await shareCurrentList(laptop);
		for (const taskName of taskNames) {
			await createTask(laptop, taskName);
			await laptop.getByRole('button', { name: `Star ${taskName}` }).click();
			await expect(laptop.getByRole('button', { name: `Unstar ${taskName}` })).toBeVisible();
		}

		await laptop.goto('/today');
		await expect.poll(() => taskInputValues(laptop)).toEqual(taskNames.slice().reverse());

		// Seeing the list name proves that the phone replayed the global create-list
		// action. Its list action log must hydrate without requiring the user to open it.
		await ensureListMenuVisible(phone);
		await expect(
			phone.locator('.mdc-drawer .listContainer .item:not(#ghost)').filter({
				has: phone.getByText(listName, { exact: true })
			})
		).toBeVisible();
		await expect
			.poll(() => taskInputValues(phone), { timeout: 15_000 })
			.toEqual(taskNames.slice().reverse());
	} finally {
		await registrationContext.close().catch(() => undefined);
		await phoneContext.close();
	}
});
