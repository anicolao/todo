import { expect, test, type Page } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { createList, ensureListMenuVisible, signIn } from '../helpers/task-details';
import { closeSettings, openSettings, setting, settings } from '../helpers/list-settings';
import { TestStepHelper } from '../helpers/test-step-helper';

function navigationRow(page: Page, listId: string) {
	return page
		.locator(`[data-navigation-id="${listId}"]`)
		.first()
		.locator('.mdc-deprecated-list-item');
}

async function selectList(page: Page, listId: string) {
	await navigationRow(page, listId).click();
	await expect(page).toHaveURL(new RegExp(`listId=${listId}`));
}

test('screen transitions follow mobile navigation context and stay off on desktop', async ({
	page
}, testInfo) => {
	test.setTimeout(120000);
	await resetEmulators(page.request);
	await signIn(page);
	await createList(page, 'Upper list');
	const upperId = new URL(page.url()).searchParams.get('listId');
	expect(upperId).toBeTruthy();
	await ensureListMenuVisible(page);
	await page.getByLabel('New list').fill('Lower list');
	await page.getByLabel('New list').press('Enter');
	await expect.poll(() => new URL(page.url()).searchParams.get('listId')).not.toBe(upperId);
	await expect(page.getByRole('banner').getByText('Lower list', { exact: true })).toBeVisible();
	const lowerId = new URL(page.url()).searchParams.get('listId');
	expect(lowerId).toBeTruthy();

	const helper = new TestStepHelper(
		page,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'Mobile screen transitions',
		'Portrait navigation uses a full-screen drawer track, landscape list selection follows drawer order vertically, focused setting screens move left and right, and desktop remains still.'
	);

	if (testInfo.project.name === 'Desktop Chrome') {
		await selectList(page, upperId!);
		await helper.step('desktop_navigation_stays_still', {
			verifications: [
				{
					spec: 'Desktop route content opts out of screen transitions',
					check: async () =>
						await expect(page.locator('.route-screen')).toHaveAttribute(
							'data-transition-direction',
							'none'
						)
				}
			]
		});
		await helper.generateDocs();
		return;
	}

	await page.setViewportSize({ width: 393, height: 852 });
	await ensureListMenuVisible(page);
	const shell = page.locator('.drawer-container');
	const drawer = page.locator('.mdc-drawer');
	const appContent = page.locator('.app-content');
	await expect(shell).toHaveClass(/mobile-portrait/);
	await expect(shell).toHaveClass(/drawer-open/);
	await helper.step('portrait_drawer_covers_screen', {
		verifications: [
			{
				spec: 'Portrait drawer covers the viewport while the current screen is pushed right',
				check: async () => {
					await expect(drawer).toHaveCSS('width', '393px');
					await expect
						.poll(async () =>
							appContent.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41)
						)
						.toBeGreaterThanOrEqual(392);
				}
			}
		]
	});

	await selectList(page, upperId!);
	await expect(shell).not.toHaveClass(/drawer-open/);
	await expect(page.getByRole('banner').getByText('Upper list', { exact: true })).toBeVisible();
	await helper.step('portrait_destination_returns_from_right', {
		verifications: [
			{
				spec: 'Closing the drawer reveals the selected list with no competing inner transition',
				check: async () => {
					await expect(appContent).toHaveCSS('transform', 'none');
					await expect(page.locator('.route-screen')).toHaveAttribute(
						'data-transition-direction',
						'none'
					);
				}
			}
		]
	});

	await page.setViewportSize({ width: 852, height: 393 });
	await expect(shell).toHaveClass(/mobile-landscape/);
	await expect(page.getByRole('button', { name: 'Open navigation menu' })).toHaveCount(0);
	await selectList(page, lowerId!);
	await helper.step('landscape_lower_list_slides_up', {
		verifications: [
			{
				spec: 'Selecting a lower drawer row moves the right pane upward',
				check: async () =>
					await expect(page.locator('.route-screen')).toHaveAttribute(
						'data-transition-direction',
						'up'
					)
			}
		]
	});

	await selectList(page, upperId!);
	await helper.step('landscape_upper_list_slides_down', {
		verifications: [
			{
				spec: 'Selecting a higher drawer row moves the right pane downward',
				check: async () =>
					await expect(page.locator('.route-screen')).toHaveAttribute(
						'data-transition-direction',
						'down'
					)
			}
		]
	});

	await page.setViewportSize({ width: 393, height: 852 });
	await openSettings(page);
	await setting(page, 'Name');
	await expect(settings(page).locator('.editor-screen:not([inert])')).toHaveAttribute(
		'data-transition-direction',
		'forward'
	);
	await page.getByRole('button', { name: '‹ Details', exact: true }).click();
	await helper.step('focused_settings_slide_back', {
		verifications: [
			{
				spec: 'Focused settings use forward and backward horizontal screen movement',
				check: async () =>
					await expect(settings(page).locator('.editor-screen:not([inert])')).toHaveAttribute(
						'data-transition-direction',
						'backward'
					)
			}
		]
	});
	await closeSettings(page);

	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.setViewportSize({ width: 852, height: 393 });
	await selectList(page, lowerId!);
	await helper.step('reduced_motion_stays_still', {
		verifications: [
			{
				spec: 'Reduced-motion preference disables route transitions',
				check: async () =>
					await expect(page.locator('.route-screen')).toHaveAttribute(
						'data-transition-direction',
						'none'
					)
			}
		]
	});
	await helper.generateDocs();
});
