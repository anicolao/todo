import { test, expect } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }) => {
	await resetEmulators(request);
});

async function openDrawerIfNeeded(page: import('@playwright/test').Page) {
	const newListInput = page.getByLabel('New list');
	if (!(await newListInput.isVisible())) {
		const menuButton = page.locator('button.material-icons:has-text("menu")');
		if (await menuButton.isVisible()) {
			await menuButton.click();
		}
	}
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

	await openDrawerIfNeeded(page);
	await page.locator('.mdc-drawer button.material-icons:has-text("edit")').first().click({
		force: true
	});
	await expect(page.getByText('Edit List')).toBeVisible();

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

	await page.locator('.mdc-drawer').getByText(labelName).click();

	await helper.step('label_opened', {
		description: 'User opened the label and sees the source list as a contained group.',
		verifications: [
			{ spec: 'URL is the label route', check: async () => expect(page).toHaveURL(/labels/) },
			{
				spec: 'Source list group name is visible',
				check: async () =>
					expect(page.getByRole('button', { name: `Hide ${listName}` })).toBeVisible()
			}
		]
	});

	await openDrawerIfNeeded(page);
	await page.locator('.mdc-drawer').getByText(listName).click();
	await expect(page).toHaveURL(/lists\?listId=/);
	await openDrawerIfNeeded(page);
	await page.locator('.mdc-drawer button.material-icons:has-text("edit")').first().click({
		force: true
	});
	await expect(page.getByText('Edit List')).toBeVisible();
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
	await page.locator('.mdc-drawer').getByText(labelName).click();

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

	await openDrawerIfNeeded(page);
	await page.locator('.mdc-drawer').getByText(listName).click();
	await expect(page).toHaveURL(/lists\?listId=/);
	await openDrawerIfNeeded(page);
	await page.locator('.mdc-drawer button.material-icons:has-text("edit")').first().click({
		force: true
	});
	await expect(page.getByText('Edit List')).toBeVisible();
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
	await page.locator('.mdc-drawer').getByText(labelName).click();

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
