import { expect, type ConsoleMessage, type Page, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only date picker redesign.');

	await resetEmulators(request);
});

async function signIn(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.locator('.drawer-container')).toBeVisible();
}

async function ensureListMenuVisible(page: Page) {
	const newList = page.getByLabel('New list');
	if (!(await newList.isVisible())) {
		await page.locator('button.material-icons').filter({ hasText: 'menu' }).click();
	}
	await expect(newList).toBeVisible();
}

async function closeModalDrawerIfOpen(page: Page, listName: string) {
	const scrim = page.locator('.mdc-drawer-scrim').first();
	if (await scrim.isVisible()) {
		await page
			.locator('.mdc-drawer .listContainer .item:not(#ghost)')
			.filter({ hasText: listName })
			.last()
			.click();
		await expect(scrim).not.toBeVisible();
	}
}

async function createList(page: Page, listName: string) {
	await ensureListMenuVisible(page);
	// The list only becomes writable once its per-list action-log subscription is
	// attached (logged as "... on <listId>"); wait for that before adding tasks.
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
			.poll(() => consoleMessages.some((text) => text.endsWith(` on ${listId}`)), {
				timeout: 15000
			})
			.toBe(true);
		await expect(
			page.locator('.mdc-top-app-bar__title').filter({ hasText: listName })
		).toBeVisible();
		await expect(page.getByLabel('New task')).toBeVisible();
		await closeModalDrawerIfOpen(page, listName);
	} finally {
		page.off('console', onConsole);
	}
}

function taskRows(page: Page) {
	return page.locator('.app-content .listContainer .item:not(#ghost)');
}

async function createTask(page: Page, taskName: string) {
	const newTask = page.getByLabel('New task');
	await newTask.fill(taskName);
	await newTask.blur();
	await expect.poll(async () => taskInputValues(page)).toContain(taskName);
	await expect(newTask).toHaveValue('');
}

async function taskInputValues(page: Page) {
	return taskRows(page)
		.locator('input.description')
		.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

const openDialog = (page: Page) => page.locator('.mdc-dialog--open');

/**
 * Scenario for the REDESIGNED "Edit Task" date picker dialog.
 *
 * Companion to 006-date-picker (the "before" baseline). It exercises the same
 * flow against the polished dialog: a clearly labelled "Set a due date" toggle
 * that enables a grouped Due date / Repeat section, and a repeat interval field
 * that only appears once a repeating schedule is chosen.
 */
test('redesigned date picker dialog', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata(
		'Date Picker Dialog (Redesigned)',
		'Documents the redesigned "Edit Task" dialog used to set a due date and repeat schedule on a task. Compare against 006-date-picker, which captures the previous design.'
	);

	const DUE_DATE = '2026-12-25';
	const taskName = 'Buy a present';

	await signIn(page);
	await createList(page, 'Date Picker List');
	await createTask(page, taskName);

	await taskRows(page).first().locator('span.details').click();

	await helper.step('dialog_opened', {
		description:
			'The redesigned "Edit Task" dialog is open. The due date section is grouped under a clearly labelled "Set a due date" toggle, which starts off so the date controls are inactive.',
		verifications: [
			{
				spec: 'Dialog title "Edit Task" is visible',
				check: async () => expect(page.getByText('Edit Task', { exact: true })).toBeVisible()
			},
			{
				spec: '"Set a due date" toggle is visible',
				check: async () =>
					expect(page.getByRole('button', { name: 'Set a due date' })).toBeVisible()
			},
			{
				spec: 'Due date checkbox is unchecked',
				check: async () =>
					expect(openDialog(page).locator('input[type="checkbox"]').first()).not.toBeChecked()
			},
			{
				spec: 'Date field is disabled',
				check: async () => expect(openDialog(page).locator('input[type="date"]')).toBeDisabled()
			}
		]
	});

	// --- Enable the due date via the labelled toggle ------------------------
	await page.getByRole('button', { name: 'Set a due date' }).click();

	await helper.step('due_date_enabled', {
		description:
			'Activating the "Set a due date" toggle enables the grouped Due date and Repeat controls.',
		verifications: [
			{
				spec: 'Due date checkbox is checked',
				check: async () =>
					expect(openDialog(page).locator('input[type="checkbox"]').first()).toBeChecked()
			},
			{
				spec: 'Date field is now enabled',
				check: async () => expect(openDialog(page).locator('input[type="date"]')).toBeEnabled()
			}
		]
	});

	// --- Open the native date picker ----------------------------------------
	const dateInput = openDialog(page).locator('input[type="date"]');
	const dateBox = await dateInput.boundingBox();
	await dateInput.click({
		position: { x: (dateBox?.width ?? 160) - 8, y: (dateBox?.height ?? 24) / 2 }
	});

	await helper.step('calendar_opened', {
		description: 'Clicking the calendar icon opens the browser-native date picker GUI.',
		verifications: []
	});

	await dateInput.fill(DUE_DATE);

	await helper.step('due_date_selected', {
		description: 'A specific due date has been chosen.',
		verifications: [
			{
				spec: 'Date field holds the selected date',
				check: async () => expect(dateInput).toHaveValue(DUE_DATE)
			}
		]
	});

	// --- Configure a repeat schedule ----------------------------------------
	await openDialog(page).locator('.mdc-select__anchor').click();
	await expect(page.getByRole('option', { name: 'Weekly', exact: true })).toBeVisible();

	await helper.step('repeat_options_open', {
		description:
			"The repeat selector is open, showing the available schedules: Doesn't repeat, Daily, Weekly, Monthly, Yearly, and Every Weekday.",
		verifications: [
			{
				spec: 'Weekly option is available',
				check: async () =>
					expect(page.getByRole('option', { name: 'Weekly', exact: true })).toBeVisible()
			}
		]
	});

	await page.getByRole('option', { name: 'Weekly', exact: true }).click();

	await helper.step('repeat_interval_revealed', {
		description:
			'Choosing a repeating schedule reveals the interval field, which is hidden while the task does not repeat.',
		verifications: [
			{
				spec: 'Repeat interval field is now shown',
				check: async () => expect(openDialog(page).locator('input[type="number"]')).toBeVisible()
			}
		]
	});

	await openDialog(page).locator('input[type="number"]').fill('2');

	await helper.step('repeat_configured', {
		description: 'The repeat is configured to recur every 2 weeks.',
		verifications: [
			{
				spec: 'Repeat interval is set to 2',
				check: async () => expect(openDialog(page).locator('input[type="number"]')).toHaveValue('2')
			}
		]
	});

	// --- Save and reopen to confirm persistence -----------------------------
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Edit Task', { exact: true })).toBeHidden();

	await helper.step('saved', {
		description: 'After saving, the task shows its due date chip.',
		verifications: [
			{
				spec: 'A due date chip is shown on the task',
				check: async () => expect(page.locator('.repeatInfo span').first()).not.toHaveText('')
			}
		]
	});

	await taskRows(page).first().locator('span.details').click();

	await helper.step('reopened', {
		description:
			'Reopening the dialog shows the saved values: the due date is enabled, the date is preserved, the repeat schedule is Weekly, and the interval field is shown with its saved value.',
		verifications: [
			{
				spec: 'Due date checkbox is checked',
				check: async () =>
					expect(openDialog(page).locator('input[type="checkbox"]').first()).toBeChecked()
			},
			{
				spec: 'Saved due date is preserved',
				check: async () =>
					expect(openDialog(page).locator('input[type="date"]')).toHaveValue(DUE_DATE)
			},
			{
				spec: 'Saved repeat interval is preserved',
				check: async () => expect(openDialog(page).locator('input[type="number"]')).toHaveValue('2')
			}
		]
	});

	await helper.generateDocs();
});
