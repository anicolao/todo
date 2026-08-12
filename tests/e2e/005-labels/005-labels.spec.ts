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
	const newListInput = page.getByLabel('New list');
	const drawer = page.locator('.mdc-drawer');
	const drawerIsModal = await drawer.evaluate((element) =>
		element.classList.contains('mdc-drawer--modal')
	);
	const drawerBox = await drawer.boundingBox();
	const drawerIsOpen = !drawerIsModal || (drawerBox !== null && drawerBox.x >= -1);
	if (!drawerIsOpen) {
		const menuButton = page.locator('button.material-icons:has-text("menu")');
		if (await menuButton.isVisible()) {
			await menuButton.click();
		}
		await expect(drawer).toHaveClass(/mdc-drawer--open/, { timeout: 10000 });
		await expect
			.poll(async () => {
				const box = await drawer.boundingBox();
				return box ? Math.round(box.x) : -999;
			})
			.toBeGreaterThanOrEqual(0);
		await expect(newListInput).toBeVisible({ timeout: 10000 });
	}
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
	await expect(page.getByText('Edit List')).toBeVisible({ timeout: 10000 });
}

async function saveCurrentListEditDialog(page: import('@playwright/test').Page) {
	await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.getByText('Edit List', { exact: true })).toBeHidden({ timeout: 20000 });
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
	const labelsEditor = page.locator('.labels-editor').filter({
		has: page.getByLabel('New label')
	});
	await expect(labelsEditor).toBeVisible({ timeout: 10000 });
	await labelsEditor.getByLabel('New label').fill(labelName);
	await expect(labelsEditor.getByRole('button', { name: 'Create label' })).toBeEnabled();
	await labelsEditor.getByRole('button', { name: 'Create label' }).dispatchEvent('click');
	await expect(labelsEditor.getByLabel('New label')).toHaveValue('');
}

async function toggleDraftLabelMembership(
	page: import('@playwright/test').Page,
	labelName: string,
	checked: boolean
) {
	const labelsEditor = page.locator('.labels-editor').filter({
		has: page.getByLabel('New label')
	});
	const checkbox = labelsEditor.getByLabel(`Include in ${labelName}`);
	await expect(checkbox).toBeVisible({ timeout: 10000 });
	if ((await checkbox.isChecked()) !== checked) {
		await checkbox.dispatchEvent('click');
	}
	await expect(checkbox).toBeChecked({ checked });
}

async function expectMobileDrawerClosed(page: import('@playwright/test').Page) {
	const drawer = page.locator('.mdc-drawer');
	const isModal = await drawer.evaluate((element) =>
		element.classList.contains('mdc-drawer--modal')
	);
	if (!isModal) {
		return;
	}
	await expect
		.poll(async () => {
			const box = await drawer.boundingBox();
			return box ? Math.round(box.x) : 0;
		})
		.toBeLessThan(0);
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
	await helper.step('label_creation_ui_available', {
		description: 'User can create a label from the list edit dialog.',
		verifications: [
			{
				spec: 'Labels section is visible',
				check: async () => expect(page.getByText('Labels', { exact: true })).toBeVisible()
			},
			{
				spec: 'New label field is visible',
				check: async () => expect(page.getByLabel('New label')).toBeVisible()
			},
			{
				spec: 'Create label button is disabled until a name is entered',
				check: async () => expect(page.getByRole('button', { name: 'Create label' })).toBeDisabled()
			}
		]
	});

	await page.getByLabel('New label').fill(labelName);
	await expect(page.getByRole('button', { name: 'Create label' })).toBeEnabled();
	await page.getByRole('button', { name: 'Create label' }).click();
	await expect(page.getByLabel('New label')).toHaveValue('');
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

	await clickDrawerLabel(page, labelName);
	await expect(page).toHaveURL(/labels\?labelId=/);
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
				spec: 'Mobile drawer is dismissed after selecting the label',
				check: async () => expectMobileDrawerClosed(page)
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
	await helper.step('selected_label_is_open_but_unpinned', {
		description: 'The selected label is expanded without being pinned.',
		verifications: [
			{
				spec: 'Source list appears nested under the selected label',
				check: async () => expectNestedListVisibleUnderLabel(page, labelName, listName)
			},
			{
				spec: 'Open label offers a separate Pin action',
				check: async () =>
					expect(page.getByRole('button', { name: `Pin label ${labelName}` })).toBeVisible()
			}
		]
	});

	const labelRoute = page.url();
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
			}
		]
	});

	const profileRoute = page.url();
	await page.getByRole('button', { name: `Unpin label ${labelName}` }).click();
	await expectPersistedGlobalAction(request, 'unpin_label', labelId);
	await helper.step('unpin_keeps_label_open', {
		description: 'Unpinning changes only persistence and does not collapse the label.',
		verifications: [
			{
				spec: 'Current route is unchanged',
				check: async () => expect(page).toHaveURL(profileRoute)
			},
			{
				spec: 'Label remains expanded immediately after unpinning',
				check: async () => expectNestedListVisibleUnderLabel(page, labelName, listName)
			},
			{
				spec: 'Control changes back to Pin',
				check: async () =>
					expect(page.getByRole('button', { name: `Pin label ${labelName}` })).toBeVisible()
			}
		]
	});

	await page
		.locator('.mdc-drawer .mdc-deprecated-list-item')
		.filter({ has: page.getByText('Search', { exact: true }) })
		.click();
	await expect(page).toHaveURL(/\/search$/);
	await openDrawerIfNeeded(page);
	await helper.step('unpinned_label_closes_on_next_navigation', {
		description: 'The next URL navigation recalculates expansion and closes the unpinned label.',
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

	await page.getByRole('button', { name: 'Cancel' }).click();
	await openDrawerIfNeeded(page);
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
