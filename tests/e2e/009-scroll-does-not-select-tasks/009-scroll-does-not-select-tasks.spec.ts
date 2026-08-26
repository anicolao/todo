import { expect, type Locator, type Page, test } from '@playwright/test';
import { resetEmulators } from '../helpers/emulator';

test.beforeEach(async ({ request }, testInfo) => {
	test.skip(testInfo.project.name !== 'Desktop Chrome', 'Pointer-scroll regression coverage.');
	await resetEmulators(request);
});

async function signIn(page: Page) {
	await page.goto('/');
	await page.getByRole('button', { name: 'Sign In', exact: true }).click();
	await expect(page.locator('.drawer-container')).toBeVisible({ timeout: 15000 });
}

async function createList(page: Page, listName: string) {
	const newList = page.getByLabel('New list');
	if (!(await newList.isVisible())) {
		await page.locator('button.material-icons').filter({ hasText: 'menu' }).click();
	}
	await expect(newList).toBeVisible();
	await newList.fill(listName);
	await newList.press('Enter');
	await expect(page).toHaveURL(/lists\/?\?listId=/, { timeout: 10000 });
	const scrim = page.locator('.mdc-drawer-scrim').first();
	if (await scrim.isVisible()) {
		await page
			.locator('.mdc-drawer .listContainer .item:not(#ghost)')
			.filter({ hasText: listName })
			.last()
			.click();
		await expect(scrim).not.toBeVisible();
	}
	await expect(page.getByLabel('New task')).toBeVisible();
}

async function createTasks(page: Page, names: string[]) {
	const newTask = page.getByLabel('New task');
	let created = 0;
	for (const name of [...names].reverse()) {
		await newTask.fill(name);
		await newTask.press('Enter');
		created++;
		await expect
			.poll(async () => taskInputs(page).evaluateAll((inputs) => inputs.length))
			.toBeGreaterThanOrEqual(created);
		await expect(newTask).toHaveValue('');
	}
	await expect(taskInputs(page)).toHaveCount(names.length, { timeout: 15000 });
}

function taskInputs(page: Page) {
	return page.locator('.app-content .listContainer .item:not(#ghost) input.description');
}

type ObservedInput = {
	value: string;
	rowId: string;
	isTaskInput: boolean;
	start: number | null;
	end: number | null;
};

type DragObservation = {
	source: string;
	documentSelection: string;
	documentSelectionCollapsed: boolean;
	activeInput: ObservedInput | null;
	selectedInputs: ObservedInput[];
};

async function installDragObserver(page: Page) {
	await page.addInitScript(() => {
		type InputState = {
			value: string;
			rowId: string;
			isTaskInput: boolean;
			start: number | null;
			end: number | null;
		};
		type Snapshot = {
			source: string;
			documentSelection: string;
			documentSelectionCollapsed: boolean;
			activeInput: InputState | null;
			selectedInputs: InputState[];
		};
		type ObservationState = {
			recording: boolean;
			lastSignature: string;
			snapshots: Snapshot[];
		};

		const observationWindow = window as Window & { __dragObservation?: ObservationState };
		const state: ObservationState = {
			recording: false,
			lastSignature: '',
			snapshots: []
		};
		observationWindow.__dragObservation = state;

		const inputState = (input: HTMLInputElement): InputState => ({
			value: input.value,
			rowId: input.closest('.item')?.id ?? '',
			isTaskInput: input.matches('input.description'),
			start: input.selectionStart,
			end: input.selectionEnd
		});
		const snapshot = (source: string) => {
			if (!state.recording) return;
			const selection = document.getSelection();
			const activeInput =
				document.activeElement instanceof HTMLInputElement
					? inputState(document.activeElement)
					: null;
			const selectedInputs = Array.from(
				document.querySelectorAll<HTMLInputElement>('input.description')
			)
				.filter((input) => input.selectionStart !== input.selectionEnd)
				.map(inputState);
			const next: Snapshot = {
				source,
				documentSelection: selection?.toString() ?? '',
				documentSelectionCollapsed: selection?.isCollapsed ?? true,
				activeInput,
				selectedInputs
			};
			const signature = JSON.stringify({ ...next, source: undefined });
			if (signature !== state.lastSignature) {
				state.lastSignature = signature;
				state.snapshots.push(next);
			}
		};

		document.addEventListener('focusin', () => snapshot('focusin'), true);
		document.addEventListener('selectionchange', () => snapshot('selectionchange'), true);
		const sampleFrame = () => {
			snapshot('animationframe');
			requestAnimationFrame(sampleFrame);
		};
		requestAnimationFrame(sampleFrame);
	});
}

async function beginDragObservation(page: Page) {
	await page.evaluate(() => {
		const state = (
			window as Window & {
				__dragObservation?: {
					recording: boolean;
					lastSignature: string;
					snapshots: unknown[];
				};
			}
		).__dragObservation;
		if (!state) throw new Error('Drag observer was not installed.');
		state.snapshots = [];
		state.lastSignature = '';
		state.recording = true;
	});
}

async function finishDragObservation(page: Page) {
	return page.evaluate(() => {
		const state = (
			window as Window & {
				__dragObservation?: { recording: boolean; snapshots: unknown[] };
			}
		).__dragObservation;
		if (!state) throw new Error('Drag observer was not installed.');
		state.recording = false;
		return state.snapshots;
	}) as Promise<DragObservation[]>;
}

async function movePointer(
	page: Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
	steps: number
) {
	for (let step = 1; step <= steps; step++) {
		const progress = step / steps;
		await page.mouse.move(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
		await page.waitForTimeout(8);
	}
}

async function observedReverseDrag(page: Page, input: Locator) {
	await input.scrollIntoViewIfNeeded();
	const draggedValue = await input.inputValue();
	const row = input.locator('xpath=ancestor::div[contains(@class, "item")][1]');
	const inputBox = await input.boundingBox();
	const scrollerBox = await page.locator('.backdrop').boundingBox();
	if (!inputBox || !scrollerBox) throw new Error('The drag elements must have bounding boxes.');

	const start = {
		x: inputBox.x + Math.min(270, inputBox.width / 2),
		y: inputBox.y + inputBox.height / 2
	};
	const down = {
		x: start.x - 18,
		y: Math.min(start.y + 170, scrollerBox.y + scrollerBox.height - 24)
	};
	const up = {
		x: start.x + 14,
		y: Math.max(start.y - 170, scrollerBox.y + 24)
	};

	await page.mouse.move(start.x, start.y);
	await beginDragObservation(page);
	await page.mouse.down();
	try {
		await movePointer(page, start, { x: start.x, y: start.y + 12 }, 3);
		await expect(row).toHaveAttribute('id', 'grabbed', { timeout: 1500 });
		await movePointer(page, { x: start.x, y: start.y + 12 }, down, 24);
		await movePointer(page, down, up, 48);
		await page.waitForTimeout(500);
		return { draggedValue, observations: await finishDragObservation(page) };
	} finally {
		await page.mouse.up();
	}
}

async function selectedText(page: Page) {
	return page.evaluate(() => {
		const documentSelection = document.getSelection();
		return {
			documentSelection: documentSelection?.toString() ?? '',
			documentSelectionCollapsed: documentSelection?.isCollapsed ?? true,
			selectedInputs: Array.from(document.querySelectorAll<HTMLInputElement>('input.description'))
				.filter(
					(input) =>
						input.selectionStart !== null &&
						input.selectionEnd !== null &&
						input.selectionStart !== input.selectionEnd
				)
				.map((input) => ({
					value: input.value,
					start: input.selectionStart,
					end: input.selectionEnd
				}))
		};
	});
}

async function dragDownThenReverseUp(page: Page, input: Locator) {
	await input.scrollIntoViewIfNeeded();
	const row = input.locator('xpath=ancestor::div[contains(@class, "item")][1]');
	const inputBox = await input.boundingBox();
	if (!inputBox) {
		throw new Error('The task input must have a bounding box.');
	}

	// Start over the rendered text. A perfectly vertical synthetic drag at the
	// centre of this wide input repeatedly resolves to the same caret position
	// and masks Chrome's native selection gesture.
	const x = inputBox.x + Math.min(270, inputBox.width / 2);
	const startY = inputBox.y + inputBox.height / 2;

	await page.mouse.move(x, startY);
	await page.mouse.down();
	try {
		await page.mouse.move(x, startY + 12, { steps: 2 });
		await expect(row).toHaveAttribute('id', 'grabbed', { timeout: 1500 });

		// Move down first, then reverse without releasing. The slight sideways
		// drift matches a real mouse gesture and reveals the
		// text-selection state Chrome started on pointerdown.
		await page.mouse.move(x - 18, startY + 180, { steps: 30 });
		await page.mouse.move(x - 18, startY + 70, { steps: 30 });

		return await selectedText(page);
	} finally {
		await page.mouse.up();
	}
}

/**
 * Regression for reversing direction while dragging a task.
 *
 * Dragging downward works normally. Without releasing the pointer, reversing
 * upward must remain a reorder drag and must not begin a browser text selection.
 */
test('reversing a task drag does not select task text', async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 500 });
	await signIn(page);
	await createList(page, 'Scroll selection regression');

	const taskNames = Array.from(
		{ length: 12 },
		(_, index) => `Task ${String(index + 1).padStart(2, '0')} has selectable text`
	);
	await createTasks(page, taskNames);

	const draggedInput = taskInputs(page).filter({ visible: true }).nth(1);
	const selection = await dragDownThenReverseUp(page, draggedInput);

	expect(
		selection.documentSelectionCollapsed,
		'reversing a drag must not create a browser selection range'
	).toBe(true);
	expect(selection.documentSelection, 'reversing a drag must not select document text').toBe('');
	expect(selection.selectedInputs, 'reversing a drag must not select task input text').toEqual([]);
});

async function observeUpwardReversal(page: Page, listName: string) {
	await page.setViewportSize({ width: 1000, height: 500 });
	await installDragObserver(page);
	await signIn(page);
	await createList(page, listName);
	const taskNames = Array.from(
		{ length: 14 },
		(_, index) => `Observed Task ${String(index + 1).padStart(2, '0')} selectable text`
	);
	await createTasks(page, taskNames);

	const taskName = taskNames[3];
	const inputIndex = await taskInputs(page).evaluateAll(
		(inputs, value) => inputs.findIndex((input) => (input as HTMLInputElement).value === value),
		taskName
	);
	if (inputIndex < 0) throw new Error(`Could not find task input: ${taskName}`);
	return observedReverseDrag(page, taskInputs(page).nth(inputIndex));
}

test('an upward task drag never focuses a background task', async ({ page }) => {
	const { draggedValue, observations } = await observeUpwardReversal(
		page,
		'Reverse drag focus regression'
	);
	const backgroundFocus = observations.filter(
		({ activeInput }) =>
			activeInput &&
			activeInput.isTaskInput &&
			activeInput.rowId !== 'ghost' &&
			activeInput.value !== draggedValue
	);

	expect(backgroundFocus, 'no task other than the grabbed task may receive focus').toEqual([]);
});

test('an upward task drag never selects text in a background task', async ({ page }) => {
	const { draggedValue, observations } = await observeUpwardReversal(
		page,
		'Reverse drag input selection regression'
	);
	const backgroundSelections = observations.flatMap(({ selectedInputs }) =>
		selectedInputs.filter((input) => input.rowId !== 'ghost' && input.value !== draggedValue)
	);

	expect(backgroundSelections, 'no background task may acquire an input selection').toEqual([]);
});

test('an upward task drag never flashes a document selection', async ({ page }) => {
	const { observations } = await observeUpwardReversal(
		page,
		'Reverse drag selection flash regression'
	);
	const selectionFlashes = observations.filter(
		({ documentSelectionCollapsed }) => !documentSelectionCollapsed
	);

	expect(selectionFlashes, 'the drag must never create even a transient document range').toEqual(
		[]
	);
});

test('clicking a task still enters edit mode and permits intentional text selection', async ({
	page
}) => {
	await page.setViewportSize({ width: 1000, height: 500 });
	await signIn(page);
	await createList(page, 'Task editing after drag prevention');
	await createTasks(page, ['Task text remains selectable while editing']);

	const input = taskInputs(page).first();
	const row = input.locator('xpath=ancestor::div[contains(@class, "item")][1]');
	const box = await input.boundingBox();
	if (!box) throw new Error('The task input must have a bounding box.');

	await page.mouse.click(box.x + 120, box.y + box.height / 2);
	await expect(input).toBeFocused();
	await page.waitForTimeout(950);

	await page.mouse.move(box.x + 40, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + 190, box.y + box.height / 2, { steps: 20 });
	await page.mouse.up();

	const selectedRange = await input.evaluate((element) => ({
		start: element.selectionStart,
		end: element.selectionEnd
	}));
	expect(selectedRange.end).not.toBe(selectedRange.start);
	await expect(row).not.toHaveAttribute('id', 'grabbed');
});

test('clicking a task places the caret under the pointer', async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 500 });
	await signIn(page);
	await createList(page, 'Task caret positioning');
	await createTasks(page, ['Click positions should place this caret precisely']);

	const input = taskInputs(page).first();
	const box = await input.boundingBox();
	if (!box) throw new Error('The task input must have a bounding box.');

	for (const x of [box.x + 8, box.x + 90, box.x + 230]) {
		const expectedOffset = await page.evaluate(
			({ x, y }) => document.caretPositionFromPoint(x, y)?.offset,
			{ x, y: box.y + box.height / 2 }
		);
		expect(expectedOffset).toBeDefined();

		await page.mouse.click(x, box.y + box.height / 2);
		await expect(input).toBeFocused();
		await expect
			.poll(() => input.evaluate((element) => element.selectionStart))
			.toBe(expectedOffset);
		await expect.poll(() => input.evaluate((element) => element.selectionEnd)).toBe(expectedOffset);
	}
});

test('double and triple clicking a task selects its word and full text', async ({ page }) => {
	await page.setViewportSize({ width: 1000, height: 500 });
	await signIn(page);
	await createList(page, 'Task multi-click selection');
	await createTasks(page, ['alpha beta gamma']);

	const input = taskInputs(page).first();
	const box = await input.boundingBox();
	if (!box) throw new Error('The task input must have a bounding box.');
	const y = box.y + box.height / 2;
	const betaX = await page.evaluate(
		({ left, right, y }) => {
			for (let x = left; x < right; x += 1) {
				const caret = document.caretPositionFromPoint(x, y);
				if (caret?.offset === 8) return x;
			}
			throw new Error('Could not find a point inside the second word.');
		},
		{ left: box.x, right: box.x + box.width, y }
	);

	await page.mouse.click(betaX, y, { clickCount: 2 });
	await expect(input).toBeFocused();
	await expect
		.poll(() =>
			input.evaluate((element) =>
				element.value.slice(element.selectionStart ?? 0, element.selectionEnd ?? 0)
			)
		)
		.toBe('beta');

	await page.mouse.click(betaX, y, { clickCount: 3 });
	await expect
		.poll(() =>
			input.evaluate((element) => ({
				start: element.selectionStart,
				end: element.selectionEnd
			}))
		)
		.toEqual({ start: 0, end: 'alpha beta gamma'.length });
});
