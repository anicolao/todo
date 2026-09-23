import { expect, type Locator, type Page } from '@playwright/test';

export const recipientPhoto = 'https://avatars.example.test/recipient.jpg';
export const brokenPhoto = 'https://avatars.example.test/missing.jpg';

export async function installAvatarFixtures(page: Page) {
	await page.route('https://avatars.example.test/**', (route) =>
		route.request().url() === recipientPhoto
			? route.fulfill({
					path: 'tests/e2e/fixtures/recipient-avatar.jpg',
					contentType: 'image/jpeg'
			  })
			: route.fulfill({ status: 404, body: '' })
	);
}

export async function expectRecipientPhoto(row: Locator) {
	const photo = row.locator('img');
	await expect(photo).toHaveAttribute('src', recipientPhoto);
	await expect
		.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
		.toBe(true);
}
