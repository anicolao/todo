import { expect, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { createList, signIn } from '../helpers/task-details';
import {
	openSettings,
	setting,
	settings,
	saveSetting,
	closeSettings
} from '../helpers/list-settings';
import { TestStepHelper } from '../helpers/test-step-helper';
test.beforeEach(async ({ request }) => resetEmulators(request));

test('independent settings saves and confirmed deletion', async ({ page }, testInfo) => {
	test.setTimeout(120000);
	await signIn(page);
	await createList(page, 'Weekend plans');
	const helper = new TestStepHelper(
		page,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'List settings',
		'Name and labels save independently; discarding a later setting preserves earlier saves. Deletion requires its own confirmation.'
	);
	await openSettings(page);
	await helper.step('settings_overview', {
		verifications: [
			{
				spec: 'Overview has Close, no Save, and a regular delete settings row',
				check: async () => {
					await expect(
						settings(page).getByRole('button', { name: 'Save', exact: true })
					).toHaveCount(0);
					await expect(
						settings(page).getByRole('button', { name: 'Close', exact: true })
					).toBeVisible();
					await expect(
						settings(page).getByRole('button', { name: /Delete list… Confirmation required/ })
					).toBeVisible();
				}
			}
		]
	});
	await setting(page, 'Name');
	await page.getByLabel('List name', { exact: true }).fill('   ');
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await expect(page.getByText('Enter a list name.', { exact: true })).toBeVisible();
	await page.getByLabel('List name', { exact: true }).fill('Weekend adventures');
	await saveSetting(page);
	await setting(page, 'Labels');
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await page.getByLabel('New label', { exact: true }).fill('Never created');
	await page.getByRole('button', { name: '‹ Details', exact: true }).click();
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await helper.step('independent_save', {
		verifications: [
			{
				spec: 'Discarding Labels preserves the already saved name and creates no label',
				check: async () => {
					await expect(settings(page).getByRole('button', { name: /^Name / })).toContainText(
						'Weekend adventures'
					);
					await expect(settings(page).getByRole('button', { name: /^Labels / })).toContainText(
						'No labels'
					);
				}
			}
		]
	});
	await setting(page, 'Labels');
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await page.getByLabel('New label', { exact: true }).fill('Summer');
	await helper.step('inline_label', {
		verifications: [
			{
				spec: 'Label creation uses the Labels Save button and retains entered text',
				check: async () => {
					await expect(page.getByLabel('New label', { exact: true })).toHaveValue('Summer');
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(1);
				}
			}
		]
	});
	await saveSetting(page);
	await closeSettings(page);
	await page.reload();
	await openSettings(page);
	await expect(settings(page).getByRole('button', { name: /^Name / })).toContainText(
		'Weekend adventures'
	);
	await expect(settings(page).getByRole('button', { name: /^Labels / })).toContainText('Summer');
	await setting(page, 'Labels');
	await expect(page.getByLabel('Include in Summer')).toBeChecked();
	await page.getByLabel('Search labels').fill('not present');
	await expect(page.getByText('No matching labels', { exact: true })).toBeVisible();
	await page.getByLabel('Search labels').fill('');
	await expect(page.getByLabel('Include in Summer')).toBeChecked();
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await page.getByLabel('New label', { exact: true }).fill('Summer');
	await page.getByRole('button', { name: 'Use existing Summer', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await page.getByLabel('Include in Summer').uncheck();
	await saveSetting(page);
	await helper.step('membership_removed', {
		verifications: [
			{
				spec: 'Removing membership saves independently and updates the overview',
				check: async () => {
					await expect(settings(page).getByRole('button', { name: /^Labels / })).toContainText(
						'No labels'
					);
				}
			}
		]
	});
	await settings(page)
		.getByRole('button', { name: /Delete list… Confirmation required/ })
		.click();
	await helper.step('delete_confirmation', {
		verifications: [
			{
				spec: 'Delete opens a separate confirmation with Keep list focused',
				check: async () => {
					await expect(
						page.getByRole('heading', { name: 'Delete “Weekend adventures”?', exact: true })
					).toBeVisible();
					await expect(page.getByRole('button', { name: 'Keep list', exact: true })).toBeFocused();
				}
			}
		]
	});
	await page.getByRole('button', { name: 'Keep list', exact: true }).click();
	await closeSettings(page);
	await page.reload();
	await openSettings(page);
	await settings(page)
		.getByRole('button', { name: /Delete list… Confirmation required/ })
		.click();
	await settings(page).getByRole('button', { name: 'Delete list', exact: true }).click();
	await expect(settings(page)).not.toBeVisible({ timeout: 20000 });
	await page.reload();
	await expect(
		page.getByRole('banner').getByText('Weekend adventures', { exact: true })
	).toHaveCount(0);
	await helper.generateDocs();
});
