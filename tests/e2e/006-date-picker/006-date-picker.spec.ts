import { test, expect } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

// Emulator ports default to the standard Firebase ports used in CI, but can be
// overridden locally (e.g. when those ports are already taken) via env vars.
const FIRESTORE_PORT = process.env.E2E_FIRESTORE_PORT || '8080';
const AUTH_PORT = process.env.E2E_AUTH_PORT || '9099';

test.beforeEach(async ({ request }) => {
	// Ensure that the E2E tests start with a clean state in the emulator.
	const projectId = 'todo-firebase-1a740';
	await request.delete(
		`http://127.0.0.1:${FIRESTORE_PORT}/emulator/v1/projects/${projectId}/databases/(default)/documents`
	);
	await request.delete(
		`http://127.0.0.1:${AUTH_PORT}/emulator/v1/projects/${projectId}/accounts`
	);
});

/**
 * Baseline scenario for the EXISTING "Edit Task" date picker dialog.
 *
 * This test intentionally documents the current production behaviour (a checkbox
 * to enable a due date, a native `<input type="date">`, a repeat <Select>, and a
 * numeric "every" field) so that we have a reviewable baseline of screenshots
 * before redesigning the date picker. It should NOT be changed to assert on a
 * new design; a follow-up test will cover the improved dialog.
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

	// --- Sign in -------------------------------------------------------------
	await page.goto('/');
	const signInButton = page.getByRole('button', { name: 'Sign In', exact: true });
	await expect(signInButton).toBeVisible();
	// On a freshly reset emulator the first sign-in can race with Firebase auth
	// initialisation, so retry the click until the redirect to /profile lands.
	await expect(async () => {
		if (await signInButton.isVisible().catch(() => false)) {
			await signInButton.click();
		}
		await expect(page).toHaveURL(/\/profile/, { timeout: 5000 });
	}).toPass({ timeout: 45000 });

	// Wait for the initial load (which shows a loading screen) to finish before
	// interacting with the app shell.
	await page
		.locator('.loading-screen')
		.waitFor({ state: 'detached', timeout: 30000 })
		.catch(() => {});

	// --- Create a list -------------------------------------------------------
	await helper.step('list_setup', {
		description: 'Reveal the "New list" field (opening the drawer on mobile layouts).',
		verifications: [
			{
				spec: 'New list input is visible',
				check: async () => {
					const newListInput = page.getByLabel('New list');
					if (!(await newListInput.isVisible())) {
						const menuButton = page.locator('button.material-icons:has-text("menu")');
						if (await menuButton.isVisible()) {
							await menuButton.click();
						}
					}
					await expect(newListInput).toBeVisible({ timeout: 30000 });
				}
			}
		]
	});

	const listName = 'Date Picker List';
	await page.getByLabel('New list').fill(listName);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/lists\?listId=/);

	// --- Add a task ----------------------------------------------------------
	// Wait for the newly created list's content (and its action-log
	// subscription) to settle before adding an item, otherwise the item can be
	// dispatched before the list is ready to render it.
	const taskName = 'Buy a present';
	const newTask = page.getByLabel('New task');
	const descriptionInput = page.locator('input.description');
	await expect(newTask).toBeVisible();
	// A freshly created list only becomes writable once its "editors" document
	// has been provisioned in Firestore; until then the create_item write is
	// rejected and silently dropped. Retry adding the task (only when none is
	// present, to avoid duplicates) until it actually renders.
	await expect(async () => {
		if ((await descriptionInput.count()) === 0) {
			await newTask.click();
			await newTask.fill(taskName);
			await newTask.press('Enter');
		}
		await expect(descriptionInput.first()).toHaveValue(taskName, { timeout: 3000 });
	}).toPass({ timeout: 30000 });

	await helper.step('task_added', {
		description: 'A task has been added to the list and is ready to be edited.',
		verifications: [
			{
				spec: 'Task description input is present',
				check: async () => expect(descriptionInput.first()).toHaveValue(taskName)
			}
		]
	});

	// --- Open the Edit Task dialog ------------------------------------------
	await page.locator('span.details').first().click();

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
					expect(page.locator('.mdc-dialog--open input[type="checkbox"]').first()).not.toBeChecked()
			},
			{
				spec: 'Date field is disabled',
				check: async () =>
					expect(page.locator('.mdc-dialog--open input[type="date"]')).toBeDisabled()
			}
		]
	});

	// --- Enable the due date -------------------------------------------------
	await page.locator('.mdc-dialog--open input[type="checkbox"]').first().check();

	await helper.step('due_date_enabled', {
		description: 'Checking the box enables the due date controls.',
		verifications: [
			{
				spec: 'Due date checkbox is checked',
				check: async () =>
					expect(page.locator('.mdc-dialog--open input[type="checkbox"]').first()).toBeChecked()
			},
			{
				spec: 'Date field is now enabled',
				check: async () =>
					expect(page.locator('.mdc-dialog--open input[type="date"]')).toBeEnabled()
			}
		]
	});

	// --- Pick a date ---------------------------------------------------------
	await page.locator('.mdc-dialog--open input[type="date"]').fill(DUE_DATE);

	await helper.step('due_date_selected', {
		description: 'A specific due date has been entered via the native date input.',
		verifications: [
			{
				spec: 'Date field holds the selected date',
				check: async () =>
					expect(page.locator('.mdc-dialog--open input[type="date"]')).toHaveValue(DUE_DATE)
			}
		]
	});

	// --- Open the repeat dropdown -------------------------------------------
	await page.locator('.mdc-dialog--open .mdc-select__anchor').click();
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
	await page.locator('.mdc-dialog--open input[type="number"]').fill('2');

	await helper.step('repeat_configured', {
		description: 'A "Weekly" repeat is selected and configured to recur every 2 weeks.',
		verifications: [
			{
				spec: 'Repeat interval is set to 2',
				check: async () =>
					expect(page.locator('.mdc-dialog--open input[type="number"]')).toHaveValue('2')
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
	await page.locator('span.details').first().click();

	await helper.step('date_picker_reopened', {
		description:
			'Reopening the dialog shows the previously saved values: the due date is enabled, the date is preserved, and the repeat interval is retained.',
		verifications: [
			{
				spec: 'Due date checkbox is checked',
				check: async () =>
					expect(page.locator('.mdc-dialog--open input[type="checkbox"]').first()).toBeChecked()
			},
			{
				spec: 'Saved due date is preserved',
				check: async () =>
					expect(page.locator('.mdc-dialog--open input[type="date"]')).toHaveValue(DUE_DATE)
			},
			{
				spec: 'Saved repeat interval is preserved',
				check: async () =>
					expect(page.locator('.mdc-dialog--open input[type="number"]')).toHaveValue('2')
			}
		]
	});

	await helper.generateDocs();
});
