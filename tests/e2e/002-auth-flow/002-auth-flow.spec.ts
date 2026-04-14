import { test, expect } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }) => {
	// Ensure that the E2E tests start with a clean state in the emulator.
	const projectId = 'todo-firebase-1a740';
	await request.delete(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`);
	
	// Optional: Clear Auth users if possible. 
	// The Firebase Auth emulator has a REST API for this:
	// DELETE http://localhost:9099/emulator/v1/projects/{project-id}/accounts
	await request.delete(`http://127.0.0.1:9099/emulator/v1/projects/${projectId}/accounts`);
});

test('successful login and profile view', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata('Successful Login Flow', 'Verify that a user can sign in using the test button and view their profile.');

	await page.goto('/');

	await helper.step('login_page', {
		description: 'User is on the login page.',
		verifications: [
			{ spec: 'Login button is visible', check: async () => expect(page.locator('#test-signin')).toBeVisible() }
		]
	});

	await page.click('#test-signin');

	await helper.step('after_login', {
		description: 'User clicked test sign in and should be redirected to profile page (via home page).',
		verifications: [
			{ spec: 'Redirected to profile page', check: async () => expect(page).toHaveURL(/\/profile/, { timeout: 10000 }) }
		]
	});

	// Navigate to profile (already there, but ensuring state)
	await page.goto('/profile');

	await helper.step('profile_page', {
		description: 'User is on the profile page.',
		verifications: [
			{ spec: 'URL is /profile', check: async () => expect(page).toHaveURL(/\/profile/) },
			{ spec: 'Email is visible', check: async () => expect(page.locator('p', { hasText: 'test@example.com' })).toBeVisible() },
			{ spec: 'Name is visible', check: async () => expect(page.locator('p', { hasText: 'Test User' })).toBeVisible() }
		]
	});

	await helper.step('create_list_step', {
		description: 'User creates a new todo list.',
		verifications: [
			{ spec: 'New list input is visible', check: async () => expect(page.getByLabel('New list')).toBeVisible() }
		]
	});

	const listName = 'My Test List';
	await page.getByLabel('New list').fill(listName);
	await page.keyboard.press('Enter');

	await helper.step('list_created', {
		description: 'User created a new list and is redirected to it.',
		verifications: [
			{ spec: 'URL contains the new list ID', check: async () => expect(page).toHaveURL(/lists\?listId=/) },
			{ spec: 'List title matches', check: async () => expect(page.locator('.mdc-top-app-bar__title').filter({ hasText: listName })).toBeVisible() }
		]
	});

	// Go back to profile for signing out
	await page.goto('/profile');
	await page.click('button:has-text("Sign Out")');

	await helper.step('after_signout', {
		description: 'User clicked sign out and should be redirected to login page.',
		verifications: [
			{ spec: 'Redirected to login page', check: async () => expect(page).toHaveURL(/\/login/) }
		]
	});

	await helper.generateDocs();
});
