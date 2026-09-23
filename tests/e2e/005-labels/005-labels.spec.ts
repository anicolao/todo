import { ensureListMenuVisible } from '../helpers/task-details';
import { setting, saveSetting, closeSettings, settings } from '../helpers/list-settings';
import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import {
	authEmulatorOrigin,
	emulatorProjectId,
	firestoreEmulatorOrigin,
	resetEmulators
} from '../helpers/emulator';
import { TestStepHelper } from '../helpers/test-step-helper';

test.beforeEach(async ({ request }) => {
	await resetEmulators(request);
});

async function openDrawerIfNeeded(page: import('@playwright/test').Page) {
	await ensureListMenuVisible(page);
}

async function openCurrentListEditDialog(page: import('@playwright/test').Page, listName: string) {
	await expect(page.getByRole('banner').getByText(listName, { exact: true })).toBeVisible({
		timeout: 10000
	});
	await openDrawerIfNeeded(page);
	const drawer = page.locator('.mdc-drawer');
	const editButton = drawer
		.locator('.list-menu-item')
		.filter({ hasText: listName })
		.getByRole('button', { name: 'Edit list' });
	await expect(editButton).toBeVisible({ timeout: 10000 });
	await editButton.dispatchEvent('pointerdown');
	await expect(settings(page)).toBeVisible({ timeout: 10000 });
	await setting(page, 'Labels');
}

async function saveCurrentListEditDialog(page: import('@playwright/test').Page) {
	if (await page.getByRole('button', { name: 'Save', exact: true }).isEnabled())
		await saveSetting(page);
	else await page.getByRole('button', { name: '‹ Details', exact: true }).click();
	await closeSettings(page);
}

async function openNestedListFromActiveLabel(
	page: import('@playwright/test').Page,
	listName: string
) {
	await openDrawerIfNeeded(page);
	const nestedList = page.locator('.nested-list-item').filter({
		has: page.getByText(listName, { exact: true })
	});
	await expect(nestedList).toBeVisible({ timeout: 10000 });
	await page.waitForTimeout(650);
	await nestedList.locator('.mdc-deprecated-list-item').click();
	await expect(page).toHaveURL(/lists\?listId=/);
}

async function clickDrawerLabel(page: import('@playwright/test').Page, labelName: string) {
	await page.locator('.mdc-drawer .list-menu-item').filter({ hasText: labelName }).first().click();
	await expectMobileDrawerOpen(page);
}

async function startSidebarAnimationCapture(page: import('@playwright/test').Page) {
	await page.evaluate(() => {
		const animationTargets: string[] = [];
		(window as typeof window & { sidebarAnimationTargets?: string[] }).sidebarAnimationTargets =
			animationTargets;
		document.querySelector('.listContainer')?.addEventListener('animationstart', (event) => {
			const target = event.target;
			if (target instanceof HTMLElement) {
				if (target.classList.contains('nested-list-items')) {
					animationTargets.push('nested-list-items');
				} else if (target.classList.contains('item')) {
					animationTargets.push('item');
				}
			}
		});
	});
}

async function expectOneNestedContentsAnimation(page: import('@playwright/test').Page) {
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as typeof window & { sidebarAnimationTargets?: string[] }).sidebarAnimationTargets
						?.length || 0
			)
		)
		.toBe(1);
	await page.waitForTimeout(300);
	const animationTargets = await page.evaluate(
		() =>
			(window as typeof window & { sidebarAnimationTargets?: string[] }).sidebarAnimationTargets ||
			[]
	);
	expect(animationTargets).toEqual(['nested-list-items']);
}

function drawerTopLevelItem(page: import('@playwright/test').Page, name: string) {
	return page
		.locator('.mdc-drawer .listContainer > .mdc-deprecated-list > .item')
		.filter({ has: page.locator('.list-menu-item').getByText(name, { exact: true }) })
		.first();
}

async function expectNestedListVisibleUnderLabel(
	page: import('@playwright/test').Page,
	labelName: string,
	listName: string
) {
	await expect(
		drawerTopLevelItem(page, labelName).locator('.nested-list-item').getByText(listName)
	).toBeVisible({
		timeout: 10000
	});
}

async function expectNestedListSnugUnderLabel(
	page: import('@playwright/test').Page,
	labelName: string,
	listName: string
) {
	const labelRow = drawerTopLevelItem(page, labelName);
	const labelIcon = labelRow.locator('img[src="/new/label.svg"]');
	const nestedIcon = labelRow
		.locator('.nested-list-item')
		.filter({ has: page.getByText(listName, { exact: true }) })
		.locator('img[src="/new/list.svg"]');
	await expect(labelIcon).toBeVisible();
	await expect(nestedIcon).toBeVisible();
	const labelBox = await labelIcon.boundingBox();
	const nestedBox = await nestedIcon.boundingBox();
	expect(labelBox).not.toBeNull();
	expect(nestedBox).not.toBeNull();
	if (labelBox && nestedBox) {
		expect(nestedBox.x - labelBox.x).toBeGreaterThanOrEqual(0);
		expect(nestedBox.x - labelBox.x).toBeLessThanOrEqual(16);
	}
}

async function labelActionX(
	page: import('@playwright/test').Page,
	labelName: string,
	actionName: string
) {
	const action = drawerTopLevelItem(page, labelName).getByRole('button', { name: actionName });
	await expect(action).toBeVisible();
	// Compare layout coordinates, not viewport coordinates that include the phone
	// drawer's opening transform. offsetLeft still detects the pin moving when
	// the neighboring Edit button disappears, without racing that animation.
	return action.evaluate((element: HTMLElement) => element.offsetLeft);
}

async function expectNestedListHiddenUnderLabel(
	page: import('@playwright/test').Page,
	labelName: string,
	listName: string
) {
	await expect(
		drawerTopLevelItem(page, labelName).locator('.nested-list-item').getByText(listName)
	).toHaveCount(0);
}

async function createDraftLabel(page: import('@playwright/test').Page, labelName: string) {
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await page.getByLabel('New label', { exact: true }).fill(labelName);
	await saveSetting(page);
	await setting(page, 'Labels');
}

async function toggleDraftLabelMembership(
	page: import('@playwright/test').Page,
	labelName: string,
	checked: boolean
) {
	const labelsEditor = settings(page);
	const checkbox = labelsEditor.getByLabel(`Include in ${labelName}`);
	await expect(checkbox).toBeVisible({ timeout: 10000 });
	if ((await checkbox.isChecked()) !== checked) {
		await checkbox.dispatchEvent('click');
	}
	await expect(checkbox).toBeChecked({ checked });
}

async function expectMobileDrawerOpen(page: import('@playwright/test').Page) {
	const drawer = page.locator('.mdc-drawer');
	const isModal = await drawer.evaluate((element) =>
		element.classList.contains('mdc-drawer--modal')
	);
	if (!isModal) {
		return;
	}
	await expect(drawer).toHaveClass(/mdc-drawer--open/);
}

async function expectPersistedGlobalAction(
	request: APIRequestContext,
	type: 'pin_label' | 'unpin_label',
	id: string
) {
	const authResponse = await request.post(
		`${authEmulatorOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
		{
			data: {
				email: process.env.VITE_TEST_LOGIN_EMAIL || 'test@example.com',
				password: process.env.VITE_TEST_LOGIN_PASSWORD || 'password',
				returnSecureToken: true
			}
		}
	);
	expect(authResponse.ok()).toBe(true);
	const { idToken, localId } = (await authResponse.json()) as {
		idToken: string;
		localId: string;
	};

	await expect
		.poll(
			async () => {
				const response = await request.post(
					`${firestoreEmulatorOrigin}/v1/projects/${emulatorProjectId}/databases/(default)/documents:runQuery`,
					{
						headers: { Authorization: `Bearer ${idToken}` },
						data: {
							structuredQuery: {
								from: [{ collectionId: 'requests', allDescendants: true }],
								where: {
									fieldFilter: {
										field: { fieldPath: 'target' },
										op: 'EQUAL',
										value: { stringValue: localId }
									}
								}
							}
						}
					}
				);
				if (!response.ok()) {
					return false;
				}
				const rows = (await response.json()) as
					| Array<{
							document?: { fields?: Record<string, any> };
					  }>
					| Record<string, unknown>;
				if (!Array.isArray(rows)) {
					return false;
				}
				return rows.some((row) => {
					const fields = row.document?.fields;
					return (
						fields?.type?.stringValue === type &&
						fields?.payload?.mapValue?.fields?.id?.stringValue === id &&
						!!fields?.timestamp?.timestampValue
					);
				});
			},
			{ timeout: 15000 }
		)
		.toBe(true);
}

async function expectPersistedLabelOrder(
	request: APIRequestContext,
	labelId: string,
	expressionIds: string[][]
) {
	const authResponse = await request.post(
		`${authEmulatorOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
		{
			data: {
				email: process.env.VITE_TEST_LOGIN_EMAIL || 'test@example.com',
				password: process.env.VITE_TEST_LOGIN_PASSWORD || 'password',
				returnSecureToken: true
			}
		}
	);
	expect(authResponse.ok()).toBe(true);
	const { idToken } = (await authResponse.json()) as { idToken: string };

	await expect
		.poll(
			async () => {
				const response = await request.get(
					`${firestoreEmulatorOrigin}/v1/projects/${emulatorProjectId}/databases/(default)/documents/lists/${labelId}/actions`,
					{ headers: { Authorization: `Bearer ${idToken}` } }
				);
				if (!response.ok()) {
					return false;
				}
				const body = (await response.json()) as {
					documents?: Array<{ fields?: Record<string, any> }>;
				};
				return (body.documents || []).some((document) => {
					const fields = document.fields;
					const payload = fields?.payload?.mapValue?.fields;
					const predicateIds = (value: any): string[] => {
						const predicate = value?.mapValue?.fields;
						if (predicate?.type?.stringValue === 'id') {
							return [predicate.id?.stringValue];
						}
						return (predicate?.predicates?.arrayValue?.values || []).flatMap(predicateIds);
					};
					const persistedExpressionIds = payload?.predicates?.arrayValue?.values?.map(predicateIds);
					return (
						fields?.type?.stringValue === 'reorder_label_predicates' &&
						payload?.label_id?.stringValue === labelId &&
						JSON.stringify(persistedExpressionIds) === JSON.stringify(expressionIds) &&
						!!fields?.timestamp?.timestampValue
					);
				});
			},
			{ timeout: 15000 }
		)
		.toBe(true);
}

function firestoreValue(value: any): any {
	if (typeof value === 'string') return { stringValue: value };
	if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
	return {
		mapValue: {
			fields: Object.fromEntries(
				Object.entries(value).map(([key, nestedValue]) => [key, firestoreValue(nestedValue)])
			)
		}
	};
}

async function setNestedLabelQuery(
	request: APIRequestContext,
	labelId: string,
	listAId: string,
	listBId: string,
	listCId: string
) {
	const authResponse = await request.post(
		`${authEmulatorOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
		{
			data: {
				email: process.env.VITE_TEST_LOGIN_EMAIL || 'test@example.com',
				password: process.env.VITE_TEST_LOGIN_PASSWORD || 'password',
				returnSecureToken: true
			}
		}
	);
	expect(authResponse.ok()).toBe(true);
	const { idToken, localId } = (await authResponse.json()) as {
		idToken: string;
		localId: string;
	};
	const action = {
		type: 'set_label_query',
		payload: {
			label_id: labelId,
			query: {
				type: 'or',
				predicates: [
					{
						type: 'or',
						predicates: [
							{ type: 'id', id: listAId },
							{ type: 'id', id: listBId }
						]
					},
					{ type: 'id', id: listCId }
				]
			}
		},
		creator: localId
	};
	const fields = firestoreValue(action).mapValue.fields;
	fields.timestamp = { timestampValue: new Date().toISOString() };
	const response = await request.patch(
		`${firestoreEmulatorOrigin}/v1/projects/${emulatorProjectId}/databases/(default)/documents/lists/${labelId}/actions/${crypto.randomUUID()}`,
		{
			headers: { Authorization: `Bearer ${idToken}` },
			data: { fields }
		}
	);
	expect(response.ok()).toBe(true);
}

function nestedListRowsUnderLabel(page: import('@playwright/test').Page, labelName: string) {
	return drawerTopLevelItem(page, labelName).locator('.nested-list-item');
}

function nestedExpressionGroupsUnderLabel(
	page: import('@playwright/test').Page,
	labelName: string
) {
	return drawerTopLevelItem(page, labelName).locator('.nested-query-expression');
}

async function nestedListOrder(page: import('@playwright/test').Page, labelName: string) {
	return nestedListRowsUnderLabel(page, labelName).evaluateAll((rows) =>
		rows.map((row) => row.textContent?.trim() || '')
	);
}

async function dragNestedListBefore(
	page: import('@playwright/test').Page,
	labelName: string,
	listName: string,
	beforeListName: string
) {
	const groups = nestedExpressionGroupsUnderLabel(page, labelName);
	const source = groups.filter({ has: page.getByText(listName, { exact: true }) });
	const destination = groups.filter({ has: page.getByText(beforeListName, { exact: true }) });
	const sourceBox = await source.getByText(listName, { exact: true }).boundingBox();
	const destinationBox = await destination.boundingBox();
	if (!sourceBox || !destinationBox) {
		throw new Error('Cannot reorder nested lists without visible source and destination rows.');
	}
	const startX = sourceBox.x + sourceBox.width / 2;
	const startY = sourceBox.y + sourceBox.height / 2;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	await page.mouse.move(startX + 12, startY, { steps: 2 });
	await expect(source).toHaveAttribute('id', 'grabbed', { timeout: 1500 });
	await page.mouse.move(startX, destinationBox.y + destinationBox.height / 2, { steps: 10 });
	await expect(source).toHaveAttribute('id', 'grabbed');
	await expect(source).toHaveCSS('opacity', '0');
	await page.mouse.up();
}

test('create a label containing a list', async ({ page, request }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata(
		'Labels',
		'Verify that a user can create a label from the list edit dialog and see list tasks through that label.'
	);

	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
	await openDrawerIfNeeded(page);

	const listName = 'Label Source List';
	await page.getByLabel('New list').fill(listName);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/lists\?listId=/);
	await expect(page.getByRole('banner').getByText(listName)).toBeVisible();

	await helper.step('source_list_created', {
		description: 'User has created a source list.',
		verifications: [
			{
				spec: 'Source list is visible',
				check: async () => expect(page.getByRole('banner').getByText(listName)).toBeVisible()
			}
		]
	});

	await openCurrentListEditDialog(page, listName);

	const labelName = 'Important Label';
	await page.getByRole('button', { name: '+ Create label', exact: true }).click();
	await helper.step('label_creation_ui_available', {
		description: 'Labels has inline creation and its own Save action.',
		verifications: [
			{
				spec: 'A blank new label cannot be saved',
				check: async () => {
					await expect(page.getByLabel('New label', { exact: true })).toBeVisible();
					await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
				}
			}
		]
	});
	await page.getByLabel('New label', { exact: true }).fill(labelName);
	await saveCurrentListEditDialog(page);

	await helper.step('label_created', {
		description: 'User created a label containing the current list.',
		verifications: [
			{
				spec: 'Label appears in the sidebar',
				check: async () => {
					await openDrawerIfNeeded(page);
					await expect(page.locator('.mdc-drawer').getByText(labelName)).toBeVisible({
						timeout: 10000
					});
				}
			}
		]
	});

	await page.goto('/profile');
	await openDrawerIfNeeded(page);
	await helper.step('closed_label_has_no_pin_control', {
		description: 'An unpinned label is closed away from its label or child-list route.',
		verifications: [
			{
				spec: 'Nested source list is hidden',
				check: async () => expectNestedListHiddenUnderLabel(page, labelName, listName)
			},
			{
				spec: 'Closed label has no pin control',
				check: async () =>
					expect(page.getByRole('button', { name: `Pin label ${labelName}` })).toHaveCount(0)
			}
		]
	});

	await startSidebarAnimationCapture(page);
	await clickDrawerLabel(page, labelName);
	await expect(page).toHaveURL(/labels\?labelId=/);
	await expectOneNestedContentsAnimation(page);
	const labelId = new URL(page.url()).searchParams.get('labelId');
	if (!labelId) {
		throw new Error('Label route did not include labelId');
	}
	await helper.step('label_click_selects_and_expands', {
		description: 'One label-row click selects the label view and expands its sidebar folder.',
		verifications: [
			{
				spec: 'URL is the label route',
				check: async () => expect(page).toHaveURL(/labels\?labelId=/)
			},
			{
				spec: 'Mobile drawer stays open after selecting the label',
				check: async () => expectMobileDrawerOpen(page)
			},
			{
				spec: 'Source list group name is visible',
				check: async () =>
					expect(page.getByRole('button', { name: `Hide ${listName}` })).toBeVisible({
						timeout: 15000
					})
			}
		]
	});

	await openDrawerIfNeeded(page);
	let selectedLabelPinX: number | undefined;
	await helper.step('selected_label_is_open_but_unpinned', {
		description: 'The selected label is expanded without being pinned.',
		verifications: [
			{
				spec: 'Source list appears nested under the selected label',
				check: async () => expectNestedListVisibleUnderLabel(page, labelName, listName)
			},
			{
				spec: 'Nested list uses the new assets without excessive indentation',
				check: async () => expectNestedListSnugUnderLabel(page, labelName, listName)
			},
			{
				spec: 'Open label offers a separate Pin action',
				check: async () =>
					expect(page.getByRole('button', { name: `Pin label ${labelName}` })).toBeVisible()
			},
			{
				spec: 'Edit appears to the left without moving the Pin action',
				check: async () => {
					const editX = await labelActionX(page, labelName, 'Edit list');
					selectedLabelPinX = await labelActionX(page, labelName, `Pin label ${labelName}`);
					expect(editX).toBeLessThan(selectedLabelPinX);
				}
			}
		]
	});

	const labelRoute = page.url();
	await clickDrawerLabel(page, labelName);
	await expect(page).toHaveURL(labelRoute);
	await expectNestedListHiddenUnderLabel(page, labelName, listName);
	await expect(
		drawerTopLevelItem(page, labelName).locator('.mdc-deprecated-list-item').first()
	).toHaveAttribute('aria-expanded', 'false');
	await clickDrawerLabel(page, labelName);
	await expect(page).toHaveURL(labelRoute);
	await expectNestedListVisibleUnderLabel(page, labelName, listName);

	await page.getByRole('button', { name: `Pin label ${labelName}` }).click();
	await expectPersistedGlobalAction(request, 'pin_label', labelId);
	await helper.step('label_pinned_explicitly', {
		description: 'The user explicitly pins the already-open label without navigating.',
		verifications: [
			{
				spec: 'Label route is unchanged',
				check: async () => expect(page).toHaveURL(labelRoute)
			},
			{
				spec: 'Pin control changes to Unpin',
				check: async () =>
					expect(page.getByRole('button', { name: `Unpin label ${labelName}` })).toBeVisible()
			}
		]
	});

	await page.reload();
	await page.goto('/profile');
	await openDrawerIfNeeded(page);
	await helper.step('pinned_label_persists', {
		description: 'The explicit pin survives reload and unrelated navigation.',
		verifications: [
			{
				spec: 'Pinned label remains expanded on Profile',
				check: async () => expectNestedListVisibleUnderLabel(page, labelName, listName)
			},
			{
				spec: 'Persisted label remains pinned',
				check: async () =>
					expect(page.getByRole('button', { name: `Unpin label ${labelName}` })).toBeVisible()
			},
			{
				spec: 'Pin position is stable when the Edit action disappears',
				check: async () => {
					const persistedPinX = await labelActionX(page, labelName, `Unpin label ${labelName}`);
					expect(persistedPinX).toBe(selectedLabelPinX);
				}
			}
		]
	});

	await clickDrawerLabel(page, labelName);
	await expect(page).toHaveURL(labelRoute);
	await expectNestedListHiddenUnderLabel(page, labelName, listName);
	await clickDrawerLabel(page, labelName);
	await expect(page).toHaveURL(labelRoute);
	await expectNestedListVisibleUnderLabel(page, labelName, listName);
	await page.goto('/profile');
	await openDrawerIfNeeded(page);

	const profileRoute = page.url();
	await startSidebarAnimationCapture(page);
	await page.getByRole('button', { name: `Unpin label ${labelName}` }).click();
	await expectPersistedGlobalAction(request, 'unpin_label', labelId);
	await expectOneNestedContentsAnimation(page);
	await helper.step('unpin_collapses_pinned_only_label', {
		description:
			'Unpinning on an unrelated route collapses a label that was open only because it was pinned.',
		verifications: [
			{
				spec: 'Current route is unchanged',
				check: async () => expect(page).toHaveURL(profileRoute)
			},
			{
				spec: 'Nested source list is no longer shown',
				check: async () => expectNestedListHiddenUnderLabel(page, labelName, listName)
			},
			{
				spec: 'Collapsed label has no pin control',
				check: async () =>
					expect(page.getByRole('button', { name: `Pin label ${labelName}` })).toHaveCount(0)
			}
		]
	});

	await page
		.locator('.mdc-drawer .mdc-deprecated-list-item')
		.filter({ has: page.getByText('Search', { exact: true }) })
		.click();
	await expect(page).toHaveURL(/\/search$/);
	await openDrawerIfNeeded(page);
	await helper.step('unpinned_label_stays_closed_after_navigation', {
		description: 'Subsequent navigation continues to derive the unpinned label as closed.',
		verifications: [
			{
				spec: 'Nested source list is no longer shown',
				check: async () => expectNestedListHiddenUnderLabel(page, labelName, listName)
			},
			{
				spec: 'Closed label again has no pin control',
				check: async () =>
					expect(page.getByRole('button', { name: `Pin label ${labelName}` })).toHaveCount(0)
			}
		]
	});
	await page.reload();
	await openDrawerIfNeeded(page);
	await expectNestedListHiddenUnderLabel(page, labelName, listName);

	await clickDrawerLabel(page, labelName);
	await expect(page).toHaveURL(new RegExp(`labels\\?labelId=${labelId}`));
	await openDrawerIfNeeded(page);
	await openNestedListFromActiveLabel(page, listName);
	await helper.step('nested_navigation_records_via', {
		description: 'Opening a nested list records the parent label explicitly in the URL.',
		verifications: [
			{
				spec: 'List URL includes the parent label as via',
				check: async () => expect(new URL(page.url()).searchParams.get('via')).toBe(labelId)
			}
		]
	});

	await openCurrentListEditDialog(page, listName);
	await expect(page.getByLabel(`Include in ${labelName}`)).toBeChecked();
	await page.getByLabel(`Include in ${labelName}`).click();

	await helper.step('label_removal_draft_cancelled', {
		description: 'User can draft removing the current list from the label and cancel it.',
		verifications: [
			{
				spec: 'Label checkbox stays unchecked while the dialog is open',
				check: async () => expect(page.getByLabel(`Include in ${labelName}`)).not.toBeChecked()
			}
		]
	});

	await page.getByRole('button', { name: '‹ Details', exact: true }).click();
	await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
	await closeSettings(page);
	await openDrawerIfNeeded(page);
	await clickDrawerLabel(page, labelName);
	await expectNestedListHiddenUnderLabel(page, labelName, listName);
	await clickDrawerLabel(page, labelName);

	await helper.step('label_unchanged_after_cancel', {
		description: 'User cancelled the draft removal and the label still contains the source list.',
		verifications: [
			{ spec: 'URL is the label route', check: async () => expect(page).toHaveURL(/labels/) },
			{
				spec: 'Source list group is still visible',
				check: async () =>
					expect(page.getByRole('button', { name: `Hide ${listName}` })).toBeVisible()
			}
		]
	});

	await openNestedListFromActiveLabel(page, listName);
	await openCurrentListEditDialog(page, listName);
	await expect(page.getByLabel(`Include in ${labelName}`)).toBeChecked();
	await page.getByLabel(`Include in ${labelName}`).click();

	await helper.step('label_removed_from_list', {
		description: 'User removed the current list from the label.',
		verifications: [
			{
				spec: 'Label checkbox stays unchecked',
				check: async () => expect(page.getByLabel(`Include in ${labelName}`)).not.toBeChecked()
			}
		]
	});

	await saveCurrentListEditDialog(page);
	await openDrawerIfNeeded(page);
	await clickDrawerLabel(page, labelName);

	await helper.step('label_empty_after_removal', {
		description: 'User opened the label and no longer sees the removed list.',
		verifications: [
			{ spec: 'URL is the label route', check: async () => expect(page).toHaveURL(/labels/) },
			{
				spec: 'Removed source list group is absent',
				check: async () =>
					expect(page.getByRole('button', { name: `Hide ${listName}` })).toHaveCount(0)
			}
		]
	});

	await helper.generateDocs();
});

// Open settings as soon as each list appears, without waiting for its action-log
// listener. This also guards against publishing a list before editor setup finishes.
test('active list expands every containing label', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
	await openDrawerIfNeeded(page);

	const listA = 'Overlap List A';
	const listB = 'Overlap List B';
	const labelA = 'Label A';
	const labelB = 'Label B';
	const labelAB = 'Label AB';

	await page.getByLabel('New list').fill(listA);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('banner').getByText(listA)).toBeVisible({ timeout: 10000 });
	const listAId = new URL(page.url()).searchParams.get('listId');
	if (!listAId) {
		throw new Error('List A route did not include listId');
	}
	await openCurrentListEditDialog(page, listA);
	await createDraftLabel(page, labelA);
	await createDraftLabel(page, labelAB);
	await saveCurrentListEditDialog(page);
	await openDrawerIfNeeded(page);
	await expect(drawerTopLevelItem(page, labelA)).toBeVisible({ timeout: 10000 });
	await expect(drawerTopLevelItem(page, labelAB)).toBeVisible({ timeout: 10000 });
	const labelABId = await drawerTopLevelItem(page, labelAB).getAttribute('data-id');
	if (!labelABId) {
		throw new Error('Label AB sidebar item did not include data-id');
	}

	await openDrawerIfNeeded(page);
	await page.getByLabel('New list').fill(listB);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('banner').getByText(listB)).toBeVisible({ timeout: 10000 });
	await openCurrentListEditDialog(page, listB);
	await expect(page.getByLabel(`Include in ${labelAB}`)).toBeVisible({ timeout: 10000 });
	await createDraftLabel(page, labelB);
	await toggleDraftLabelMembership(page, labelAB, true);
	await saveCurrentListEditDialog(page);

	await openDrawerIfNeeded(page);
	await expectNestedListVisibleUnderLabel(page, labelB, listB);
	await expectNestedListVisibleUnderLabel(page, labelAB, listB);
	await expectNestedListHiddenUnderLabel(page, labelA, listA);

	await drawerTopLevelItem(page, labelAB)
		.locator('.nested-list-item')
		.filter({ has: page.getByText(listA, { exact: true }) })
		.locator('.mdc-deprecated-list-item')
		.click();
	await expect(page.getByRole('banner').getByText(listA)).toBeVisible({ timeout: 10000 });
	await expect(new URL(page.url()).searchParams.get('via')).toBe(labelABId);
	await openDrawerIfNeeded(page);
	await expectNestedListVisibleUnderLabel(page, labelAB, listA);
	await expectNestedListHiddenUnderLabel(page, labelA, listA);
	await expectNestedListHiddenUnderLabel(page, labelB, listB);

	await page.goto(`/lists?listId=${encodeURIComponent(listAId)}`);
	await openDrawerIfNeeded(page);
	await expectNestedListVisibleUnderLabel(page, labelA, listA);
	await expectNestedListVisibleUnderLabel(page, labelAB, listA);
	await expectNestedListHiddenUnderLabel(page, labelB, listB);
});

test('query expressions can be reordered inside a label', async ({ page, request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Desktop-only drag regression coverage.');

	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page).toHaveURL(/\/profile/, { timeout: 10000 });
	await openDrawerIfNeeded(page);

	const listA = 'Ordered List A';
	const listB = 'Ordered List B';
	const labelName = 'Ordered Label';
	await page.getByLabel('New list').fill(listA);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('banner').getByText(listA)).toBeVisible({ timeout: 10000 });
	const listAId = new URL(page.url()).searchParams.get('listId');
	if (!listAId) throw new Error('Ordered List A route did not include listId');
	await openCurrentListEditDialog(page, listA);
	await createDraftLabel(page, labelName);
	await saveCurrentListEditDialog(page);

	await openDrawerIfNeeded(page);
	const labelId = await drawerTopLevelItem(page, labelName).getAttribute('data-id');
	if (!labelId) {
		throw new Error('Ordered Label sidebar item did not include data-id');
	}
	await page.getByLabel('New list').fill(listB);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('banner').getByText(listB)).toBeVisible({ timeout: 10000 });
	const listBId = new URL(page.url()).searchParams.get('listId');
	if (!listBId) throw new Error('Ordered List B route did not include listId');
	await openCurrentListEditDialog(page, listB);
	await toggleDraftLabelMembership(page, labelName, true);
	await saveCurrentListEditDialog(page);

	await openDrawerIfNeeded(page);
	const listC = 'Ordered List C';
	await page.getByLabel('New list').fill(listC);
	await page.keyboard.press('Enter');
	await expect(page.getByRole('banner').getByText(listC)).toBeVisible({ timeout: 10000 });
	const listCId = new URL(page.url()).searchParams.get('listId');
	if (!listCId) throw new Error('Ordered List C route did not include listId');

	await setNestedLabelQuery(request, labelId, listAId, listBId, listCId);
	await openDrawerIfNeeded(page);
	await clickDrawerLabel(page, labelName);
	await expect.poll(() => nestedListOrder(page, labelName)).toEqual([listA, listB, listC]);
	await expect(nestedExpressionGroupsUnderLabel(page, labelName)).toHaveCount(2);
	await page.waitForTimeout(650);
	await dragNestedListBefore(page, labelName, listC, listA);
	await expect.poll(() => nestedListOrder(page, labelName)).toEqual([listC, listA, listB]);

	await expectPersistedLabelOrder(request, labelId, [[listCId], [listAId, listBId]]);
	await page.reload();
	await openDrawerIfNeeded(page);
	await expect
		.poll(() => nestedListOrder(page, labelName), { timeout: 15000 })
		.toEqual([listC, listA, listB]);
});
