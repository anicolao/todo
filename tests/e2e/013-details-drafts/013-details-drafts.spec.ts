import { expect, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';
import {
	startTask,
	chooseDate,
	chooseRepeat,
	openDetails,
	saveDetails
} from '../helpers/task-details';

test.use({ actionTimeout: 10000 });

test('drafts validation removal and accessible small-phone layout', async ({
	page,
	request
}, testInfo) => {
	test.setTimeout(120000);
	await resetEmulators(request);
	const helper = new TestStepHelper(
		page,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'Safe editing on a small phone',
		'Back and cancel preserve saved data, errors remain editable, removal is explicit, and controls remain usable with a short viewport and enlarged text.'
	);
	await startTask(page, 'Draft review');
	await page.getByRole('button', { name: /^Repeat / }).focus();
	await page.keyboard.press('Tab');
	await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
	await page.getByRole('button', { name: /^Repeat / }).click();
	await page.getByRole('textbox', { name: 'Due date' }).fill('2026-09-18');
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await page.getByRole('radio', { name: /^Weekly/ }).check();
	await page.getByRole('button', { name: '‹ Details', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Due date', exact: true })).toBeVisible();
	await page.getByRole('button', { name: '‹ Details', exact: true }).click();
	await expect(page.getByRole('button', { name: /^Due date/ })).toContainText('Add date');
	await chooseDate(page);
	await chooseRepeat(page);
	await saveDetails(page);
	await openDetails(page);
	await page.getByRole('button', { name: /^Repeat / }).click();
	for (const invalid of ['', '0', '-1', '1.5', '366', 'text']) {
		await page.getByLabel('Every', { exact: true }).fill(invalid);
		await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
		await expect(page.getByLabel('Every', { exact: true })).toHaveValue(invalid);
	}
	await page.getByLabel('Every', { exact: true }).fill('0');
	await helper.step('invalid_interval', {
		verifications: [
			{
				spec: 'Invalid input stays visible with an explicit error and no stale summary',
				check: async () => {
					await expect(page.getByRole('alert')).toContainText(
						'Enter a whole number from 1 to 365.'
					);
					await expect(page.getByText('Every 2 weeks on Friday', { exact: true })).toHaveCount(0);
				}
			}
		]
	});
	await page.getByLabel('Every', { exact: true }).fill('365');
	await expect(page.getByRole('button', { name: 'Increase interval' })).toBeDisabled();
	await page.getByLabel('Every', { exact: true }).fill('1');
	await expect(page.getByRole('button', { name: 'Decrease interval' })).toBeDisabled();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: /^Repeat / })).toContainText(
		'Every 2 weeks on Friday'
	);
	await page.getByRole('button', { name: /^Due date/ }).click();
	await page.getByRole('button', { name: 'Tomorrow', exact: false }).click();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('button', { name: /^Due date/ })).toContainText('Fri, Sep 18, 2026');
	await page.getByLabel('Task', { exact: true }).fill('');
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await page.getByLabel('Task', { exact: true }).fill('An unsaved task name');
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await helper.step('discard_confirmation', {
		verifications: [
			{
				spec: 'Cancel asks before discarding a changed draft',
				check: async () =>
					expect(page.getByRole('heading', { name: 'Discard changes?' })).toBeVisible()
			}
		]
	});
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
	await page.evaluate(() => history.back());
	await expect(page.getByRole('heading', { name: 'Discard changes?' })).toBeVisible();
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await openDetails(page);
	await expect(page.getByLabel('Task', { exact: true })).toHaveValue('Water the plants');
	await page.getByRole('button', { name: /^Due date/ }).click();
	await page.getByRole('button', { name: 'Remove due date', exact: true }).click();
	await helper.step('remove_confirmation', {
		verifications: [
			{
				spec: 'Removing a repeating date explicitly includes the repeat rule',
				check: async () =>
					expect(page.getByRole('heading', { name: 'Remove due date and repeat?' })).toBeVisible()
			}
		]
	});
	await page.getByRole('button', { name: 'Keep schedule', exact: true }).click();
	await page.getByRole('button', { name: 'Remove due date', exact: true }).click();
	await page.getByRole('button', { name: 'Remove both', exact: true }).click();
	await saveDetails(page);
	await openDetails(page);
	await expect(page.getByRole('button', { name: /^Due date/ })).toContainText('Add date');
	await expect(page.getByRole('button', { name: /^Repeat / })).toContainText('Does not repeat');
	await page.setViewportSize({ width: 320, height: 568 });
	await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
	await page
		.getByLabel('Task', { exact: true })
		.fill(
			'Water all of the plants in the kitchen and on the balcony before leaving for the weekend'
		);
	await page.addStyleTag({ content: 'dialog.task-details { font-size: 34px !important; }' });
	await helper.step('small_phone_large_text', {
		verifications: [
			{
				spec: 'Large text wraps without horizontal overflow and Save stays visible',
				check: async () => {
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
					await expect
						.poll(() =>
							page
								.getByLabel('Task', { exact: true })
								.evaluate((node) => node.scrollHeight <= node.clientHeight + 2)
						)
						.toBe(true);
					expect(
						await page.locator('.editor-body').evaluate((el) => el.scrollWidth <= el.clientWidth)
					).toBe(true);
				}
			}
		]
	});
	await page.addStyleTag({ content: 'dialog.task-details { font-size: 17px !important; }' });
	await chooseDate(page);
	await page.getByRole('button', { name: /^Repeat / }).click();
	await page.getByRole('radio', { name: /^Daily/ }).check();
	await page.setViewportSize({ width: 320, height: 360 });
	await page.getByLabel('Every', { exact: true }).fill('90');
	await helper.step('short_viewport', {
		description:
			'A reduced visual viewport exercises the layout used while a software keyboard is open; browser automation does not render an OS keyboard.',
		verifications: [
			{
				spec: 'Focused interval and Done are reachable in a short viewport',
				check: async () => {
					await page.getByLabel('Every', { exact: true }).scrollIntoViewIfNeeded();
					await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
					await expect(page.getByLabel('Every', { exact: true })).toBeInViewport();
				}
			}
		]
	});
	await page.getByRole('button', { name: 'Done', exact: true }).click();
	await saveDetails(page);
	await openDetails(page);
	await expect(page.getByRole('button', { name: /^Repeat / })).toContainText('Every 90 days');
	await helper.generateDocs();
});
