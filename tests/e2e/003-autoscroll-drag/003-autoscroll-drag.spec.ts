import { expect, type Locator, type Page, test } from '@playwright/test';

const projectId = 'todo-firebase-1a740';

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only drag regression coverage.');

	await request.delete(
		`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`
	);
	await request.delete(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`);
});

async function signIn(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
}

async function createList(page: Page, listName: string) {
	await page.getByLabel('New list').fill(listName);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/lists\?listId=/, { timeout: 10000 });
	await expect(page.locator('.mdc-top-app-bar__title').filter({ hasText: listName })).toBeVisible();
}

async function createTodoItems(page: Page, itemNames: string[]) {
	const newTask = page.getByLabel('New task');
	await expect(newTask).toBeVisible();
	await page.waitForTimeout(800);
	for (const [index, itemName] of [...itemNames].reverse().entries()) {
		await newTask.fill(itemName);
		await page.keyboard.press('Enter');
		await expect(todoInputs(page)).toHaveCount(index + 1, { timeout: 10000 });
	}
}

function todoRows(page: Page) {
	return page.locator('.app-content .listContainer .item:not(#ghost)');
}

function todoInputs(page: Page) {
	return page.locator('.app-content .listContainer .item:not(#ghost) input.description');
}

function listMenuRow(page: Page, listName: string) {
	return page.locator('.mdc-drawer .listContainer .item:not(#ghost)').filter({ hasText: listName });
}

async function dragVisibleRowTowardTopOfViewport(
	page: Page,
	row: Locator,
	scrollContainer: Locator,
	topInset = 8
) {
	await row.scrollIntoViewIfNeeded();
	const box = await row.boundingBox();
	const scrollContainerBox = await scrollContainer.boundingBox();
	if (!box) {
		throw new Error('Cannot drag a row without a bounding box.');
	}
	if (!scrollContainerBox) {
		throw new Error('Cannot drag toward a scroll container without a bounding box.');
	}

	const startX = box.x + Math.min(32, box.width / 2);
	const startY = box.y + box.height / 2;
	const topDragY = scrollContainerBox.y + topInset;

	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.waitForTimeout(150);
	await page.mouse.move(startX, topDragY, { steps: 20 });
	await page.waitForTimeout(1600);
	await page.mouse.move(startX, topDragY, { steps: 5 });
	await page.mouse.up();
	await page.waitForTimeout(500);
}

async function visibleTodoOrder(page: Page) {
	return todoInputs(page).evaluateAll((inputs) =>
		inputs.map((input) => (input as HTMLInputElement).value)
	);
}

async function visibleListMenuOrder(page: Page) {
	return page
		.locator('.mdc-drawer .listContainer .item:not(#ghost)')
		.evaluateAll((items) =>
			items.map((item) => {
				const clone = item.cloneNode(true) as HTMLElement;
				clone.querySelectorAll('button').forEach((button) => button.remove());
				return clone.textContent?.trim() || '';
			})
		);
}

test('dragging a todo item to an off-screen list position autoscrolls the todo list', async ({
	page
}) => {
	await signIn(page);

	const listName = `Autoscroll todos ${Date.now()}`;
	await createList(page, listName);

	const itemNames = Array.from({ length: 30 }, (_, index) => {
		return `Autoscroll todo ${String(index + 1).padStart(2, '0')}`;
	});
	await createTodoItems(page, itemNames);

	await page.locator('.backdrop').evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	const scrollTopBeforeDrag = await page
		.locator('.backdrop')
		.evaluate((element) => element.scrollTop);
	await expect(todoRows(page).first()).not.toBeInViewport();
	await expect(todoRows(page).last()).toBeInViewport();

	await dragVisibleRowTowardTopOfViewport(
		page,
		todoRows(page).last(),
		page.locator('.backdrop'),
		64
	);

	await expect
		.poll(async () => page.locator('.backdrop').evaluate((element) => element.scrollTop))
		.toBeLessThan(scrollTopBeforeDrag);
	await expect(todoRows(page).first()).toBeInViewport();
});

test('dragging a list to an off-screen list-menu position autoscrolls the list of lists', async ({
	page
}) => {
	await signIn(page);

	const listNames = Array.from({ length: 24 }, (_, index) => {
		return `Autoscroll list ${String(index + 1).padStart(2, '0')} ${Date.now()}`;
	});

	for (const listName of listNames) {
		await createList(page, listName);
	}

	const drawerContent = page.locator('.mdc-drawer > .mdc-drawer__content');
	await drawerContent.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await expect(listMenuRow(page, listNames[0])).not.toBeInViewport();
	await expect(listMenuRow(page, listNames.at(-1) || '')).toBeInViewport();

	await dragVisibleRowTowardTopOfViewport(
		page,
		listMenuRow(page, listNames.at(-1) || ''),
		drawerContent
	);

	await expect.poll(async () => (await visibleListMenuOrder(page))[0]).toBe(listNames.at(-1));
});
