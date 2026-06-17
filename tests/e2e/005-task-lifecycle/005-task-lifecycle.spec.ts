import { expect, type ConsoleMessage, type Page, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only task lifecycle coverage.');

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

async function createTask(page: Page, taskName: string) {
	const newTask = page.getByLabel('New task');
	await newTask.fill(taskName);
	await newTask.blur();
	await expectTasksVisible(page, [taskName]);
	await expect(newTask).toHaveValue('');
}

function taskRows(page: Page) {
	return page.locator('.app-content .listContainer .item:not(#ghost)');
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

async function expectTasksHidden(page: Page, taskNames: string[]) {
	for (const taskName of taskNames) {
		await expect.poll(async () => visibleTaskValues(page)).not.toContain(taskName);
	}
}

async function starFirstTask(page: Page) {
	const row = taskRows(page).first();
	await row.locator('.star.material-icons').filter({ hasText: 'star_outline' }).click();
	await expect(row.locator('.star.material-icons').filter({ hasText: 'star' })).toBeVisible();
}

async function completeSecondTask(page: Page, taskName: string) {
	await taskRows(page)
		.nth(1)
		.locator('.check.material-icons')
		.filter({ hasText: 'check_box_outline_blank' })
		.click();
	await expectTasksHidden(page, [taskName]);
}

test('task lifecycle across list, starred, and completed views', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata(
		'Task Lifecycle Across Views',
		'Verify that created, starred, completed, and revealed tasks appear in the expected task views.'
	);

	const listName = 'Lifecycle List';
	const starredTask = 'Lifecycle starred task';
	const completedTask = 'Lifecycle completed task';
	const regularTask = 'Lifecycle regular task';

	await signIn(page);

	await helper.step('signed_in', {
		description: 'User signs in and the application shell is visible.',
		verifications: [
			{
				spec: 'Application shell is visible',
				check: async () => expect(page.locator('.drawer-container')).toBeVisible()
			}
		]
	});

	await createList(page, listName);

	await helper.step('list_created', {
		description: 'User creates a dedicated list for the lifecycle scenario.',
		verifications: [
			{
				spec: 'List route is active',
				check: async () => expect(page).toHaveURL(/lists\/?\?listId=/)
			},
			{
				spec: 'List title is visible',
				check: async () =>
					expect(
						page.locator('.mdc-top-app-bar__title').filter({ hasText: listName })
					).toBeVisible()
			},
			{
				spec: 'New task input is visible',
				check: async () => expect(page.getByLabel('New task')).toBeVisible()
			}
		]
	});

	await createTask(page, regularTask);
	await createTask(page, completedTask);
	await createTask(page, starredTask);

	await helper.step('tasks_created', {
		description: 'User adds regular, completed, and starred candidate tasks to the list.',
		verifications: [
			{
				spec: 'Regular task is visible',
				check: async () => expectTasksVisible(page, [regularTask])
			},
			{
				spec: 'Completed candidate task is visible',
				check: async () => expectTasksVisible(page, [completedTask])
			},
			{
				spec: 'Starred candidate task is visible',
				check: async () => expectTasksVisible(page, [starredTask])
			}
		]
	});

	await starFirstTask(page);
	await completeSecondTask(page, completedTask);

	await helper.step('task_states_changed', {
		description: 'User stars one task and completes another task.',
		verifications: [
			{
				spec: 'Starred task remains visible on the list',
				check: async () => expectTasksVisible(page, [starredTask])
			},
			{
				spec: 'Completed task is hidden from the active list',
				check: async () => expectTasksHidden(page, [completedTask])
			},
			{
				spec: 'Regular task remains visible on the list',
				check: async () => expectTasksVisible(page, [regularTask])
			},
			{
				spec: 'Completed-items toggle is available',
				check: async () =>
					expect(page.getByRole('button', { name: 'Show Completed Items' })).toBeVisible()
			}
		]
	});

	await page.getByRole('button', { name: 'Show Completed Items' }).click();

	await helper.step('completed_revealed_in_list', {
		description: 'User reveals completed items inside the source list.',
		verifications: [
			{
				spec: 'Completed task is visible in the source list',
				check: async () => expectTasksVisible(page, [completedTask])
			},
			{
				spec: 'Completed-items toggle changes to hide',
				check: async () =>
					expect(page.getByRole('button', { name: 'Hide Completed Items' })).toBeVisible()
			}
		]
	});

	await page.goto('/starred');

	await helper.step('starred_view', {
		description: 'User opens the Starred view.',
		verifications: [
			{
				spec: 'Starred title is visible',
				check: async () =>
					expect(
						page.locator('.mdc-top-app-bar__title').filter({ hasText: 'Starred' })
					).toBeVisible()
			},
			{
				spec: 'Starred task is visible',
				check: async () => expectTasksVisible(page, [starredTask])
			},
			{
				spec: 'Completed task is not visible',
				check: async () => expectTasksHidden(page, [completedTask])
			},
			{
				spec: 'Regular task is not visible',
				check: async () => expectTasksHidden(page, [regularTask])
			}
		]
	});

	await page.goto('/completed');

	await helper.step('completed_view', {
		description: 'User opens the Completed view.',
		verifications: [
			{
				spec: 'Completed title is visible',
				check: async () =>
					expect(
						page.locator('.mdc-top-app-bar__title').filter({ hasText: 'Completed' })
					).toBeVisible()
			},
			{
				spec: 'Completed task is visible',
				check: async () => expectTasksVisible(page, [completedTask])
			},
			{
				spec: 'Source list name is shown for the completed task',
				check: async () =>
					expect(taskRows(page).first().filter({ hasText: listName })).toBeVisible()
			},
			{
				spec: 'Starred task is not visible',
				check: async () => expectTasksHidden(page, [starredTask])
			}
		]
	});

	await page.goto('/all');

	await helper.step('all_view', {
		description:
			'User opens All and verifies active tasks remain visible while the completed task is hidden.',
		verifications: [
			{
				spec: 'All title is visible',
				check: async () =>
					expect(page.locator('.mdc-top-app-bar__title').filter({ hasText: 'All' })).toBeVisible()
			},
			{
				spec: 'Starred task is visible as active',
				check: async () => expectTasksVisible(page, [starredTask])
			},
			{
				spec: 'Regular task is visible as active',
				check: async () => expectTasksVisible(page, [regularTask])
			},
			{
				spec: 'Completed task is hidden from active All view',
				check: async () => expectTasksHidden(page, [completedTask])
			}
		]
	});

	await helper.generateDocs();
});
