import { expect, type ConsoleMessage, type Page } from '@playwright/test';
export async function signIn(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.locator('.drawer-container')).toBeVisible();
}

export async function ensureListMenuVisible(page: Page) {
	await expect(page.locator('.drawer-container')).toHaveClass(
		new RegExp(`w${page.viewportSize()?.width ?? 1280}\\b`)
	);
	const newList = page.getByLabel('New list');
	await expect(async () => {
		if ((page.viewportSize()?.width ?? 1280) <= 720 && !(await newList.isVisible())) {
			await page.getByRole('button', { name: 'Open navigation menu' }).click();
		}
		await expect(newList).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 10000 });
}

export async function closeModalDrawerIfOpen(page: Page, listName: string) {
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

export async function createList(page: Page, listName: string) {
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

export function taskRows(page: Page) {
	return page.locator('.app-content .listContainer .item:not(#ghost)');
}

export async function createTask(page: Page, taskName: string) {
	const newTask = page.getByLabel('New task');
	await newTask.fill(taskName);
	await newTask.blur();
	await expect.poll(async () => taskInputValues(page)).toContain(taskName);
	await expect(newTask).toHaveValue('');
}

export async function taskInputValues(page: Page) {
	return taskRows(page)
		.locator('input.description')
		.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
}

export const editor = (page: Page) => page.getByRole('dialog', { name: 'Task details' });
export async function openDetails(page: Page) {
	await page
		.getByRole('button', { name: /^Edit details for/ })
		.first()
		.click();
	await expect(editor(page)).toBeVisible();
}
export async function startTask(page: Page, listName = 'Details review') {
	await page.clock.setFixedTime(new Date('2026-09-16T12:00:00Z'));
	await signIn(page);
	await createList(page, listName);
	await createTask(page, 'Water the plants');
	await openDetails(page);
}
export async function chooseDate(page: Page, value = '2026-09-18') {
	await page.getByRole('button', { name: /^Due date/ }).click();
	await page.locator('input[aria-label="Due date"]').fill(value);
	await page.getByRole('button', { name: 'Done', exact: true }).click();
}
export async function chooseRepeat(page: Page, type = 'Weekly', every = '2') {
	await page.getByRole('button', { name: /^Repeat / }).click();
	await page.getByRole('radio', { name: new RegExp('^' + type) }).check();
	if (!['Does not repeat', 'Weekdays'].includes(type))
		await page.getByLabel('Every', { exact: true }).fill(every);
	await page.getByRole('button', { name: 'Done', exact: true }).click();
}
export async function saveDetails(page: Page) {
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.locator('dialog.task-details')).not.toBeVisible();
}
