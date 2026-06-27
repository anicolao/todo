import { expect, type Locator, type Page, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only drag regression coverage.');

	await resetEmulators(request);
});

async function signIn(page: Page) {
	await page.goto('/');
	await page.addStyleTag({
		content: '.firebase-emulator-warning { display: none !important; }'
	});
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.getByLabel('New list')).toBeVisible({ timeout: 15000 });
}

async function createList(page: Page, listName: string) {
	const newList = page.getByLabel('New list');
	await newList.fill(listName);
	await newList.press('Enter');
	await expect(page).toHaveURL(/lists\?listId=/, { timeout: 10000 });
	await expect(page.locator('.mdc-top-app-bar__title').filter({ hasText: listName })).toBeVisible();
}

async function createTodoItems(page: Page, itemNames: string[]) {
	const newTask = page.getByLabel('New task');
	await expect(newTask).toBeVisible();
	await page.waitForTimeout(1500);
	for (const itemName of [...itemNames].reverse()) {
		await newTask.fill(itemName);
		await newTask.press('Enter');
		await expect.poll(async () => visibleTodoOrder(page), { timeout: 15000 }).toContain(itemName);
		await expect(newTask).toHaveValue('');
	}
	await expect(todoInputs(page)).toHaveCount(itemNames.length, { timeout: 15000 });
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

	const startX = box.x + box.width / 2;
	const startY = box.y + box.height / 2;
	const topDragY = scrollContainerBox.y + topInset;

	await page.mouse.move(startX, startY);
	await page.mouse.down();
	// A drag now starts on movement (not on a bare press), so nudge past the
	// drag threshold to pick the row up before dragging it toward the top.
	await page.mouse.move(startX, startY + 12, { steps: 2 });
	await expect(row).toHaveAttribute('id', 'grabbed', { timeout: 1500 });
	await page.mouse.move(startX, topDragY, { steps: 20 });
	await page.waitForTimeout(2000);
	await page.mouse.move(startX, topDragY, { steps: 5 });
	await page.mouse.up();
	await page.waitForTimeout(1000);
}

async function visibleTodoOrder(page: Page) {
	return todoInputs(page).evaluateAll((inputs) =>
		inputs.map((input) => (input as HTMLInputElement).value)
	);
}

async function visibleListMenuOrder(page: Page) {
	return page.locator('.mdc-drawer .listContainer .item:not(#ghost)').evaluateAll((items) =>
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

test('clicking a list in the sidebar navigates to that list', async ({ page }) => {
	await signIn(page);

	const listName1 = `List One ${Date.now()}`;
	const listName2 = `List Two ${Date.now()}`;

	await createList(page, listName1);
	await createList(page, listName2);

	// Click on List One in the sidebar
	const listOneRow = listMenuRow(page, listName1);
	await listOneRow.click();

	// Verify we are now on List One
	await expect(page).toHaveURL(new RegExp(`lists\\?listId=`));
	await expect(
		page.locator('.mdc-top-app-bar__title').filter({ hasText: listName1 })
	).toBeVisible();
});

test('a task still picks up for a drag after another task was edited', async ({ page }) => {
	await signIn(page);

	const listName = `Edit then drag ${Date.now()}`;
	await createList(page, listName);
	await createTodoItems(page, ['Edit-drag A', 'Edit-drag B', 'Edit-drag C']);

	// Edit the first task: focusing its input makes the app disable dragging
	// while editing (after ~900ms) so text can be selected without reordering.
	await todoInputs(page).first().click();
	await page.waitForTimeout(1100);

	// Now drag the second task. Before the fix, the press right after editing
	// bailed out of pointerdown (dragEnabled was momentarily false) and never
	// armed a drag, so no row could be dragged after touching any task. It must
	// now pick the row up.
	const row = todoRows(page).nth(1);
	const box = await row.boundingBox();
	if (!box) {
		throw new Error('Cannot drag a row without a bounding box.');
	}
	const centerX = box.x + box.width / 2;
	const centerY = box.y + box.height / 2;
	await page.mouse.move(centerX, centerY);
	await page.mouse.down();
	await page.mouse.move(centerX, centerY + 12, { steps: 2 });
	await expect(row).toHaveAttribute('id', 'grabbed', { timeout: 1500 });
	await page.mouse.up();
});
