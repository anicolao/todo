import { installAvatarFixtures, recipientPhoto, expectRecipientPhoto } from '../helpers/avatars';
import { closeModalDrawerIfOpen, ensureListMenuVisible } from '../helpers/task-details';
import { setting, saveSetting, closeSettings, settings } from '../helpers/list-settings';
import { expect, type ConsoleMessage, type Locator, type Page, test } from '@playwright/test';
import { installAuthSession, seedAuthUsers, type E2EAuthUser } from '../helpers/auth';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

const owner: E2EAuthUser = {
	uid: 'share-owner-user',
	email: 'share-owner@example.com',
	password: 'password',
	name: 'Share Owner',
	photoUrl: ''
};

const recipient: E2EAuthUser = {
	uid: 'share-recipient-user',
	email: 'share-recipient@example.com',
	password: 'password',
	name: 'Share Recipient',
	photoUrl: recipientPhoto
};

test.beforeEach(async ({ request }, testInfo) => {
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
	await expect(signedInAccount(page).getByText(user.email, { exact: true })).toBeVisible();
}

function signedInAccount(page: Page): Locator {
	return page.getByLabel('Signed-in account');
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
	await page.locator('.mdc-drawer').getByRole('button', { name: 'Edit list' }).first().click();
	await expect(settings(page)).toBeVisible();
	await setting(page, 'Sharing');
}

function shareRecipientRow(page: Page, email: string): Locator {
	return page.locator('dialog.list-details .choice').filter({ hasText: email });
}

function drawerListRow(page: Page, listName: string): Locator {
	return page.locator('.mdc-drawer .list-menu-item').filter({ hasText: listName });
}

test('share a list between two users', async ({ browser, page: ownerPage, request }, testInfo) => {
	test.setTimeout(120000);
	const helper = new TestStepHelper(
		ownerPage,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'Share List Between Users',
		'Verify that one user can share a list, a second user can accept it, and both users see shared task updates.'
	);

	const recipientContext = await browser.newContext({ viewport: ownerPage.viewportSize()! });
	const recipientPage = await recipientContext.newPage();
	await installAvatarFixtures(ownerPage);
	await installAvatarFixtures(recipientPage);
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
						expect(
							signedInAccount(recipientPage).getByText(recipient.email, { exact: true })
						).toBeVisible()
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
						expect(signedInAccount(ownerPage).getByText(owner.email, { exact: true })).toBeVisible()
				}
			]
		});

		await createList(ownerPage, listName);
		await closeModalDrawerIfOpen(ownerPage, listName);
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
		await expectRecipientPhoto(recipientRow);
		await expect(ownerPage.getByRole('region', { name: 'Add people', exact: true })).toContainText(
			recipient.email
		);
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

		await saveSetting(ownerPage);
		await closeSettings(ownerPage);

		helper.usePage(recipientPage);
		await recipientPage.bringToFront();
		await ensureListMenuVisible(recipientPage);
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

		await closeModalDrawerIfOpen(recipientPage, listName);
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

		// Reopening uses the actual email/UID relationship, and search does not lose selection.
		await openEditListDialog(ownerPage);
		await ownerPage.getByLabel('Search people').fill('no matching person');
		await expect(ownerPage.getByText('No matching people', { exact: true })).toBeVisible();
		await ownerPage.getByLabel('Search people').fill(recipient.email);
		await expect(shareRecipientRow(ownerPage, recipient.email).getByRole('checkbox')).toBeChecked();
		await expect(ownerPage.getByRole('region', { name: 'Shared with', exact: true })).toContainText(
			recipient.email
		);
		await expectRecipientPhoto(shareRecipientRow(ownerPage, recipient.email));
		await shareRecipientRow(ownerPage, recipient.email).getByRole('checkbox').uncheck();
		await expect(
			ownerPage.getByRole('region', { name: 'Shared with', exact: true }).getByRole('checkbox')
		).not.toBeChecked();
		await ownerPage.getByRole('button', { name: '‹ Details', exact: true }).click();
		await ownerPage.getByRole('button', { name: 'Discard changes', exact: true }).click();
		await setting(ownerPage, 'Sharing');
		await expect(shareRecipientRow(ownerPage, recipient.email).getByRole('checkbox')).toBeChecked();
		await shareRecipientRow(ownerPage, recipient.email).getByRole('checkbox').uncheck();
		await saveSetting(ownerPage);
		await setting(ownerPage, 'Sharing');
		await expect(
			shareRecipientRow(ownerPage, recipient.email).getByText('Not shared', { exact: true })
		).toBeVisible({ timeout: 15000 });
		await expect(ownerPage.getByRole('region', { name: 'Add people', exact: true })).toContainText(
			recipient.email
		);
		await helper.step('removal_completed', {
			verifications: [
				{
					spec: 'Recipient processes a removal without pointer movement; sender sees its confirmed outcome',
					check: async () => {
						await ensureListMenuVisible(recipientPage);
						await expect(drawerListRow(recipientPage, listName)).toHaveCount(0);
						await expect(
							shareRecipientRow(ownerPage, recipient.email).getByRole('checkbox')
						).not.toBeChecked();
					}
				}
			]
		});
		// Reinvite, reject, and retry through the same screen.
		await shareRecipientRow(ownerPage, recipient.email).getByRole('checkbox').check();
		await saveSetting(ownerPage);
		await setting(ownerPage, 'Sharing');
		await expect(ownerPage.getByRole('region', { name: 'Shared with', exact: true })).toContainText(
			recipient.email
		);
		await helper.step('invitation_pending', {
			verifications: [
				{
					spec: 'Already-sent invitations are read-only and cannot be duplicated',
					check: async () => {
						await expect(shareRecipientRow(ownerPage, recipient.email)).toContainText(
							'Invitation pending'
						);
						await expect(
							shareRecipientRow(ownerPage, recipient.email).getByRole('checkbox')
						).toHaveCount(0);
						await expect(
							ownerPage.getByRole('button', { name: 'Save', exact: true })
						).toBeDisabled();
					}
				}
			]
		});
		await ensureListMenuVisible(recipientPage);
		await expect(drawerListRow(recipientPage, listName)).toBeVisible();
		await drawerListRow(recipientPage, listName).click();
		await drawerListRow(recipientPage, listName)
			.locator('button.material-icons')
			.filter({ hasText: 'close' })
			.click();
		await expect(shareRecipientRow(ownerPage, recipient.email)).toContainText(
			'Invitation declined'
		);
		await expect(ownerPage.getByRole('region', { name: 'Add people', exact: true })).toContainText(
			recipient.email
		);
		await shareRecipientRow(ownerPage, recipient.email).getByRole('checkbox').check();
		await saveSetting(ownerPage);
		await closeSettings(ownerPage);
		await ensureListMenuVisible(recipientPage);
		await drawerListRow(recipientPage, listName).click();
		await drawerListRow(recipientPage, listName)
			.locator('button.material-icons')
			.filter({ hasText: 'check' })
			.click();
		await closeModalDrawerIfOpen(recipientPage, listName);
		await expectTasksVisible(recipientPage, [ownerTask, recipientTask]);
		// Shared deletion is replayed by both participants, rather than only hiding it for the sender.
		await ensureListMenuVisible(ownerPage);
		await ownerPage
			.locator('.mdc-drawer')
			.getByRole('button', { name: 'Edit list' })
			.first()
			.click();
		await settings(ownerPage)
			.getByRole('button', { name: /Delete list… Confirmation required/ })
			.click();
		await settings(ownerPage).getByRole('button', { name: 'Delete list', exact: true }).click();
		await expect(settings(ownerPage)).not.toBeVisible();
		await ensureListMenuVisible(recipientPage);
		await helper.step('shared_deletion', {
			verifications: [
				{
					spec: 'Deleting the list removes it from both participants’ navigation',
					check: async () => {
						await expect(drawerListRow(ownerPage, listName)).toHaveCount(0);
						await expect(drawerListRow(recipientPage, listName)).toHaveCount(0);
					}
				}
			]
		});
		await ownerPage.reload({ waitUntil: 'domcontentloaded' });
		await recipientPage.reload({ waitUntil: 'domcontentloaded' });
		await ensureListMenuVisible(ownerPage);
		await ensureListMenuVisible(recipientPage);
		await expect(drawerListRow(ownerPage, listName)).toHaveCount(0);
		await expect(drawerListRow(recipientPage, listName)).toHaveCount(0);

		await helper.generateDocs();
	} finally {
		await recipientContext.close();
	}
});
