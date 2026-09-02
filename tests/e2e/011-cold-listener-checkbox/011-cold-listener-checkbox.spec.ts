import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { installAuthSession, seedAuthUsers, type E2EAuthUser } from '../helpers/auth';
import { resetEmulators } from '../helpers/emulator';

const user: E2EAuthUser = {
	uid: 'cold-listener-user',
	email: 'cold-listener@example.com',
	password: 'password',
	name: 'Cold Listener',
	photoUrl: 'https://i.pravatar.cc/150?u=cold-listener'
};

const NETWORK_LATENCY_MS = 1200;

test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only performance coverage.');
	await resetEmulators(request);
	await seedAuthUsers(request, [user]);
});

async function openSignedInApp(page: Page, request: Parameters<typeof installAuthSession>[1]) {
	await installAuthSession(page, request, user);
	await page.goto('/');
	await expect(page.locator('.drawer-container')).toBeVisible();
}

async function createList(page: Page, listName: string, consoleMessages: string[]) {
	const newList = page.getByLabel('New list');
	await expect(newList).toBeVisible();
	await newList.fill(listName);
	await newList.press('Enter');
	await expect(page).toHaveURL(/lists\/?\?listId=/);
	const listId = new URL(page.url()).searchParams.get('listId');
	expect(listId).toBeTruthy();
	await expect
		.poll(() => consoleMessages.some((text) => text.endsWith(` on ${listId}`)), {
			message: 'Wait for the new list listener before seeding tasks'
		})
		.toBe(true);
	return listId as string;
}

async function createTask(page: Page, description: string) {
	const newTask = page.getByLabel('New task');
	await newTask.fill(description);
	await newTask.blur();
	await expect(page.getByLabel(`Task ${description}`)).toBeVisible();
}

async function cachedTaskDescriptions(page: Page, listId: string) {
	return page.evaluate(
		async ({ email, listId }) => {
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const request = indexedDB.open('TODOS', 1);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(request.result);
			});
			const state = await new Promise<any>((resolve, reject) => {
				const transaction = db.transaction('state', 'readonly');
				const request = transaction.objectStore('state').get(email);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(request.result);
			});
			db.close();
			return Object.values(state?.items?.listIdToListOfItems?.[listId]?.itemIdToItem || {}).map(
				(item: any) => item.description
			);
		},
		{ email: user.email, listId }
	);
}

async function deleteFirestoreIndexedDb(context: BrowserContext, origin: string) {
	const cleanupPage = await context.newPage();
	await cleanupPage.route('**/*', async (route) => {
		if (route.request().resourceType() === 'document') {
			await route.fulfill({
				contentType: 'text/html',
				body: '<!doctype html><title>cleanup</title>'
			});
		} else {
			await route.abort();
		}
	});
	await cleanupPage.goto(origin);
	const deleted = await cleanupPage.evaluate(async () => {
		const databases = await indexedDB.databases();
		const names = databases
			.map((database) => database.name)
			.filter((name): name is string => !!name && name.toLowerCase().includes('firestore'));
		await Promise.all(
			names.map(
				(name) =>
					new Promise<void>((resolve, reject) => {
						const request = indexedDB.deleteDatabase(name);
						request.onerror = () => reject(request.error);
						request.onblocked = () => reject(new Error(`Deleting ${name} was blocked`));
						request.onsuccess = () => resolve();
					})
			)
		);
		return names;
	});
	await cleanupPage.close();
	return deleted;
}

function taskIsVisible(page: Page, description: string) {
	return page.getByLabel(`Task ${description}`).isVisible();
}

test('a cached list watcher is active before the first checkbox click', async ({
	page,
	context,
	request
}, testInfo) => {
	const seedConsoleMessages: string[] = [];
	page.on('console', (message) => seedConsoleMessages.push(message.text()));
	await openSignedInApp(page, request);

	const listId = await createList(page, 'Cold listener list', seedConsoleMessages);
	const firstTask = 'First cached task';
	const secondTask = 'Second cached task';
	await createTask(page, firstTask);
	await createTask(page, secondTask);
	// Cache writes snapshot the server-side state before the action being acknowledged.
	// A third action ensures both tasks above are included in the next cached snapshot.
	await createTask(page, 'Cache flush task');
	await expect
		.poll(() => cachedTaskDescriptions(page, listId), {
			timeout: 15000,
			message: 'Wait for both target tasks to reach the app-level IndexedDB cache'
		})
		.toEqual(expect.arrayContaining([firstTask, secondTask]));

	const origin = new URL(page.url()).origin;
	await page.close();
	const deletedDatabases = await deleteFirestoreIndexedDb(context, origin);
	expect(deletedDatabases.length).toBeGreaterThan(0);

	const coldPage = await context.newPage();
	const consoleEvents: { elapsedMs: number; text: string }[] = [];
	const coldStart = Date.now();
	coldPage.on('console', (message) => {
		const text = message.text();
		if (
			text.includes('Display cached state in ui') ||
			text.includes('Subscribe to global') ||
			text.includes('Refresh list subscriptions') ||
			text.includes(`Loading for ${listId}`) ||
			text.includes(`Firebase: Setting up list ${listId}`) ||
			text.includes(`Firebase: ...done checking alreadySetup ${listId}`) ||
			text.endsWith(` on ${listId}`) ||
			text.includes(`Calling handleDocChanges for ${listId}`)
		) {
			consoleEvents.push({ elapsedMs: Date.now() - coldStart, text });
		}
	});

	const cdp = await context.newCDPSession(coldPage);
	await cdp.send('Network.enable');
	await cdp.send('Network.emulateNetworkConditions', {
		offline: false,
		latency: NETWORK_LATENCY_MS,
		downloadThroughput: -1,
		uploadThroughput: -1,
		connectionType: 'cellular3g'
	});

	await coldPage.goto(`${origin}/lists?listId=${listId}`);
	await expect(coldPage.locator('.drawer-container')).toBeVisible();
	await expect(coldPage.getByLabel(`Task ${firstTask}`)).toBeVisible();
	const watcherWasReadyAtFirstClick = consoleEvents.some((event) =>
		event.text.endsWith(` on ${listId}`)
	);
	expect(watcherWasReadyAtFirstClick).toBe(true);

	const firstClickAtMs = Date.now() - coldStart;
	const firstClickStart = Date.now();
	await coldPage.getByRole('button', { name: `Complete ${firstTask}` }).click();
	await expect.poll(() => taskIsVisible(coldPage, firstTask), { timeout: 15000 }).toBe(false);
	const firstClickMs = Date.now() - firstClickStart;
	const firstTaskHiddenAtMs = Date.now() - coldStart;

	await expect
		.poll(() => consoleEvents.some((event) => event.text.endsWith(` on ${listId}`)), {
			message: 'Wait for the selected-list listener to become active'
		})
		.toBe(true);

	const secondClickAtMs = Date.now() - coldStart;
	const secondClickStart = Date.now();
	await coldPage.getByRole('button', { name: `Complete ${secondTask}` }).click();
	await expect.poll(() => taskIsVisible(coldPage, secondTask), { timeout: 5000 }).toBe(false);
	const secondClickMs = Date.now() - secondClickStart;
	const secondTaskHiddenAtMs = Date.now() - coldStart;

	const summary = {
		networkLatencyMs: NETWORK_LATENCY_MS,
		deletedDatabases,
		watcherWasReadyAtFirstClick,
		firstClickAtMs,
		firstTaskHiddenAtMs,
		firstClickMs,
		secondClickAtMs,
		secondTaskHiddenAtMs,
		secondClickMs,
		consoleEvents
	};
	console.log(`Cold listener checkbox summary: ${JSON.stringify(summary, null, 2)}`);
	testInfo.annotations.push({
		type: 'cold-listener-checkbox-summary',
		description: JSON.stringify({ firstClickMs, secondClickMs, watcherWasReadyAtFirstClick })
	});

	expect(firstClickMs).toBeLessThan(500);
	expect(secondClickMs).toBeLessThan(500);
});
