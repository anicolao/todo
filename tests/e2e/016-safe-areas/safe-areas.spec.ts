import { expect, test, type Locator } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';

// Browser device emulation does not provide a notch. Inject its dimensions so
// these checks exercise nonzero insets in both portrait and landscape.
for (const scenario of [
	{ name: 'portrait', width: 393, height: 852, top: 59, right: 0, bottom: 34, left: 0 },
	{ name: 'mobile without insets', width: 393, height: 852, top: 0, right: 0, bottom: 0, left: 0 },
	{ name: 'landscape', width: 852, height: 393, top: 0, right: 59, bottom: 21, left: 59 },
	{ name: 'desktop', width: 1280, height: 800, top: 0, right: 0, bottom: 0, left: 0 }
]) {
	test(`${scenario.name} keeps controls in the safe area`, async ({ page, request }) => {
		await resetEmulators(request);
		await page.setViewportSize(scenario);
		await page.goto('/login');
		await page.addStyleTag({
			content: `:root { --safe-area-top: ${scenario.top}px; --safe-area-right: ${scenario.right}px; --safe-area-bottom: ${scenario.bottom}px; --safe-area-left: ${scenario.left}px; }`
		});
		async function expectSafe(locator: Locator) {
			await expect(locator).toBeVisible();
			// Visibility alone does not wait for the drawer/dialog opening animation.
			await expect(async () => {
				const box = await locator.boundingBox();
				expect(box).not.toBeNull();
				expect(box!.x).toBeGreaterThanOrEqual(scenario.left);
				expect(box!.y).toBeGreaterThanOrEqual(scenario.top);
				expect(box!.x + box!.width).toBeLessThanOrEqual(scenario.width - scenario.right + 1);
				expect(box!.y + box!.height).toBeLessThanOrEqual(scenario.height - scenario.bottom + 1);
			}).toPass({ timeout: 5000 });
		}
		await expectSafe(page.getByRole('button', { name: 'Sign In', exact: true }));
		await page.getByRole('button', { name: 'Sign In', exact: true }).click();
		await expect(page.locator('.app-content')).toBeVisible({ timeout: 30000 });
		await expectSafe(page.locator('.mdc-top-app-bar__row'));
		await expectSafe(page.locator('.backdrop'));
		const row = await page.locator('.mdc-top-app-bar__row').boundingBox();
		const content = await page.locator('.backdrop').boundingBox();
		// Keep the existing 64px content offset (an 8px gap below compact toolbars).
		expect(content!.y).toBe(64 + scenario.top);
		expect(content!.y).toBeGreaterThanOrEqual(row!.y + row!.height);

		const menu = page.getByRole('button', { name: 'Open navigation menu' });
		if (await menu.isVisible()) await menu.click();
		const profile = page
			.locator('.mdc-drawer .mdc-deprecated-list-item')
			.filter({ hasText: 'Profile' });
		await profile.scrollIntoViewIfNeeded();
		await expectSafe(profile);
		await profile.click();
		await page.getByRole('button', { name: 'Configure Hidden Lists' }).click();
		await expectSafe(page.locator('.hidden-list-dialog .mdc-dialog__surface'));
		await expectSafe(page.getByRole('button', { name: 'Done', exact: true }));
	});
}
