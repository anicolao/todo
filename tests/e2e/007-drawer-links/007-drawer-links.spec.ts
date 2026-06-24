import { expect, type ConsoleMessage, type Page, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only drawer link coverage.');

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
			.poll(() => consoleMessages.some((text) => text.endsWith(` on ${listId}`)), {
				timeout: 15000
			})
			.toBe(true);
		await expect(
			page.locator('.mdc-top-app-bar__title').filter({ hasText: listName })
		).toBeVisible();
	} finally {
		page.off('console', onConsole);
	}
}

const voidLinks = (page: Page) => page.locator('[href^="javascript:"]');

/**
 * Regression scenario for the drawer navigation links.
 *
 * SMUI's Drawer marks its list items as navigation items, so any `Item` given an
 * `href` renders as an `<a>`. The drawer items used `href="javascript:void(0)"`,
 * which surfaced as "javascript:void(0)" in the browser status bar / touch link
 * preview while scrolling. The items now omit `href` (rendering as <span>), so no
 * such link should ever appear, while the items stay clickable.
 */
test('drawer never renders javascript: links', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata(
		'Drawer Navigation Links',
		'Verify the drawer (filters, lists, and Profile) contains no "javascript:" href links while staying interactive.'
	);

	await signIn(page);
	await createList(page, 'Drawer Link List');

	await helper.step('drawer_rendered', {
		description:
			'The drawer shows filter shortcuts, the created list, and the Profile link — none of which are "javascript:" anchors.',
		verifications: [
			{
				spec: 'Drawer is visible',
				check: async () => expect(page.locator('.drawer-container')).toBeVisible()
			},
			{
				spec: 'Created list is shown in the drawer',
				check: async () =>
					expect(page.locator('.mdc-drawer').getByText('Drawer Link List')).toBeVisible()
			},
			{
				spec: 'Profile link is shown',
				check: async () => expect(page.locator('.mdc-drawer').getByText('Profile')).toBeVisible()
			},
			{
				spec: 'No "javascript:" links exist anywhere on the page',
				check: async () => expect(voidLinks(page)).toHaveCount(0)
			}
		]
	});

	// The filter items must remain clickable even though they are no longer anchors.
	await page.locator('.mdc-drawer').getByText('Starred', { exact: true }).click();

	await helper.step('filter_navigates', {
		description:
			'Clicking a drawer filter still navigates, confirming the items remain interactive.',
		verifications: [
			{
				spec: 'Starred view is active',
				check: async () => expect(page).toHaveURL(/\/starred/)
			},
			{
				spec: 'Still no "javascript:" links exist',
				check: async () => expect(voidLinks(page)).toHaveCount(0)
			}
		]
	});

	await helper.generateDocs();
});
