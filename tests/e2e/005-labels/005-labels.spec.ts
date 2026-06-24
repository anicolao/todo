import { test, expect } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }) => {
	await resetEmulators(request);
});

async function openDrawerIfNeeded(page: import('@playwright/test').Page) {
	const newListInput = page.getByLabel('New list');
	const drawer = page.locator('.mdc-drawer');
	const drawerIsModal = await drawer.evaluate((element) =>
		element.classList.contains('mdc-drawer--modal')
	);
	const drawerBox = await drawer.boundingBox();
	const drawerIsOpen = !drawerIsModal || (drawerBox !== null && drawerBox.x >= -1);
	if (!drawerIsOpen) {
		const menuButton = page.locator('button.material-icons:has-text("menu")');
		if (await menuButton.isVisible()) {
			await menuButton.click();
		}
		await expect(drawer).toHaveClass(/mdc-drawer--open/, { timeout: 10000 });
		await expect
			.poll(async () => {
				const box = await drawer.boundingBox();
				return box ? Math.round(box.x) : -999;
			})
			.toBeGreaterThanOrEqual(0);
		await expect(newListInput).toBeVisible({ timeout: 10000 });
	}
}

async function openCurrentListEditDialog(page: import('@playwright/test').Page, listName: string) {
	await expect(page.getByRole('banner').getByText(listName, { exact: true })).toBeVisible({
		timeout: 10000
	});
	await openDrawerIfNeeded(page);
	const drawer = page.locator('.mdc-drawer');
	const editButton = drawer
		.locator('.list-menu-item')
		.filter({ hasText: listName })
		.getByRole('button', { name: 'Edit list' });
	await expect(editButton).toBeVisible({ timeout: 10000 });
	await editButton.dispatchEvent('pointerdown');
	await expect(page.getByText('Edit List')).toBeVisible({ timeout: 10000 });
}

async function openNestedListFromActiveLabel(page: import('@playwright/test').Page, listName: string) {
	await openDrawerIfNeeded(page);
	const nestedList = page.locator('.nested-list-item').filter({
		has: page.getByText(listName, { exact: true })
	});
	await expect(nestedList).toBeVisible({ timeout: 10000 });
	await page.waitForTimeout(650);
	await nestedList.locator('.mdc-deprecated-list-item').click();
	await expect(page).toHaveURL(/lists\?listId=/);
}

async function clickDrawerLabel(page: import('@playwright/test').Page, labelName: string) {
	await page.locator('.mdc-drawer .list-menu-item').filter({ hasText: labelName }).first().click();
}

function drawerTopLevelItem(page: import('@playwright/test').Page, name: string) {
	return page
		.locator('.mdc-drawer .listContainer > .mdc-deprecated-list > .item')
		.filter({ has: page.locator('.list-menu-item').getByText(name, { exact: true }) })
		.first();
}

async function expectNestedListVisible(page: import('@playwright/test').Page, listName: string) {
	await expect(page.locator('.nested-list-item').getByText(listName)).toBeVisible({
		timeout: 10000
	});
}

async function expectNestedListVisibleUnderLabel(
	page: import('@playwright/test').Page,
	labelName: string,
	listName: string
) {
	await expect(drawerTopLevelItem(page, labelName).locator('.nested-list-item').getByText(listName))
		.toBeVisible({
			timeout: 10000
		});
}

async function expectNestedListHiddenUnderLabel(
	page: import('@playwright/test').Page,
	labelName: string,
	listName: string
) {
	await expect(
		drawerTopLevelItem(page, labelName).locator('.nested-list-item').getByText(listName)
	).toHaveCount(0);
}

async function createDraftLabel(page: import('@playwright/test').Page, labelName: string) {
	const labelsEditor = page.locator('.labels-editor').filter({
		has: page.getByLabel('New label')
	});
	await expect(labelsEditor).toBeVisible({ timeout: 10000 });
	await labelsEditor.getByLabel('New label').fill(labelName);
	await expect(labelsEditor.getByRole('button', { name: 'Create label' })).toBeEnabled();
	await labelsEditor.getByRole('button', { name: 'Create label' }).dispatchEvent('click');
	await expect(labelsEditor.getByLabel('New label')).toHaveValue('');
}

async function expectDrawerOpen(page: import('@playwright/test').Page) {
	const drawer = page.locator('.mdc-drawer');
	await expect
		.poll(async () => {
			const isModal = await drawer.evaluate((element) =>
				element.classList.contains('mdc-drawer--modal')
			);
			const box = await drawer.boundingBox();
			return !isModal || (box !== null && Math.round(box.x) >= 0);
		})
		.toBe(true);
}

async function expectMobileDrawerClosed(page: import('@playwright/test').Page) {
	const drawer = page.locator('.mdc-drawer');
	const isModal = await drawer.evaluate((element) => element.classList.contains('mdc-drawer--modal'));
	if (!isModal) {
		return;
	}
	await expect
		.poll(async () => {
			const box = await drawer.boundingBox();
			return box ? Math.round(box.x) : 0;
		})
		.toBeLessThan(0);
}

test('create a label containing a list', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata(
		'Labels',
		'Verify that a user can create a label from the list edit dialog and see list tasks through that label.'
	);

	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
	await openDrawerIfNeeded(page);

	const listName = 'Label Source List';
	await page.getByLabel('New list').fill(listName);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/lists\?listId=/);
	await expect(page.getByRole('banner').getByText(listName)).toBeVisible();

	await helper.step('source_list_created', {
		description: 'User has created a source list.',
		verifications: [
			{
				spec: 'Source list is visible',
				check: async () => expect(page.getByRole('banner').getByText(listName)).toBeVisible()
			}
		]
	});

	await openCurrentListEditDialog(page, listName);

	const labelName = 'Important Label';
	await helper.step('label_creation_ui_available', {
		description: 'User can create a label from the list edit dialog.',
		verifications: [
			{
				spec: 'Labels section is visible',
				check: async () => expect(page.getByText('Labels', { exact: true })).toBeVisible()
			},
			{
				spec: 'New label field is visible',
				check: async () => expect(page.getByLabel('New label')).toBeVisible()
			},
			{
				spec: 'Create label button is disabled until a name is entered',
				check: async () =>
					expect(page.getByRole('button', { name: 'Create label' })).toBeDisabled()
			}
		]
	});

	await page.getByLabel('New label').fill(labelName);
	await expect(page.getByRole('button', { name: 'Create label' })).toBeEnabled();
	await page.getByRole('button', { name: 'Create label' }).click();
	await expect(page.getByLabel('New label')).toHaveValue('');
	await page.getByRole('button', { name: 'Done' }).click();

	await helper.step('label_created', {
		description: 'User created a label containing the current list.',
		verifications: [
			{
				spec: 'Label appears in the sidebar',
				check: async () => {
					await openDrawerIfNeeded(page);
					await expect(page.locator('.mdc-drawer').getByText(labelName)).toBeVisible({
						timeout: 10000
					});
				}
			}
		]
	});

	await clickDrawerLabel(page, labelName);

	await helper.step('label_pinned_and_expanded', {
		description: 'User tapped a collapsed label and it expanded as a pinned folder.',
		verifications: [
			{ spec: 'User remains on the source list', check: async () => expect(page).toHaveURL(/lists/) },
			{
				spec: 'Drawer remains open so the user can choose a nested list',
				check: async () => expectDrawerOpen(page)
			},
			{
				spec: 'Source list appears nested under the pinned label',
				check: async () => expectNestedListVisible(page, listName)
			},
			{
				spec: 'Pinned label can be unpinned',
				check: async () =>
					expect(page.getByRole('button', { name: `Unpin label ${labelName}` })).toBeVisible()
			}
		]
	});

	await clickDrawerLabel(page, labelName);
	await helper.step('expanded_label_tap_selects_label', {
		description: 'User tapped an already-expanded label to select the label view.',
		verifications: [
			{ spec: 'URL is the label route', check: async () => expect(page).toHaveURL(/labels/) },
			{
				spec: 'Mobile drawer is dismissed after selecting the label',
				check: async () => expectMobileDrawerClosed(page)
			},
			{
				spec: 'Source list group name is visible',
				check: async () =>
					expect(page.getByRole('button', { name: `Hide ${listName}` })).toBeVisible()
			}
		]
	});

	await openDrawerIfNeeded(page);
	await helper.step('label_sidebar_folder_opened', {
		description: 'The active label opens like a folder in the sidebar.',
		verifications: [
			{
				spec: 'Source list appears nested under the active label',
				check: async () => expectNestedListVisible(page, listName)
			},
			{
				spec: 'Source list is hidden from the top-level sidebar',
				check: async () =>
					expect(
						page
							.locator('.mdc-drawer .listContainer > .mdc-deprecated-list > .item > .list-menu-item')
							.filter({
								hasText: listName
							})
					).toHaveCount(0)
			}
		]
	});

	await page.getByRole('button', { name: `Unpin label ${labelName}` }).click();
	await helper.step('active_unpinned_label_collapsed', {
		description: 'The selected label collapses when it is not pinned and no current child list keeps it open.',
		verifications: [
			{
				spec: 'Nested source list is hidden',
				check: async () => expect(page.locator('.nested-list-item').getByText(listName)).toHaveCount(0)
			}
		]
	});

	await clickDrawerLabel(page, labelName);
	await expectNestedListVisible(page, listName);
	await openNestedListFromActiveLabel(page, listName);

	await openDrawerIfNeeded(page);
	await helper.step('pinned_label_stays_open_after_nested_navigation', {
		description: 'The pinned label stays expanded after navigating to a list inside it.',
		verifications: [
			{
				spec: 'Nested source list remains visible',
				check: async () => expectNestedListVisible(page, listName)
			}
		]
	});

	await page.getByRole('button', { name: `Unpin label ${labelName}` }).click();
	await helper.step('unpinned_label_collapses_after_navigation_away', {
		description: 'An unpinned label collapses after the user navigates away from its nested list.',
		verifications: [
			{
				spec: 'Unpinned label is still expanded while viewing its nested list',
				check: async () => expectNestedListVisible(page, listName)
			}
		]
	});

	await page.goto('/profile');
	await openDrawerIfNeeded(page);
	await helper.step('unpinned_label_collapsed_after_navigation_away', {
		description: 'The unpinned label collapsed after the user navigated away from its nested list.',
		verifications: [
			{
				spec: 'Nested source list is no longer shown in the drawer',
				check: async () => expect(page.locator('.nested-list-item').getByText(listName)).toHaveCount(0)
			}
		]
	});

	await clickDrawerLabel(page, labelName);
	await clickDrawerLabel(page, labelName);
	await expectMobileDrawerClosed(page);
	await openNestedListFromActiveLabel(page, listName);

	await openCurrentListEditDialog(page, listName);
	await expect(page.getByLabel(`Include in ${labelName}`)).toBeChecked();
	await page.getByLabel(`Include in ${labelName}`).click();

	await helper.step('label_removal_draft_cancelled', {
		description: 'User can draft removing the current list from the label and cancel it.',
		verifications: [
			{
				spec: 'Label checkbox stays unchecked while the dialog is open',
				check: async () => expect(page.getByLabel(`Include in ${labelName}`)).not.toBeChecked()
			}
		]
	});

	await page.getByRole('button', { name: 'Cancel' }).click();
	await openDrawerIfNeeded(page);
	await clickDrawerLabel(page, labelName);

	await helper.step('label_unchanged_after_cancel', {
		description: 'User cancelled the draft removal and the label still contains the source list.',
		verifications: [
			{ spec: 'URL is the label route', check: async () => expect(page).toHaveURL(/labels/) },
			{
				spec: 'Source list group is still visible',
				check: async () =>
					expect(page.getByRole('button', { name: `Hide ${listName}` })).toBeVisible()
			}
		]
	});

	await openNestedListFromActiveLabel(page, listName);
	await openCurrentListEditDialog(page, listName);
	await expect(page.getByLabel(`Include in ${labelName}`)).toBeChecked();
	await page.getByLabel(`Include in ${labelName}`).click();

	await helper.step('label_removed_from_list', {
		description: 'User removed the current list from the label.',
		verifications: [
			{
				spec: 'Label checkbox stays unchecked',
				check: async () => expect(page.getByLabel(`Include in ${labelName}`)).not.toBeChecked()
			}
		]
	});

	await page.getByRole('button', { name: 'Done' }).click();
	await openDrawerIfNeeded(page);
	await clickDrawerLabel(page, labelName);

	await helper.step('label_empty_after_removal', {
		description: 'User opened the label and no longer sees the removed list.',
		verifications: [
			{ spec: 'URL is the label route', check: async () => expect(page).toHaveURL(/labels/) },
			{
				spec: 'Removed source list group is absent',
				check: async () =>
					expect(page.getByRole('button', { name: `Hide ${listName}` })).toHaveCount(0)
			}
		]
	});

	await helper.generateDocs();
});

test('active list expands every containing label', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
	await openDrawerIfNeeded(page);

	const listA = 'Overlap List A';
	const listB = 'Overlap List B';
	const labelA = 'Label A';
	const labelB = 'Label B';
	const labelAB = 'Label AB';

	await page.getByLabel('New list').fill(listA);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('banner').getByText(listA)).toBeVisible({ timeout: 10000 });
	await openCurrentListEditDialog(page, listA);
	await createDraftLabel(page, labelA);
	await createDraftLabel(page, labelAB);
	await page.getByRole('button', { name: 'Done' }).click();
	await openDrawerIfNeeded(page);
	await expect(drawerTopLevelItem(page, labelA)).toBeVisible({ timeout: 10000 });
	await expect(drawerTopLevelItem(page, labelAB)).toBeVisible({ timeout: 10000 });

	await openDrawerIfNeeded(page);
	await page.getByLabel('New list').fill(listB);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('banner').getByText(listB)).toBeVisible({ timeout: 10000 });
	await openCurrentListEditDialog(page, listB);
	await expect(page.getByLabel(`Include in ${labelAB}`)).toBeVisible({ timeout: 10000 });
	await createDraftLabel(page, labelB);
	await page.getByLabel(`Include in ${labelAB}`).click();
	await expect(page.getByLabel(`Include in ${labelAB}`)).toBeChecked();
	await page.getByRole('button', { name: 'Done' }).click();

	await openDrawerIfNeeded(page);
	await expectNestedListVisibleUnderLabel(page, labelB, listB);
	await expectNestedListVisibleUnderLabel(page, labelAB, listB);
	await expectNestedListHiddenUnderLabel(page, labelA, listA);

	await drawerTopLevelItem(page, labelAB)
		.locator('.nested-list-item')
		.filter({ has: page.getByText(listA, { exact: true }) })
		.locator('.mdc-deprecated-list-item')
		.click();
	await expect(page.getByRole('banner').getByText(listA)).toBeVisible({ timeout: 10000 });
	await openDrawerIfNeeded(page);
	await expectNestedListVisibleUnderLabel(page, labelA, listA);
	await expectNestedListVisibleUnderLabel(page, labelAB, listA);
	await expectNestedListHiddenUnderLabel(page, labelB, listB);
});
