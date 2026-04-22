import { test, expect } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }) => {
	// Ensure that the E2E tests start with a clean state in the emulator.
	const projectId = 'todo-firebase-1a740';
	await request.delete(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`);
});

test('login page verification', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata('Login Page Verification', 'Verify the initial state of the login page.');

	await page.goto('/');

	await helper.step('login_page', {
		description: 'User navigates to the home page and is redirected to the login page, where content and button are verified.',
		verifications: [
			{
				spec: 'URL is /login',
				check: async () => {
					await expect(page).toHaveURL(/\/login/);
				}
			},
			{
				spec: 'Title is Todo',
				check: async () => {
					await expect(page).toHaveTitle(/Todo/);
				}
			},
			{
				spec: 'Heading contains TODOs',
				check: async () => {
					const heading = page.locator('h2');
					await expect(heading).toBeVisible();
					await expect(heading).toContainText('TODOs');
				}
			},
			{
				spec: 'Welcome message is present',
				check: async () => {
					const welcomeMessage = page.locator('p').filter({ hasText: 'Welcome to Todo. Please sign in.' });
					await expect(welcomeMessage).toBeVisible();
				}
			},
			{
				spec: 'Login button is visible',
				check: async () => {
					const loginButton = page.getByRole('button', { name: 'Sign In', exact: true });
					await expect(loginButton).toBeVisible();
				}
			}
		]
	});

	await helper.generateDocs();
});
