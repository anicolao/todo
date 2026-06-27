import { expect, type Locator, type Page, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only tap-vs-drag coverage.');

	await resetEmulators(request);
});

async function signIn(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.getByLabel('New list')).toBeVisible({ timeout: 15000 });
}

async function createList(page: Page, listName: string): Promise<string> {
	const newList = page.getByLabel('New list');
	await expect(newList).toBeVisible({ timeout: 15000 });
	await newList.fill(listName);
	await newList.press('Enter');
	await expect(page).toHaveURL(/lists\/?\?listId=/, { timeout: 10000 });
	await expect(page.locator('.mdc-top-app-bar__title').filter({ hasText: listName })).toBeVisible();
	return new URL(page.url()).searchParams.get('listId') ?? '';
}

function drawerRow(page: Page, listName: string): Locator {
	return page.locator('.mdc-drawer .listContainer .item:not(#ghost)').filter({ hasText: listName });
}

// Emulate a deliberate human press of a given duration at the centre of a
// target, releasing without moving. The hold is input timing, not a wait on
// app state.
async function pressHoldRelease(page: Page, target: Locator, holdMs: number) {
	const box = await target.boundingBox();
	if (!box) {
		throw new Error('Cannot press a target without a bounding box.');
	}
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.waitForTimeout(holdMs);
	await page.mouse.up();
}

/**
 * Regression scenario for taps on the list of lists being mistaken for drags.
 *
 * The drag handlers used to pick a list up on a bare ~100ms press timer and
 * capture the pointer, so a tap that lingered past the timer was hijacked into
 * a drag and never navigated. A drag now requires actual pointer movement, so a
 * press-and-hold-then-release in place must navigate like any other tap.
 */
test('pressing and holding a list navigates instead of dragging', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata(
		'List Tap Is Not A Drag',
		'A press-and-hold on a list in the drawer, released without moving, navigates to that list rather than picking it up for a drag.'
	);

	await signIn(page);
	const listA = await createList(page, 'Tap List A');
	const listB = await createList(page, 'Tap List B');

	// Creating B navigated to it; confirm the starting point.
	await expect(page).toHaveURL(new RegExp(`listId=${listB}`));

	// Press and hold List A for well over the old ~100ms drag timer, then release
	// without moving. With the old behaviour this picked the row up and the tap
	// was swallowed; now it must navigate.
	await pressHoldRelease(page, drawerRow(page, 'Tap List A'), 300);

	await helper.step('held_tap_navigates', {
		description:
			'Pressing and holding List A, then releasing in place, navigates to List A — it is treated as a tap, not a drag.',
		verifications: [
			{
				spec: 'Navigated to the held list',
				check: async () => expect(page).toHaveURL(new RegExp(`listId=${listA}`))
			},
			{
				spec: 'No list is left stuck in a dragged state',
				check: async () => expect(page.locator('#grabbed')).toHaveCount(0)
			}
		]
	});

	// A quick tap on the other list must still navigate too.
	await drawerRow(page, 'Tap List B').click();

	await helper.step('quick_tap_navigates', {
		description: 'A quick tap on List B navigates to it, confirming normal taps still work.',
		verifications: [
			{
				spec: 'Navigated to the tapped list',
				check: async () => expect(page).toHaveURL(new RegExp(`listId=${listB}`))
			}
		]
	});

	await helper.generateDocs();
});
