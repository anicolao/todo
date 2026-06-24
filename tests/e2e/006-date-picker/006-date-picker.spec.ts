import { expect, type ConsoleMessage, type Page, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only date picker coverage.');

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
const dateField = (page: Page) => openDialog(page).locator('.date-anchor input');

/**
 * Scenario for the "Edit Task" date picker dialog.
 *
 * The due date is chosen with a Material-styled calendar (MaterialDatePicker)
 * that matches the rest of the app, replacing the browser-native date control.
 * This walks the flow of setting a due date and repeat schedule on a task.
 */
test('date picker dialog', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata(
		'Date Picker Dialog',
		'Documents the "Edit Task" dialog used to set a due date and repeat schedule on a task. The due date is chosen with a Material-styled calendar that matches the rest of the app.'
	);

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

	await helper.step('dialog_opened', {
		description:
			'The "Edit Task" dialog is open. The due date is initially disabled: the checkbox is unchecked and the Material date field is greyed out.',
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
				spec: 'Material date field is disabled',
				check: async () => expect(dateField(page)).toBeDisabled()
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
				spec: 'Material date field is now enabled',
				check: async () => expect(dateField(page)).toBeEnabled()
			}
		]
	});

	// --- Open the Material calendar -----------------------------------------
	await openDialog(page).getByRole('button', { name: 'calendar_today' }).click();
	await expect(page.locator('.calendar')).toBeVisible();

	await helper.step('calendar_opened', {
		description:
			'The Material-styled calendar popover opens, matching the app theme (month navigation, weekday headers, and a grid of selectable days).',
		verifications: [
			{
				spec: 'Calendar is visible',
				check: async () => expect(page.locator('.calendar')).toBeVisible()
			},
			{
				spec: 'Days are selectable',
				check: async () =>
					expect(page.getByRole('button', { name: '20', exact: true })).toBeVisible()
			}
		]
	});

	// --- Pick a date ---------------------------------------------------------
	await page.getByRole('button', { name: '20', exact: true }).click();
	await expect(page.locator('.calendar')).toBeHidden();
	const pickedDate = await dateField(page).inputValue();

	await helper.step('due_date_selected', {
		description:
			'Choosing a day closes the calendar and shows the formatted due date in the field.',
		verifications: [
			{
				spec: 'Date field shows the selected date',
				check: async () => expect(dateField(page)).not.toHaveValue('')
			}
		]
	});

	// Reopen the calendar on the same month and confirm the chosen day is
	// highlighted. This guards the bug where the selection only repainted after
	// navigating months (the highlight must update reactively with the value).
	await openDialog(page).getByRole('button', { name: 'calendar_today' }).click();
	await expect(page.locator('.calendar')).toBeVisible();

	await helper.step('selection_highlighted', {
		description:
			'Reopening the calendar shows the chosen day filled in the theme colour, updated reactively without needing to change months.',
		verifications: [
			{
				spec: 'Exactly one day is highlighted as selected',
				check: async () => expect(page.locator('.calendar-day.selected')).toHaveCount(1)
			},
			{
				spec: 'The highlighted day is the one that was chosen',
				check: async () => expect(page.locator('.calendar-day.selected')).toHaveText('20')
			}
		]
	});

	// Re-click the highlighted day to dismiss the calendar (Escape would close
	// the whole dialog), leaving the dialog open for the rest of the flow.
	await page.getByRole('button', { name: '20', exact: true }).click();
	await expect(page.locator('.calendar')).toBeHidden();

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
			'Reopening the dialog shows the saved values: the due date is enabled and preserved, and the repeat interval is retained.',
		verifications: [
			{
				spec: 'Due date checkbox is checked',
				check: async () =>
					expect(openDialog(page).locator('input[type="checkbox"]').first()).toBeChecked()
			},
			{
				spec: 'Saved due date is preserved',
				check: async () => expect(dateField(page)).toHaveValue(pickedDate)
			},
			{
				spec: 'Saved repeat interval is preserved',
				check: async () => expect(openDialog(page).locator('input[type="number"]')).toHaveValue('2')
			}
		]
	});

	await helper.generateDocs();
});
