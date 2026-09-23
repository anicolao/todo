<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { RepeatType, type DueDate, type TodoItem } from './items';
	import {
		dateParts,
		formatDate,
		localDate,
		repeatSummary,
		upcomingDates,
		validInterval
	} from './recurrence';
	import DueDateEditor from './DueDateEditor.svelte';
	import RepeatEditor from './RepeatEditor.svelte';

	export let item: TodoItem | undefined;
	export let onSave: (description: string, dueDate: DueDate | undefined) => Promise<void>;
	export let onClose: () => void;
	const copy = <T,>(value: T): T =>
		value === undefined ? value : JSON.parse(JSON.stringify(value));
	const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
	let baseline = copy(item);
	let description = item?.description ?? '';
	let due = copy(item?.dueDate);
	let screen: 'details' | 'date' | 'repeat' = 'details';
	let dateDraft: DueDate | undefined;
	let dateSeed = dateParts(new Date());
	let repeatType = RepeatType.NONE;
	let every = '1';
	let setupRepeat = false;
	let confirmDiscard = false;
	let confirmRemove = false;
	let conflict = false;
	let saving = false;
	let error = '';
	let online = true;
	let dialog: HTMLDialogElement;
	let heading: HTMLHeadingElement;
	let body: HTMLDivElement;
	let dateButton: HTMLButtonElement;
	let repeatButton: HTMLButtonElement;
	let viewportHeight: number | undefined;
	let viewportTop = 0;
	let alive = true;
	$: dirty = description !== baseline?.description || !same(due, baseline?.dueDate);
	$: repeating = due?.repeats && due.repeats.type !== RepeatType.NONE;
	$: validRepeat =
		repeatType === RepeatType.NONE || repeatType === RepeatType.WEEKDAYS || validInterval(every);
	$: preview = due && repeating ? upcomingDates(due) : [];
	$: sync(item);

	function sync(latest: TodoItem | undefined) {
		if (!latest || !baseline || saving) return;
		const changedTitle = latest.description !== baseline.description;
		const changedDue = !same(latest.dueDate, baseline.dueDate);
		if (
			(changedTitle && description !== baseline.description) ||
			(changedDue && (!same(due, baseline.dueDate) || screen !== 'details'))
		) {
			conflict = true;
			return;
		}
		if (changedTitle) description = latest.description;
		if (changedDue) due = copy(latest.dueDate);
		baseline = copy(latest);
	}
	function resolveConflict(reload: boolean) {
		if (!item || !baseline) return;
		if (reload || description === baseline.description) description = item.description;
		if (reload || (same(due, baseline.dueDate) && screen === 'details')) due = copy(item.dueDate);
		baseline = copy(item);
		conflict = false;
		if (reload) {
			setupRepeat = false;
			show('details');
		}
	}
	async function show(next: typeof screen, focus?: 'date' | 'repeat') {
		screen = next;
		confirmRemove = false;
		await tick();
		body?.scrollTo(0, 0);
		if (focus === 'date') dateButton?.focus();
		else if (focus === 'repeat') repeatButton?.focus();
		else heading?.focus();
	}
	function openDate(forRepeat = false) {
		setupRepeat = forRepeat;
		dateDraft = copy(due) ?? dateParts(new Date());
		dateSeed = copy(dateDraft);
		show('date');
	}
	function openRepeat() {
		if (!due) {
			openDate(true);
			return;
		}
		setupRepeat = false;
		dateDraft = copy(due);
		startRepeat();
	}
	function startRepeat() {
		repeatType = dateDraft?.repeats?.type ?? RepeatType.NONE;
		every = String(dateDraft?.repeats?.every ?? 1);
		show('repeat');
	}
	function doneDate() {
		if (!dateDraft) return;
		if (setupRepeat) startRepeat();
		else {
			due = copy(dateDraft);
			show('details', 'date');
		}
	}
	function doneRepeat() {
		if (!dateDraft || !validRepeat) return;
		due = {
			...dateDraft,
			repeats: {
				type: repeatType,
				every:
					repeatType === RepeatType.NONE || repeatType === RepeatType.WEEKDAYS ? 1 : Number(every)
			}
		};
		setupRepeat = false;
		show('details', 'repeat');
	}
	function back() {
		if (saving) return;
		if (confirmDiscard) {
			confirmDiscard = false;
			return;
		}
		if (confirmRemove) {
			confirmRemove = false;
			return;
		}
		if (screen === 'repeat' && setupRepeat) {
			dateSeed = copy(dateDraft!);
			show('date');
		} else if (screen !== 'details') {
			const from = screen;
			setupRepeat = false;
			show('details', from);
		} else if (dirty) confirmDiscard = true;
		else onClose();
	}
	function removeDate() {
		due = undefined;
		setupRepeat = false;
		show('details', 'date');
	}
	async function save() {
		if (!item || !description.trim() || conflict || saving || !dirty) return;
		saving = true;
		error = '';
		try {
			await onSave(description, due);
			if (alive) onClose();
		} catch {
			if (alive) {
				error = 'Could not save changes. Your draft is still here. Try again.';
				saving = false;
			}
		}
	}
	function trapFocus(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const controls = [
			...dialog.querySelectorAll<HTMLElement>(
				'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
			)
		].filter((node) => node.getClientRects().length > 0);
		const first = controls[0];
		const last = controls[controls.length - 1];
		if (!first) {
			event.preventDefault();
			heading.focus();
			return;
		}
		if (
			event.shiftKey &&
			(document.activeElement === first || document.activeElement === heading)
		) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
	function autosize(node: HTMLTextAreaElement, _value: string) {
		if (CSS.supports('field-sizing', 'content')) {
			node.style.setProperty('field-sizing', 'content');
			return {};
		}
		const resize = () => {
			node.style.height = 'auto';
			node.style.height = `${Math.max(76, node.scrollHeight)}px`;
		};
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(node.parentElement!);
		window.addEventListener('resize', resize);
		return {
			update: resize,
			destroy: () => {
				observer.disconnect();
				window.removeEventListener('resize', resize);
			}
		};
	}
	beforeNavigate(({ cancel }) => {
		cancel();
		back();
	});
	onMount(() => {
		const opener = document.activeElement as HTMLElement;
		dialog.showModal();
		heading.focus();
		dialog.addEventListener('keydown', trapFocus);
		// A history entry makes system Back work even when the previous app
		// navigation used the same URL (for example closing the mobile drawer).
		const editorUrl = location.href;
		const editorHistory = { ...history.state, todoDetailsEditor: true };
		let ownsHistoryEntry = true;
		history.pushState(editorHistory, '', editorUrl);
		const systemBack = (event: PopStateEvent) => {
			event.stopImmediatePropagation();
			ownsHistoryEntry = false;
			if (screen !== 'details' || dirty || saving) {
				history.pushState(editorHistory, '', editorUrl);
				ownsHistoryEntry = true;
			}
			back();
		};
		window.addEventListener('popstate', systemBack, true);
		const updateViewport = () => {
			viewportHeight = window.visualViewport?.height;
			viewportTop = window.visualViewport?.offsetTop ?? 0;
		};
		const updateOnline = () => (online = navigator.onLine);
		updateViewport();
		updateOnline();
		window.visualViewport?.addEventListener('resize', updateViewport);
		window.visualViewport?.addEventListener('scroll', updateViewport);
		window.addEventListener('online', updateOnline);
		window.addEventListener('offline', updateOnline);
		return () => {
			alive = false;
			dialog.removeEventListener('keydown', trapFocus);
			window.removeEventListener('popstate', systemBack, true);
			if (ownsHistoryEntry && history.state?.todoDetailsEditor) history.back();
			window.visualViewport?.removeEventListener('resize', updateViewport);
			window.visualViewport?.removeEventListener('scroll', updateViewport);
			window.removeEventListener('online', updateOnline);
			window.removeEventListener('offline', updateOnline);
			dialog.close();
			opener?.focus();
		};
	});
</script>

<dialog
	bind:this={dialog}
	class="task-details"
	aria-labelledby="details-heading"
	on:cancel={(event) => {
		event.preventDefault();
		back();
	}}
	style:--viewport-height={viewportHeight ? `${viewportHeight}px` : '100dvh'}
	style:--viewport-top={`${viewportTop}px`}
>
	<div class="editor-shell">
		<header>
			<button disabled={saving} on:click={back}
				>{screen === 'details' ? 'Cancel' : '‹ Details'}</button
			>
			<h1 id="details-heading" tabindex="-1" bind:this={heading}>
				{screen === 'details' ? 'Task details' : screen === 'date' ? 'Due date' : 'Repeat'}
			</h1>
			{#if screen === 'details'}<button
					class="primary"
					on:click={save}
					disabled={!dirty || !description.trim() || !item || conflict || saving}
					>{saving ? 'Saving…' : error ? 'Retry' : 'Save'}</button
				>{:else}<span class="header-spacer"></span>{/if}
		</header>
		<div class="editor-body" bind:this={body}>
			{#if !item}<div class="notice" role="alert">
					This task is no longer available. Your changes cannot be saved.
				</div>{/if}
			{#if conflict}<div class="notice" role="alert">
					<p>This task changed elsewhere. Your edits are still here.</p>
					<button on:click={() => resolveConflict(true)}>Reload latest task</button><button
						on:click={() => resolveConflict(false)}>Keep my edits</button
					>
				</div>{/if}
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			{#if saving}<p role="status">
					{online
						? 'Saving your changes…'
						: 'Changes are queued on this device. Waiting for connection to finish saving.'}
				</p>{/if}
			{#if confirmDiscard}<section class="notice" aria-label="Discard changes">
					<h2>Discard changes?</h2>
					<p>Your edits have not been saved.</p>
					<button class="primary" on:click={() => (confirmDiscard = false)}>Keep editing</button
					><button on:click={onClose}>Discard changes</button>
				</section>{/if}
			{#if screen === 'details'}
				<label class="task-label" for="task-description">Task</label>
				<textarea
					id="task-description"
					use:autosize={description}
					bind:value={description}
					rows="2"
					disabled={saving}
					aria-invalid={!description.trim()}
					aria-describedby={!description.trim() ? 'task-error' : undefined}
				/>
				{#if !description.trim()}<p class="error" id="task-error">Enter a task description.</p>{/if}
				<h2 class="section-label">Schedule</h2>
				<div class="schedule">
					<button bind:this={dateButton} disabled={saving} on:click={() => openDate()}
						><span aria-hidden="true">▦</span><strong>Due date</strong><span class="value"
							>{due ? formatDate(due) : 'Add date'}</span
						><span aria-hidden="true">›</span></button
					>
					<button bind:this={repeatButton} disabled={saving} on:click={openRepeat}
						><span aria-hidden="true">↻</span><strong>Repeat</strong><span class="value"
							>{repeatSummary(due)}</span
						><span aria-hidden="true">›</span></button
					>
				</div>
				{#if repeating}
					<section class="summary" aria-label="Upcoming due dates">
						<h2 class="section-label">Upcoming due dates</h2>
						<ul>
							{#each preview as date}<li>
									{formatDate(date)}{#if localDate(date) < localDate(dateParts(new Date()))}<small>
											· Overdue</small
										>{/if}
								</li>{/each}
						</ul>
					</section>
					<p class="hint">Completing this task moves it to the next scheduled date.</p>
					{#if due && localDate(due) < localDate(dateParts(new Date()))}<p class="hint">
							Missed dates are skipped when you complete it.
						</p>{/if}
					{#if due && ((due.repeats?.type === RepeatType.MONTHLY && due.day > 28) || (due.repeats?.type === RepeatType.YEARLY && due.month === 2 && due.day === 29))}<p
							class="hint"
						>
							Shorter months can move this schedule into the following month. Check the upcoming
							dates.
						</p>{/if}
				{:else}<p class="hint">
						{due
							? 'Add a repeat schedule for recurring tasks.'
							: 'Choose Repeat to set a first due date and schedule.'}
					</p>{/if}
			{:else if screen === 'date'}
				<p class="hint">
					{setupRepeat
						? 'Choose a first due date to repeat this task.'
						: 'Choose the first due date.'}
				</p>
				<DueDateEditor
					value={dateSeed}
					onChange={(value) =>
						(dateDraft = value
							? { ...value, repeats: dateDraft?.repeats ?? due?.repeats }
							: undefined)}
				/>
				{#if dateDraft?.repeats && dateDraft.repeats.type !== RepeatType.NONE}<p aria-live="polite">
						{repeatSummary(dateDraft)}
					</p>{/if}
				{#if due}<button
						class="remove"
						on:click={() => {
							if (repeating) confirmRemove = true;
							else removeDate();
						}}>Remove due date</button
					>{/if}
				{#if confirmRemove}<section class="notice" aria-label="Remove schedule">
						<h2>Remove due date and repeat?</h2>
						<button on:click={() => (confirmRemove = false)}>Keep schedule</button><button
							on:click={removeDate}>Remove both</button
						>
					</section>{/if}
			{:else if dateDraft}
				<p class="hint task-context">{description}</p>
				<RepeatEditor date={dateDraft} bind:type={repeatType} bind:every />
			{/if}
		</div>
		{#if screen !== 'details'}<footer>
				<button
					class="primary"
					disabled={!item || conflict || (screen === 'date' ? !dateDraft : !validRepeat)}
					on:click={screen === 'date' ? doneDate : doneRepeat}>Done</button
				>
			</footer>{/if}
	</div>
</dialog>

<style>
	.task-details {
		--detail-bg: #faf8f2;
		--detail-card: #fff;
		--detail-tint: #f3eae4;
		--detail-accent: #94482f;
		--detail-muted: #665f5a;
		--detail-border: #d9d1ca;
		--detail-error: #a91c23;
		color: #302621;
		background: var(--detail-bg);
		border: 0;
		padding: 0;
		border-radius: 20px;
		width: min(520px, calc(100vw - 32px));
		max-width: none;
		max-height: none;
		height: min(850px, calc(var(--viewport-height) - 40px));
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 17px;
		box-shadow: 0 12px 60px #0004;
	}
	.task-details::backdrop {
		background: #21171080;
	}
	.editor-shell {
		height: 100%;
		box-sizing: border-box;
		padding-left: var(--safe-area-left);
		padding-right: var(--safe-area-right);
		display: flex;
		flex-direction: column;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: max(12px, var(--safe-area-top)) 12px 12px;
		flex-shrink: 0;
	}
	h1 {
		flex: 1;
		font-size: 1.05em;
		text-align: center;
		margin: 0;
		outline: none;
	}
	button,
	textarea {
		font: inherit;
		color: inherit;
	}
	button {
		cursor: pointer;
		border: 0;
		background: transparent;
		min-height: 48px;
		padding: 10px 12px;
		border-radius: 10px;
	}
	header button {
		color: var(--detail-accent);
		padding-inline: 8px;
	}
	button.primary {
		background: var(--detail-accent);
		color: #fff;
		font-weight: 600;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.header-spacer {
		width: 48px;
	}
	.editor-body {
		padding: 12px 16px 24px;
		overflow: auto;
		flex: 1;
		min-height: 0;
		overscroll-behavior: contain;
	}
	.task-label,
	.section-label {
		display: block;
		font-size: 0.8em;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-weight: 600;
		color: var(--detail-muted);
		margin: 12px 0;
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		min-height: 76px;
		padding: 16px;
		border: 1px solid var(--detail-border);
		border-radius: 12px;
		background: var(--detail-card);
		resize: vertical;
	}
	.schedule {
		background: var(--detail-card);
		border-radius: 14px;
		overflow: hidden;
	}
	.schedule button {
		width: 100%;
		display: grid;
		grid-template-columns: 24px auto minmax(0, 1fr) 12px;
		align-items: center;
		text-align: left;
		gap: 10px;
		padding: 16px 12px;
	}
	.schedule button + button {
		border-top: 1px solid var(--detail-border);
	}
	.schedule strong {
		font-weight: 500;
	}
	.value {
		text-align: right;
		color: var(--detail-muted);
		overflow-wrap: anywhere;
	}
	.summary {
		background: var(--detail-tint);
		padding: 8px 16px;
		margin-top: 24px;
		border-radius: 14px;
	}
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		margin: 12px 0;
	}
	.hint {
		color: var(--detail-muted);
		font-size: 0.9em;
		line-height: 1.5;
	}
	.task-context {
		overflow-wrap: anywhere;
	}
	.notice {
		border: 1px solid var(--detail-accent);
		border-radius: 12px;
		padding: 12px;
		margin-bottom: 16px;
	}
	.notice h2 {
		font-size: 1em;
	}
	.notice button {
		text-decoration: underline;
	}
	.error {
		color: var(--detail-error);
	}
	.remove {
		display: block;
		margin: 12px auto;
		color: var(--detail-accent);
	}
	footer {
		padding: 12px 16px max(16px, var(--safe-area-bottom));
		flex-shrink: 0;
		border-top: 1px solid var(--detail-border);
	}
	footer button {
		width: 100%;
	}
	button:focus-visible,
	textarea:focus-visible {
		outline: 3px solid var(--detail-accent);
		outline-offset: -3px;
	}
	@media (max-width: 600px), (max-height: 500px) and (pointer: coarse) {
		.task-details {
			position: fixed;
			inset: var(--viewport-top) 0 auto;
			margin: 0;
			width: 100%;
			height: var(--viewport-height);
			border-radius: 0;
			box-shadow: none;
		}
	}
	@media (max-width: 350px) {
		header {
			display: grid;
			grid-template-columns: 1fr 1fr;
		}
		header h1 {
			grid-column: 1 / -1;
			grid-row: 1;
		}
		header button {
			grid-row: 2;
		}
		header button:first-child {
			justify-self: start;
		}
		header button.primary {
			justify-self: end;
		}
		.editor-body {
			padding-inline: 6px;
		}
		.schedule button {
			grid-template-columns: 24px 1fr 12px;
		}
		.schedule .value {
			grid-column: 2;
			text-align: left;
		}
		.schedule button > span:last-child {
			grid-column: 3;
			grid-row: 1 / span 2;
		}
	}
	@media (prefers-color-scheme: dark) {
		.task-details {
			--detail-bg: #24201d;
			--detail-card: #302a26;
			--detail-tint: #403129;
			--detail-accent: #b86143;
			--detail-muted: #ddd1c7;
			--detail-border: #6c5c50;
			--detail-error: #ff9b9b;
			color: #fff4e9;
			color-scheme: dark;
		}
		header button {
			color: #f4b79b;
		}
	}
</style>
