import { test, expect } from '@playwright/test';
import { testStep } from './helpers';

test.beforeEach(async ({ request }) => {
	// Ensure that the E2E tests start with a clean state in the emulator.
	// We use the Firestore emulator's REST API to delete all data.
	// The project ID is found in src/lib/firebase.ts
	const projectId = 'todo-firebase-1a740';
	await request.delete(`http://localhost:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`);
});

test('view the login page and check for TODOs title', async ({ page }, testInfo) => {
	await testStep(page, testInfo, 'Navigate to the home page', async () => {
		await page.goto('/');
		// The app redirects to /login if not authenticated
		await expect(page).toHaveURL(/\/login/);
	});

	await testStep(page, testInfo, 'Verify the login page content', async () => {
		// Check for the title in the head
		await expect(page).toHaveTitle(/Todo/);
		
		// Check for the "TODOs" heading in the card
		const heading = page.locator('h2');
		await expect(heading).toBeVisible();
		await expect(heading).toContainText('TODOs');
		
		// Check for the welcome message
		const welcomeMessage = page.locator('p');
		await expect(welcomeMessage).toContainText('Welcome to Todo. Please sign in.');
	});

	await testStep(page, testInfo, 'Verify Login button is present', async () => {
		// The Login component should be rendered
		const loginButton = page.locator('button');
		await expect(loginButton).toBeVisible();
	});
});
