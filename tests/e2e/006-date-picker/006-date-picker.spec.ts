import { expect, type ConsoleMessage, type Page, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only date picker baseline.');

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
			.poll(() => consoleMessages.some((text) => text.endsWith(` on ${listId}`)))
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
 * Baseline scenario for the EXISTING "Edit Task" date picker dialog.
 *
 * This test intentionally documents the current production behaviour (a checkbox
 * to enable a due date, a native date input, a repeat Select, and a numeric
 * "every" field) so that we have a reviewable baseline of screenshots before
 * redesigning the date picker. It should NOT be changed to assert on a new
 * design; a follow-up test will cover the improved dialog.
 */
test('current date picker dialog behaviour', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata(
		'Date Picker Dialog (Baseline)',
		'Documents the current "Edit Task" dialog used to set a due date and repeat schedule on a task. Captured before redesigning the date picker so the new design can be compared against this baseline.'
	);

	// A fixed future date so the rendered chip is deterministic and is not
	// collapsed to "Today" / "Tomorrow" / "Yesterday" by RepeatingDate.
	const DUE_DATE = '2026-12-25';
	const taskName = 'Buy a present';

	await signIn(page);
	await createList(page, 'Date Picker List');
	await createTask(page, taskName);

	await helper.step('task_added', {
		description: 'A task has been added to the list and is ready to be edited.',
		verifications: [
			{
				spec: 'Task is visible in the list',
				check: async () => expect.poll(async () => taskInputValues(page)).toContain(taskName)
			}
		]
	});

	// --- Open the Edit Task dialog ------------------------------------------
	await taskRows(page).first().locator('span.details').click();

	await helper.step('date_picker_opened', {
		description:
			'The "Edit Task" dialog is open. The due date is initially disabled: the checkbox is unchecked and the date field is greyed out.',
		verifications: [
			{
				spec: 'Dialog title "Edit Task" is visible',
				check: async () => expect(page.getByText('Edit Task', { exact: true })).toBeVisible()
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

	// --- Enable the due date -------------------------------------------------
	await openDialog(page).locator('input[type="checkbox"]').first().check();

	await helper.step('due_date_enabled', {
		description: 'Checking the box enables the due date controls.',
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

	// --- Pick a date ---------------------------------------------------------
	await openDialog(page).locator('input[type="date"]').fill(DUE_DATE);

	await helper.step('due_date_selected', {
		description: 'A specific due date has been entered via the native date input.',
		verifications: [
			{
				spec: 'Date field holds the selected date',
				check: async () => expect(openDialog(page).locator('input[type="date"]')).toHaveValue(DUE_DATE)
			}
		]
	});

	// --- Open the repeat dropdown -------------------------------------------
	await openDialog(page).locator('.mdc-select__anchor').click();
	await expect(page.getByRole('option', { name: 'Weekly', exact: true })).toBeVisible();

	await helper.step('repeat_options_open', {
		description:
			'The repeat selector (a Material `Select`) is open, showing the available repeat schedules: Doesn\'t repeat, Daily, Weekly, Monthly, Yearly, and Every Weekday.',
		verifications: [
			{
				spec: 'Weekly option is available',
				check: async () =>
					expect(page.getByRole('option', { name: 'Weekly', exact: true })).toBeVisible()
			}
		]
	});

	// --- Choose a repeat schedule -------------------------------------------
	await page.getByRole('option', { name: 'Weekly', exact: true }).click();
	await openDialog(page).locator('input[type="number"]').fill('2');

	await helper.step('repeat_configured', {
		description: 'A "Weekly" repeat is selected and configured to recur every 2 weeks.',
		verifications: [
			{
				spec: 'Repeat interval is set to 2',
				check: async () => expect(openDialog(page).locator('input[type="number"]')).toHaveValue('2')
			}
		]
	});

	// --- Save ----------------------------------------------------------------
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Edit Task', { exact: true })).toBeHidden();

	await helper.step('due_date_saved', {
		description:
			'After saving, the task shows its due date chip. The repeating task also gains the "complete forever" (highlight_off) control.',
		verifications: [
			{
				spec: 'A due date chip is shown on the task',
				check: async () => expect(page.locator('.repeatInfo span').first()).not.toHaveText('')
			}
		]
	});

	// --- Reopen to confirm persistence --------------------------------------
	await taskRows(page).first().locator('span.details').click();

	await helper.step('date_picker_reopened', {
		description:
			'Reopening the dialog shows the previously saved values: the due date is enabled, the date is preserved, and the repeat interval is retained.',
		verifications: [
			{
				spec: 'Due date checkbox is checked',
				check: async () =>
					expect(openDialog(page).locator('input[type="checkbox"]').first()).toBeChecked()
			},
			{
				spec: 'Saved due date is preserved',
				check: async () => expect(openDialog(page).locator('input[type="date"]')).toHaveValue(DUE_DATE)
			},
			{
				spec: 'Saved repeat interval is preserved',
				check: async () => expect(openDialog(page).locator('input[type="number"]')).toHaveValue('2')
			}
		]
	});

	await helper.generateDocs();
});
