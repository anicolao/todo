import { expect, type Page } from '@playwright/test';
import { ensureListMenuVisible } from './task-details';
export const settings = (page: Page) => page.locator('dialog.list-details');
export async function openSettings(page: Page) {
	await ensureListMenuVisible(page);
	await page
		.locator('.mdc-drawer')
		.getByRole('button', { name: 'Edit list', exact: true })
		.first()
		.click();
	await expect(settings(page)).toBeVisible();
}
export async function setting(page: Page, name: 'Name' | 'Labels' | 'Sharing') {
	await settings(page)
		.getByRole('button', { name: new RegExp('^' + name + ' ') })
		.click();
	await expect(settings(page).getByRole('heading', { name, exact: true })).toBeVisible();
}
export async function saveSetting(page: Page) {
	await settings(page)
		.getByRole('button', { name: /^(Save|Retry)$/ })
		.click();
	await expect(settings(page).getByRole('heading', { name: /^(List|Label) details$/ })).toBeVisible(
		{ timeout: 20000 }
	);
}
export async function closeSettings(page: Page) {
	await settings(page).getByRole('button', { name: 'Close', exact: true }).click();
	await expect(settings(page)).not.toBeVisible();
}
