import { setting, saveSetting, closeSettings, settings } from '../helpers/list-settings';
import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }) => {
	await resetEmulators(request);
});

async function openDrawer(page: Page) {
	const drawer = page.locator('.mdc-drawer');
	const isModal = await drawer.evaluate((element) =>
		element.classList.contains('mdc-drawer--modal')
	);
	if (
		isModal &&
		!(await drawer.evaluate((element) => element.classList.contains('mdc-drawer--open')))
	) {
		await page.getByRole('button', { name: 'Open navigation menu' }).dispatchEvent('click');
		await expect(drawer).toHaveClass(/mdc-drawer--open/, { timeout: 10000 });
		await expect
			.poll(async () => {
				const box = await drawer.boundingBox();
				return box ? Math.round(box.x) : -999;
			})
			.toBeGreaterThanOrEqual(0);
	}
}

async function closeDrawer(page: Page) {
	const drawer = page.locator('.mdc-drawer');
	if (
		(await drawer.evaluate((element) => element.classList.contains('mdc-drawer--modal'))) &&
		(await drawer.evaluate((element) => element.classList.contains('mdc-drawer--open')))
	) {
		await page.getByRole('button', { name: 'Open navigation menu' }).dispatchEvent('click');
		await expect(drawer).not.toHaveClass(/mdc-drawer--open/, { timeout: 10000 });
	}
}

function topLevelSidebarItem(page: Page, name: string) {
	return page
		.locator('.mdc-drawer .listContainer > .mdc-deprecated-list > .item')
		.filter({ has: page.locator('.list-menu-item').getByText(name, { exact: true }) });
}

async function openSelectedDocumentEditor(page: Page, name: string) {
	await openDrawer(page);
	const edit = topLevelSidebarItem(page, name).getByRole('button', { name: 'Edit list' });
	await expect(edit).toBeVisible({ timeout: 10000 });
	await edit.dispatchEvent('pointerdown');
	await expect(settings(page)).toBeVisible({ timeout: 10000 });
}

async function openVisibilityDialog(page: Page) {
	if (new URL(page.url()).pathname !== '/profile') {
		await navigateFromDrawer(page, 'Profile', /\/profile$/);
	}
	await page.getByRole('button', { name: /Label visibility/ }).click();
	await expect(page.getByRole('heading', { name: 'Label visibility', exact: true })).toBeVisible();
}

async function openLabelVisibility(page: Page, name: string) {
	await page
		.getByRole('button', { name: new RegExp(`^${name} (Visible|Hidden|Fully hidden)`) })
		.click();
	await expect(page.getByRole('heading', { name: 'Visibility', exact: true })).toBeVisible();
}

async function saveLabelVisibility(page: Page, value: 'Visible' | 'Hidden' | 'Fully hidden') {
	await page.getByRole('radio', { name: new RegExp(`^${value}`) }).check();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Label visibility', exact: true })).toBeVisible();
}

async function navigateFromDrawer(
	page: Page,
	name: string,
	expectedUrl: RegExp,
	keepDrawerOpen = false
) {
	await openDrawer(page);
	const drawer = page.locator('.mdc-drawer');
	const waitForDrawerClose =
		!keepDrawerOpen &&
		(await drawer.evaluate((element) => {
			if (!element.classList.contains('mdc-drawer--modal')) return false;
			const state = window as typeof window & { drawerCloseCompleted?: boolean };
			state.drawerCloseCompleted = false;
			element.addEventListener(
				'SMUIDrawer:closed',
				() => {
					state.drawerCloseCompleted = true;
				},
				{ once: true }
			);
			return true;
		}));
	await page
		.locator('.mdc-drawer .mdc-deprecated-list-item')
		.filter({ has: page.getByText(name, { exact: true }) })
		.first()
		.click();
	if (waitForDrawerClose) {
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						(window as typeof window & { drawerCloseCompleted?: boolean }).drawerCloseCompleted ||
						false
				)
			)
			.toBe(true);
	}
	if (
		keepDrawerOpen &&
		(await drawer.evaluate((element) => element.classList.contains('mdc-drawer--modal')))
	) {
		await expect(drawer).toHaveClass(/mdc-drawer--open/);
	}
	await expect(page).toHaveURL(expectedUrl, { timeout: 10000 });
}

test('label visibility survives rename and controls aggregate results', async ({
	page
}, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata(
		'Hidden label visibility',
		'Verify that hiddenness belongs to a label id, survives rename, filters aggregate views, and can be fully hidden and restored.'
	);

	await page.goto('/');
	await page.addStyleTag({
		content: '.firebase-emulator-warning { display: none !important; }'
	});
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
	await openDrawer(page);

	const listName = 'Archive Source';
	const taskName = 'Archived task';
	const archiveName = 'Archive';
	const renamedArchive = 'Someday';

	const consoleMessages: string[] = [];
	const onConsole = (message: ConsoleMessage) => consoleMessages.push(message.text());
	page.on('console', onConsole);
	try {
		await page.getByLabel('New list').fill(listName);
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/lists\?listId=/, { timeout: 10000 });
		const listId = new URL(page.url()).searchParams.get('listId');
		await expect
			.poll(() => consoleMessages.some((text) => text.endsWith(` on ${listId}`)), {
				timeout: 10000
			})
			.toBe(true);
	} finally {
		page.off('console', onConsole);
	}
	await expect(page.getByRole('banner').getByText(listName)).toBeVisible({ timeout: 10000 });
	const newTask = page.getByLabel('New task');
	await newTask.fill(taskName);
	await newTask.blur();
	await expect(page.getByLabel(`Task ${taskName}`)).toBeVisible({ timeout: 10000 });
	await expect(newTask).toHaveValue('');

	await openSelectedDocumentEditor(page, listName);
	await setting(page, 'Labels');
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await page.getByLabel('New label', { exact: true }).fill(archiveName);
	await saveSetting(page);
	await closeSettings(page);
	await openDrawer(page);
	const archiveRow = topLevelSidebarItem(page, archiveName);
	await expect(archiveRow).toBeVisible({ timeout: 10000 });
	const archiveId = await archiveRow.getAttribute('data-id');
	if (!archiveId) throw new Error('Archive label row did not include its label id');

	await helper.step('archive-label-created', {
		description: 'Archive starts as an ordinary visible label containing the source list.',
		verifications: [
			{
				spec: 'Archive is present in the list-of-lists',
				check: async () => expect(archiveRow).toBeVisible()
			},
			{
				spec: 'The archived task exists in its concrete list',
				check: async () => expect(page.getByLabel(`Task ${taskName}`)).toBeVisible()
			}
		]
	});

	await openVisibilityDialog(page);
	await openLabelVisibility(page, archiveName);
	await saveLabelVisibility(page, 'Hidden');

	await helper.step('archive-hidden-setting-applied', {
		description: 'Archive is configured as Hidden in the label settings.',
		verifications: [
			{
				spec: 'Archive is Hidden',
				check: async () =>
					expect(page.getByRole('button', { name: /Archive Hidden/ })).toBeVisible()
			}
		]
	});
	await page.getByRole('button', { name: '‹ Profile', exact: true }).click();

	await navigateFromDrawer(page, 'All', /\/all$/);
	await expect(page.getByLabel(`Task ${taskName}`)).toHaveCount(0);
	await navigateFromDrawer(page, archiveName, new RegExp(`labels\\?labelId=${archiveId}`), true);
	await expect(page.getByLabel(`Task ${taskName}`)).toBeVisible({ timeout: 10000 });

	await helper.step('hidden-label-is-filtered-but-directly-browsable', {
		description: 'Aggregate All excludes the source, while opening Archive directly shows it.',
		verifications: [
			{
				spec: 'The direct Archive view shows the task',
				check: async () => expect(page.getByLabel(`Task ${taskName}`)).toBeVisible()
			}
		]
	});

	await openSelectedDocumentEditor(page, archiveName);
	await setting(page, 'Name');
	await page.getByLabel('Label name', { exact: true }).fill(renamedArchive);
	await saveSetting(page);
	await closeSettings(page);
	await expect(page.getByRole('banner').getByText(renamedArchive)).toBeVisible({ timeout: 10000 });
	await openVisibilityDialog(page);
	await openLabelVisibility(page, renamedArchive);
	await expect(page.getByRole('radio', { name: /^Hidden/ })).toBeChecked();

	await helper.step('hidden-status-survives-rename', {
		description: 'Renaming Archive to Someday does not break the id-based visibility property.',
		verifications: [
			{
				spec: 'Someday remains Hidden',
				check: async () => expect(page.getByRole('radio', { name: /^Hidden/ })).toBeChecked()
			}
		]
	});

	await saveLabelVisibility(page, 'Fully hidden');
	await page.getByRole('button', { name: '‹ Profile', exact: true }).click();
	await openDrawer(page);
	await expect(topLevelSidebarItem(page, renamedArchive)).toHaveCount(0);
	await closeDrawer(page);
	await page.goBack();
	await expect(page).toHaveURL(/\/profile$/, { timeout: 10000 });
	await page.getByRole('button', { name: /Label visibility/ }).click();
	await expect(page.getByRole('button', { name: /Someday Fully hidden/ })).toBeVisible();

	await helper.step('fully-hidden-label-is-recoverable-only-in-settings', {
		description:
			'Someday disappears from navigation and its direct route, but remains configurable.',
		verifications: [
			{
				spec: 'The fully-hidden label is absent from the sidebar',
				check: async () => expect(topLevelSidebarItem(page, renamedArchive)).toHaveCount(0)
			},
			{
				spec: 'The fully-hidden label remains in Profile label visibility',
				check: async () =>
					expect(page.getByRole('button', { name: /Someday Fully hidden/ })).toBeVisible()
			}
		]
	});

	await openLabelVisibility(page, renamedArchive);
	await saveLabelVisibility(page, 'Visible');
	await page.getByRole('button', { name: '‹ Profile', exact: true }).click();
	await navigateFromDrawer(page, 'All', /\/all$/);
	await expect(page.getByLabel(`Task ${taskName}`)).toBeVisible({ timeout: 10000 });
	await openDrawer(page);
	await expect(topLevelSidebarItem(page, renamedArchive)).toBeVisible({ timeout: 10000 });

	await helper.step('visible-label-restores-results-and-navigation', {
		description: 'Returning the same label to Visible restores its task and sidebar position.',
		verifications: [
			{
				spec: 'The task is visible in All again',
				check: async () => expect(page.getByLabel(`Task ${taskName}`)).toBeVisible()
			},
			{
				spec: 'The renamed label is back in the sidebar',
				check: async () => expect(topLevelSidebarItem(page, renamedArchive)).toBeVisible()
			}
		]
	});

	await helper.generateDocs();
});
