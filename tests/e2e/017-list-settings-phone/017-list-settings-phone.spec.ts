import { expect, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { createList, createTask, signIn, ensureListMenuVisible } from '../helpers/task-details';
import {
	openSettings,
	setting,
	settings,
	saveSetting,
	closeSettings
} from '../helpers/list-settings';
import { TestStepHelper } from '../helpers/test-step-helper';

test('small screen focus navigation and label deletion', async ({ page }, testInfo) => {
	test.setTimeout(120000);
	await resetEmulators(page.request);
	await signIn(page);
	await createList(page, 'Phone plans');
	await createTask(page, 'Original task stays');
	const sourceUrl = page.url();
	await page.setViewportSize({ width: 320, height: 568 });
	await openSettings(page);
	const helper = new TestStepHelper(
		page,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'Phone list settings',
		'Small viewport, enlarged text, keyboard focus, system Back and label deletion that preserves source tasks. Software keyboard appearance still needs device review.'
	);
	await setting(page, 'Sharing');
	await expect(page.getByRole('heading', { name: 'Sharing', exact: true })).toBeFocused();
	await page.getByLabel('Search people').fill('no one');
	await expect(page.getByText('No other people available yet', { exact: true })).toBeVisible();
	await page.getByRole('button', { name: '‹ Details', exact: true }).click();
	await expect(settings(page).getByRole('button', { name: /^Sharing / })).toBeFocused();
	await setting(page, 'Name');
	const longName = 'A long list name for weekend adventures with family and friends';
	await page.getByLabel('List name', { exact: true }).fill(longName);
	// Shorten the visible viewport to exercise the layout used with a keyboard.
	await page.setViewportSize({ width: 320, height: 350 });
	await settings(page).evaluate((element) => ((element as HTMLElement).style.fontSize = '34px'));
	await helper.step('large_text_short_viewport', {
		verifications: [
			{
				spec: 'Save stays reachable with 200% text in a short viewport and no horizontal overflow',
				check: async () => {
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
					expect(await settings(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
						true
					);
				}
			}
		]
	});
	await settings(page).evaluate((element) => ((element as HTMLElement).style.fontSize = '17px'));
	await page.setViewportSize({ width: 320, height: 568 });
	await page.evaluate(() => history.back());
	await expect(page.getByRole('heading', { name: 'Discard changes?', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
	await saveSetting(page);
	await setting(page, 'Labels');
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await page.getByLabel('New label', { exact: true }).fill('Phone label');
	await saveSetting(page);
	await closeSettings(page);
	await ensureListMenuVisible(page);
	const labelRow = page
		.locator('.mdc-drawer .listContainer > .mdc-deprecated-list > .item')
		.filter({ has: page.getByText('Phone label', { exact: true }) });
	const labelId = await labelRow.getAttribute('data-id');
	expect(labelId).toBeTruthy();
	await page.goto(`/labels?labelId=${labelId}`);
	await openSettings(page);
	await helper.step('label_settings', {
		verifications: [
			{
				spec: 'Label editor identifies its type and omits recursive membership controls',
				check: async () => {
					await expect(
						settings(page).getByRole('heading', { name: 'Label details', exact: true })
					).toBeVisible();
					await expect(settings(page).getByRole('button', { name: /^Labels / })).toHaveCount(0);
				}
			}
		]
	});
	await settings(page)
		.getByRole('button', { name: /Delete label… Confirmation required/ })
		.click();
	await expect(page.getByRole('button', { name: 'Keep label', exact: true })).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(page.getByRole('button', { name: '‹ Details', exact: true })).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(page.getByRole('button', { name: 'Delete label', exact: true })).toBeFocused();
	await page.getByRole('button', { name: 'Delete label', exact: true }).click();
	await expect(settings(page)).not.toBeVisible();
	await page.goto(sourceUrl);
	await page.reload();
	await helper.step('source_tasks_preserved', {
		verifications: [
			{
				spec: 'Deleting a label preserves its source list and task after reload',
				check: async () => {
					await expect(page.getByLabel('Task Original task stays', { exact: true })).toBeVisible();
					await expect(page.getByRole('banner').getByText(longName, { exact: true })).toBeVisible();
				}
			}
		]
	});
	await openSettings(page);
	await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 700, height: 360 });
	await helper.step('dark_landscape', {
		verifications: [
			{
				spec: 'Dark landscape retains Close and scrollable settings with no root Save',
				check: async () => {
					await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
					await expect(
						settings(page).getByRole('button', { name: 'Save', exact: true })
					).toHaveCount(0);
				}
			}
		]
	});
	await helper.generateDocs();
});
