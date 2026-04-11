import { test, type Page, type TestInfo } from '@playwright/test';

/**
 * A helper function that wraps test.step and automatically takes a screenshot
 * after each step if the test is running on a mobile device.
 */
export async function testStep(
	page: Page,
	testInfo: TestInfo,
	name: string,
	fn: () => Promise<void>
) {
	await test.step(name, async () => {
		await fn();
		if (testInfo.project.use?.isMobile) {
			const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
			await page.screenshot({
				path: testInfo.outputPath(`${safeName}.png`),
				fullPage: true
			});
		}
	});
}
