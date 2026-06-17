import { expect, type ConsoleMessage, type Locator, type Page, test } from '@playwright/test';
import { installAuthSession, seedAuthUsers, type E2EAuthUser } from '../helpers/auth';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

const owner: E2EAuthUser = {
	uid: 'share-owner-user',
	email: 'share-owner@example.com',
	password: 'password',
	name: 'Share Owner',
	photoUrl: 'https://i.pravatar.cc/150?u=share-owner%40example.com'
};

const recipient: E2EAuthUser = {
	uid: 'share-recipient-user',
	email: 'share-recipient@example.com',
	password: 'password',
	name: 'Share Recipient',
	photoUrl: 'https://i.pravatar.cc/150?u=share-recipient%40example.com'
};

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only sharing coverage.');

	await resetEmulators(request);
});

async function signInAs(
	page: Page,
	request: Parameters<typeof installAuthSession>[1],
	user: E2EAuthUser
) {
	await installAuthSession(page, request, user);
	await page.goto('/profile');
	await expect(page.locator('.drawer-container')).toBeVisible();
	await expect(page.locator('p').filter({ hasText: user.email })).toBeVisible();
}

async function ensureListMenuVisible(page: Page) {
	const newList = page.getByLabel('New list');
	if (!(await newList.isVisible())) {
		await page.locator('button.material-icons').filter({ hasText: 'menu' }).click();
	}
	await expect(newList).toBeVisible();
}

async function createList(page: Page, listName: string) {
	await ensureListMenuVisible(page);
	const consoleMessages: string[] = [];
	const onConsole = (message: ConsoleMessage) => consoleMessages.push(message.text());
	const newList = page.getByLabel('New list');
	page.on('console', onConsole);
	try {
		await newList.fill(listName);
		await newList.press('Enter');
		await expect(page).toHaveURL(/lists\/?\?listId=/);
		const listId = new URL(page.url()).searchParams.get('listId');
		await expect
			.poll(() => consoleMessages.some((text) => text.endsWith(` on ${listId}`)))
			.toBe(true);
		await expect(
			page.locator('.mdc-top-app-bar__title').filter({ hasText: listName })
		).toBeVisible();
		await expect(page.getByLabel('New task')).toBeVisible();
	} finally {
		page.off('console', onConsole);
	}
}

async function createTask(page: Page, taskName: string) {
	const newTask = page.getByLabel('New task');
	await newTask.fill(taskName);
	await newTask.blur();
	await expectTasksVisible(page, [taskName]);
	await expect(newTask).toHaveValue('');
}

function taskInputs(page: Page) {
	return page.locator('.app-content .listContainer .item:not(#ghost) input.description');
}

async function visibleTaskValues(page: Page) {
	return taskInputs(page).evaluateAll((inputs) =>
		inputs.map((input) => (input as HTMLInputElement).value)
	);
}

async function expectTasksVisible(page: Page, taskNames: string[]) {
	for (const taskName of taskNames) {
		await expect.poll(async () => visibleTaskValues(page)).toContain(taskName);
	}
}

async function openEditListDialog(page: Page) {
	await ensureListMenuVisible(page);
	await page
		.locator('.mdc-drawer button.material-icons')
		.filter({ hasText: 'edit' })
		.first()
		.click();
	await expect(page.getByText('Edit List')).toBeVisible();
}

function shareRecipientRow(page: Page, email: string): Locator {
	return page
		.locator('#editlist-dialog-content .mdc-deprecated-list-item')
		.filter({ hasText: email });
}

function drawerListRow(page: Page, listName: string): Locator {
	return page.locator('.mdc-drawer .mdc-deprecated-list-item').filter({ hasText: listName });
}

test('share a list between two users', async ({ browser, page: ownerPage, request }, testInfo) => {
	const helper = new TestStepHelper(ownerPage, testInfo);
	helper.setMetadata(
		'Share List Between Users',
		'Verify that one user can share a list, a second user can accept it, and both users see shared task updates.'
	);

	const recipientContext = await browser.newContext();
	const recipientPage = await recipientContext.newPage();
	const listName = 'Shared Groceries';
	const ownerTask = 'Owner adds apples';
	const recipientTask = 'Recipient adds coffee';

	try {
		await seedAuthUsers(request, [owner, recipient]);

		await signInAs(recipientPage, request, recipient);
		helper.usePage(recipientPage);
		await helper.step('recipient_registered', {
			description: 'Recipient signs in once so they are discoverable as a share target.',
			verifications: [
				{
					spec: 'Recipient profile is visible',
					check: async () =>
						expect(recipientPage.locator('p').filter({ hasText: recipient.email })).toBeVisible()
				}
			]
		});

		await signInAs(ownerPage, request, owner);
		helper.usePage(ownerPage);
		await helper.step('owner_signed_in', {
			description: 'Owner signs in and sees the application shell.',
			verifications: [
				{
					spec: 'Owner profile is visible',
					check: async () =>
						expect(ownerPage.locator('p').filter({ hasText: owner.email })).toBeVisible()
				}
			]
		});

		await createList(ownerPage, listName);
		await createTask(ownerPage, ownerTask);

		await helper.step('owner_list_created', {
			description: 'Owner creates a list and adds the first shared task.',
			verifications: [
				{
					spec: 'Owner list title is visible',
					check: async () =>
						expect(
							ownerPage.locator('.mdc-top-app-bar__title').filter({ hasText: listName })
						).toBeVisible()
				},
				{
					spec: 'Owner task is visible',
					check: async () => expectTasksVisible(ownerPage, [ownerTask])
				}
			]
		});

		await openEditListDialog(ownerPage);
		const recipientRow = shareRecipientRow(ownerPage, recipient.email);
		await expect(recipientRow).toBeVisible();
		await recipientRow.locator('input[type="checkbox"]').check({ force: true });

		await helper.step('recipient_selected_for_share', {
			description: 'Owner selects the recipient in the list sharing dialog.',
			verifications: [
				{
					spec: 'Recipient is listed in share dialog',
					check: async () => expect(recipientRow).toBeVisible()
				},
				{
					spec: 'Recipient share checkbox is checked',
					check: async () => expect(recipientRow.locator('input[type="checkbox"]')).toBeChecked()
				}
			]
		});

		await ownerPage.getByRole('button', { name: 'Done' }).click();
		await expect(ownerPage.getByText('Edit List')).not.toBeVisible();

		helper.usePage(recipientPage);
		await recipientPage.bringToFront();
		const pendingShareRow = drawerListRow(recipientPage, listName);
		await expect(pendingShareRow).toBeVisible();
		await pendingShareRow.click();

		await helper.step('recipient_share_pending', {
			description: 'Recipient receives the pending shared list with accept and reject controls.',
			verifications: [
				{
					spec: 'Pending shared list is visible',
					check: async () => expect(pendingShareRow).toBeVisible()
				},
				{
					spec: 'Accept share control is visible',
					check: async () =>
						expect(
							pendingShareRow.locator('button.material-icons').filter({ hasText: 'check' })
						).toBeVisible()
				},
				{
					spec: 'Reject share control is visible',
					check: async () =>
						expect(
							pendingShareRow.locator('button.material-icons').filter({ hasText: 'close' })
						).toBeVisible()
				}
			]
		});

		await pendingShareRow.locator('button.material-icons').filter({ hasText: 'check' }).click();

		await helper.step('recipient_accepted_share', {
			description: 'Recipient accepts the share and can view the owner task.',
			verifications: [
				{
					spec: 'Shared list title is visible to recipient',
					check: async () =>
						expect(
							recipientPage.locator('.mdc-top-app-bar__title').filter({ hasText: listName })
						).toBeVisible()
				},
				{
					spec: 'Owner task is visible to recipient',
					check: async () => expectTasksVisible(recipientPage, [ownerTask])
				}
			]
		});

		await createTask(recipientPage, recipientTask);

		await helper.step('recipient_added_task', {
			description: 'Recipient adds a task to the accepted shared list.',
			verifications: [
				{
					spec: 'Owner task remains visible to recipient',
					check: async () => expectTasksVisible(recipientPage, [ownerTask])
				},
				{
					spec: 'Recipient task is visible to recipient',
					check: async () => expectTasksVisible(recipientPage, [recipientTask])
				}
			]
		});

		helper.usePage(ownerPage);
		await ownerPage.bringToFront();

		await helper.step('owner_sees_recipient_update', {
			description: 'Owner sees the task added by the recipient on the shared list.',
			verifications: [
				{
					spec: 'Owner task remains visible to owner',
					check: async () => expectTasksVisible(ownerPage, [ownerTask])
				},
				{
					spec: 'Recipient task is visible to owner',
					check: async () => expectTasksVisible(ownerPage, [recipientTask])
				}
			]
		});

		await helper.generateDocs();
	} finally {
		await recipientContext.close();
	}
});
