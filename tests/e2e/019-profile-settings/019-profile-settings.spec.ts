import { expect, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';
import { closeSettings, openSettings, saveSetting, setting } from '../helpers/list-settings';
import { createList, signIn } from '../helpers/task-details';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }) => resetEmulators(request));

test('profile settings save independently and sign out confirms', async ({ page }, testInfo) => {
	test.setTimeout(120000);
	await signIn(page);
	await createList(page, 'Profile source');
	await openSettings(page);
	await setting(page, 'Labels');
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await page.getByLabel('New label', { exact: true }).fill('Weekend archive');
	await saveSetting(page);
	await closeSettings(page);
	await page.goto('/profile');

	const helper = new TestStepHelper(
		page,
		testInfo,
		testInfo.project.name.replaceAll(' ', '-'),
		true
	);
	helper.setMetadata(
		'Profile settings',
		'Profile uses focused setting screens, independent confirmed saves, searchable shared-label visibility, and sign-out confirmation.'
	);
	const profile = page.locator('main.profile-settings');

	await helper.step('profile_overview', {
		verifications: [
			{
				spec: 'Identity and saved summaries are grouped without a root Save',
				check: async () => {
					await expect(profile.getByText('Test User', { exact: true })).toBeVisible();
					await expect(
						profile.getByLabel('Signed-in account').getByText('test@example.com', { exact: true })
					).toBeVisible();
					await expect(profile.getByRole('button', { name: /Item spacing Compact/ })).toBeVisible();
					await expect(profile.getByRole('button', { name: /Background Default/ })).toBeVisible();
					await expect(
						profile.getByRole('button', { name: /Label visibility All labels visible/ })
					).toBeVisible();
					await expect(profile.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
				}
			}
		]
	});

	await profile.getByRole('button', { name: /Item spacing Compact/ }).click();
	await expect(page.getByRole('heading', { name: 'Item spacing', exact: true })).toBeFocused();
	const previewItems = page.locator('.spacing-preview .container');
	await helper.step('compact_spacing_preview', {
		verifications: [
			{
				spec: 'Compact preview renders three real, non-interactive task rows',
				check: async () => {
					await expect(previewItems).toHaveCount(3);
					await expect(previewItems).toHaveClass([/high/, /high/, /high/]);
					await expect(
						page.locator('.spacing-preview input[aria-label="Task Pick up groceries"]')
					).toHaveAttribute('readonly', '');
				}
			}
		]
	});
	await page.getByRole('radio', { name: /^Comfortable/ }).check();
	await helper.step('comfortable_spacing_preview', {
		verifications: [
			{
				spec: 'Comfortable applies the production low-density class to all preview rows',
				check: async () => await expect(previewItems).toHaveClass([/low/, /low/, /low/])
			}
		]
	});
	await page.getByRole('button', { name: '‹ Profile', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Discard changes?', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await expect(profile.getByRole('button', { name: /Item spacing Compact/ })).toBeFocused();
	await profile.getByRole('button', { name: /Item spacing Compact/ }).click();
	await page.getByRole('radio', { name: /^Comfortable/ }).check();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(profile.getByRole('button', { name: /Item spacing Comfortable/ })).toBeVisible();
	await page.reload();
	await expect(profile.getByRole('button', { name: /Item spacing Comfortable/ })).toBeVisible();

	await helper.step('spacing_saved', {
		verifications: [
			{
				spec: 'Discard leaves Compact intact; Save persists Comfortable through reload',
				check: async () =>
					await expect(
						profile.getByRole('button', { name: /Item spacing Comfortable/ })
					).toBeVisible()
			}
		]
	});

	await profile.getByRole('button', { name: /Background Default/ }).click();
	const background = page.getByLabel('Image URL');
	await background.fill('javascript:alert(1)');
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
	await expect(page.locator('.backdrop')).toHaveCSS('background-image', 'none');
	const imageUrl = `${new URL(page.url()).origin}/loading-icon.png`;
	await background.fill(imageUrl);
	await expect(page.getByAltText('Background preview')).toHaveAttribute('src', imageUrl, {
		timeout: 5000
	});
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(profile.getByRole('button', { name: /Background Custom image/ })).toBeVisible();
	await profile.getByRole('button', { name: /Background Custom image/ }).click();
	await page.getByRole('button', { name: 'Use default background', exact: true }).click();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(profile.getByRole('button', { name: /Background Default/ })).toBeVisible();

	await profile.getByRole('button', { name: /Label visibility/ }).click();
	await page.getByLabel('Search labels').fill('weekend');
	await expect(page.getByRole('button', { name: /Weekend archive Visible/ })).toBeVisible();
	await page.getByRole('button', { name: /Weekend archive Visible/ }).click();
	await page.getByRole('radio', { name: /^Hidden/ }).check();
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Label visibility', exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: /Weekend archive Hidden/ })).toBeVisible();
	await page.getByRole('button', { name: '‹ Profile', exact: true }).click();
	await expect(profile.getByRole('button', { name: /Label visibility 1 hidden/ })).toBeVisible();

	await helper.step('background_and_labels', {
		verifications: [
			{
				spec: 'Invalid background input never applies, Default saves explicitly, and one searched label saves as Hidden',
				check: async () => {
					await expect(profile.getByRole('button', { name: /Background Default/ })).toBeVisible();
					await expect(
						profile.getByRole('button', { name: /Label visibility 1 hidden/ })
					).toBeVisible();
				}
			}
		]
	});

	await profile.getByRole('button', { name: /Sign out…/ }).click();
	await expect(page.getByRole('button', { name: 'Keep me signed in', exact: true })).toBeFocused();
	await page.getByRole('button', { name: 'Keep me signed in', exact: true }).click();
	await expect(profile.getByText('Test User', { exact: true })).toBeVisible();
	await profile.getByRole('button', { name: /Sign out…/ }).click();
	await helper.step('signout_confirmation', {
		verifications: [
			{
				spec: 'Sign out is cancellable and identifies the account before the explicit action',
				check: async () => {
					await expect(page.getByText('test@example.com', { exact: true }).last()).toBeVisible();
					await expect(
						page.getByRole('button', { name: 'Keep me signed in', exact: true })
					).toBeFocused();
				}
			}
		]
	});
	await page.getByRole('button', { name: 'Sign out', exact: true }).click();
	await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
	await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();

	await helper.generateDocs();
});

test('profile child screens remain usable at narrow width and large text', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'Pixel 5', 'Phone-only responsive coverage');
	await signIn(page);
	await page.setViewportSize({ width: 320, height: 568 });
	await page.goto('/profile');
	const profile = page.locator('main.profile-settings');
	await expect(profile).toBeVisible();
	expect(await profile.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
		true
	);

	await profile.getByRole('button', { name: /Background Default/ }).click();
	const editor = page.getByRole('dialog', { name: 'Background' });
	await editor.evaluate((element) => ((element as HTMLElement).style.fontSize = '34px'));
	await page.getByLabel('Image URL').fill('https://example.com/a-very-long-background-name.jpg');
	await page.setViewportSize({ width: 320, height: 350 });
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
	expect(await editor.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

	await page.evaluate(() => history.back());
	await expect(page.getByRole('heading', { name: 'Discard changes?', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
	await editor.evaluate((element) => ((element as HTMLElement).style.fontSize = '17px'));
	await page.setViewportSize({ width: 320, height: 568 });
	await page.getByRole('button', { name: '‹ Profile', exact: true }).click();
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await expect(profile.getByRole('button', { name: /Background Default/ })).toBeFocused();
});
