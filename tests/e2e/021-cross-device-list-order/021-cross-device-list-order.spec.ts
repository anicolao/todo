import {
	devices,
	expect,
	type APIRequestContext,
	type Locator,
	type Page,
	test
} from '@playwright/test';
import { installAuthSession, seedAuthUsers, type E2EAuthUser } from '../helpers/auth';
import { emulatorProjectId, firestoreEmulatorOrigin, resetEmulators } from '../helpers/emulator';
import { closeSettings, saveSetting, setting, settings } from '../helpers/list-settings';
import { createList, createTask, ensureListMenuVisible } from '../helpers/task-details';

const owner: E2EAuthUser = {
	uid: 'cross-device-order-owner',
	email: 'cross-device-order-owner@example.com',
	password: 'password',
	name: 'Cross-device Owner',
	photoUrl: ''
};

const recipient: E2EAuthUser = {
	uid: 'cross-device-order-recipient',
	email: 'cross-device-order-recipient@example.com',
	password: 'password',
	name: 'Cross-device Recipient',
	photoUrl: ''
};

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only cross-device drag coverage.');
	await resetEmulators(request);
});

async function signInAs(page: Page, request: APIRequestContext, user: E2EAuthUser) {
	await installAuthSession(page, request, user);
	await page.goto('/profile');
	await expect(page.locator('.drawer-container')).toBeVisible();
	await expect(
		page.getByLabel('Signed-in account').getByText(user.email, { exact: true })
	).toBeVisible();
}

function listRows(page: Page) {
	return page.locator('.mdc-drawer .listContainer .item:not(#ghost)');
}

function listRow(page: Page, name: string): Locator {
	return listRows(page).filter({ has: page.getByText(name, { exact: true }) });
}

async function visibleListOrder(page: Page) {
	await ensureListMenuVisible(page);
	return listRows(page).evaluateAll((rows) =>
		rows.map((row) => {
			const clone = row.cloneNode(true) as HTMLElement;
			clone.querySelectorAll('button').forEach((button) => button.remove());
			return clone.textContent?.trim() || '';
		})
	);
}

async function cachedListOrder(page: Page, email: string) {
	return page.evaluate(async (cacheKey) => {
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open('TODOS', 1);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
		});
		try {
			const state = await new Promise<{
				lists?: { visibleLists?: string[]; listIdToList?: Record<string, string> };
			} | null>((resolve, reject) => {
				const transaction = database.transaction('state', 'readonly');
				const request = transaction.objectStore('state').get(cacheKey);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(request.result || null);
			});
			return (state?.lists?.visibleLists || []).map((id) => state?.lists?.listIdToList?.[id] || id);
		} finally {
			database.close();
		}
	}, email);
}

async function dragListBefore(page: Page, sourceName: string, targetName: string) {
	await ensureListMenuVisible(page);
	const source = listRow(page, sourceName);
	const target = listRow(page, targetName);
	const sourceBox = await source.boundingBox();
	const targetBox = await target.boundingBox();
	if (!sourceBox || !targetBox) throw new Error('List rows must be visible before dragging.');

	const x = sourceBox.x + sourceBox.width / 2;
	const sourceY = sourceBox.y + sourceBox.height / 2;
	const targetY = targetBox.y + targetBox.height / 2;
	await page.mouse.move(x, sourceY);
	await page.mouse.down();
	await page.mouse.move(x, sourceY + 12, { steps: 2 });
	await expect(source).toHaveAttribute('id', 'grabbed');
	await page.mouse.move(x, targetY, { steps: 10 });
	await page.mouse.up();
}

async function waitForPersistedReorders(request: APIRequestContext) {
	await expect
		.poll(async () => {
			const response = await request.post(
				`${firestoreEmulatorOrigin}/v1/projects/${emulatorProjectId}/databases/(default)/documents:runQuery`,
				{
					headers: { Authorization: 'Bearer owner' },
					data: {
						structuredQuery: {
							from: [{ collectionId: 'requests', allDescendants: true }],
							where: {
								fieldFilter: {
									field: { fieldPath: 'type' },
									op: 'EQUAL',
									value: { stringValue: 'reorder_list' }
								}
							}
						}
					}
				}
			);
			expect(response.ok()).toBe(true);
			const results = await response.json();
			return results.filter(
				(row: { document?: { fields?: { timestamp?: { timestampValue?: string } } } }) =>
					row.document?.fields?.timestamp?.timestampValue
			).length;
		})
		.toBe(2);
}

async function persistLegacySelfReorder(request: APIRequestContext, listId: string) {
	const response = await request.patch(
		`${firestoreEmulatorOrigin}/v1/projects/${emulatorProjectId}/databases/(default)/documents/from/${owner.uid}/to/${owner.uid}/requests/legacy-self-reorder`,
		{
			headers: { Authorization: 'Bearer owner' },
			data: {
				fields: {
					type: { stringValue: 'reorder_list' },
					creator: { stringValue: owner.uid },
					target: { stringValue: owner.uid },
					timestamp: { timestampValue: new Date().toISOString() },
					payload: {
						mapValue: {
							fields: {
								id: { stringValue: listId },
								goes_before: { stringValue: listId }
							}
						}
					}
				}
			}
		}
	);
	expect(response.ok(), await response.text()).toBe(true);
}

async function shareCurrentList(page: Page) {
	await ensureListMenuVisible(page);
	await page.locator('.mdc-drawer').getByRole('button', { name: 'Edit list' }).first().click();
	await expect(settings(page)).toBeVisible();
	await setting(page, 'Sharing');
	const recipientRow = page.locator('dialog.list-details .choice').filter({
		hasText: recipient.email
	});
	await expect(recipientRow).toBeVisible();
	await recipientRow.locator('input[type="checkbox"]').check({ force: true });
	await saveSetting(page);
	await closeSettings(page);
}

test('a list moved to the top replays after a legacy invalid reorder', async ({
	browser,
	page: laptop,
	request
}) => {
	test.setTimeout(120_000);
	await seedAuthUsers(request, [owner, recipient]);

	const registrationContext = await browser.newContext({ viewport: laptop.viewportSize()! });
	const phoneContext = await browser.newContext({
		...devices['Pixel 5'],
		viewport: { width: 393, height: 852 },
		deviceScaleFactor: 1,
		isMobile: true,
		hasTouch: true
	});
	let phone = await phoneContext.newPage();
	try {
		const registrationPage = await registrationContext.newPage();
		await signInAs(registrationPage, request, recipient);
		await registrationContext.close();

		await signInAs(laptop, request, owner);
		await signInAs(phone, request, owner);

		const anchorList = 'Cross-device anchor';
		const movedList = 'Cross-device shared list';
		await createList(laptop, anchorList);
		await createList(laptop, movedList);
		await shareCurrentList(laptop);

		await expect.poll(() => visibleListOrder(phone)).toEqual([anchorList, movedList]);
		await expect
			.poll(() => cachedListOrder(phone, owner.email), { timeout: 15_000 })
			.toEqual([anchorList, movedList]);
		// Closing only the page leaves this browser context's IndexedDB intact, like
		// closing the app on a phone after it has cached the newly created list.
		await phone.close();

		const movedListId = await listRow(laptop, movedList).getAttribute('data-id');
		if (!movedListId) throw new Error('The moved list must have a persisted ID.');
		// Older drag code could persist a self-reorder. A second device must skip
		// that malformed historical action and continue to the valid reorder below.
		await persistLegacySelfReorder(request, movedListId);
		await dragListBefore(laptop, movedList, anchorList);
		await expect.poll(() => visibleListOrder(laptop)).toEqual([movedList, anchorList]);
		await waitForPersistedReorders(request);
		for (const taskName of ['First cross-device task', 'Second cross-device task']) {
			await createTask(laptop, taskName);
			await laptop.getByRole('button', { name: `Star ${taskName}` }).click();
			await expect(laptop.getByRole('button', { name: `Unstar ${taskName}` })).toBeVisible();
		}

		phone = await phoneContext.newPage();
		await phone.goto('/');
		await expect(phone.locator('.drawer-container')).toBeVisible({ timeout: 30_000 });
		await expect
			.poll(() => visibleListOrder(phone), { timeout: 15_000 })
			.toEqual([movedList, anchorList]);
	} finally {
		await registrationContext.close().catch(() => undefined);
		await phoneContext.close();
	}
});
