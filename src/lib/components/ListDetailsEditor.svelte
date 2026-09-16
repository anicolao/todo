<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { store, handleDocChanges, type GlobalState } from '$lib/store';
	import { watch } from './ActionLog';
	import { doc, onSnapshot } from 'firebase/firestore';
	import firebase from '$lib/firebase';
	import { getLabelPredicates, getLabelVisibility } from './labels';
	import { changedSelections, sharingStatus } from './list-details-state';
	import { listSettingsSession } from './list-details-save';
	export let listId: string;
	export let onClose: () => void;
	export let onDeleted: () => void;
	type Screen = 'details' | 'name' | 'sharing' | 'labels' | 'delete';
	let screen: Screen = 'details';
	const isLabel = $store.lists.listIdToType[listId] === 'label';
	const kind = isLabel ? 'label' : 'list';
	let savedName = $store.lists.listIdToList[listId];
	let name = savedName;
	let initialName = name;
	let initial: Record<string, boolean> = {};
	let selected: Record<string, boolean> = {};
	let initialStatuses = '';
	let search = '';
	let creating = false;
	let newName = '';
	let conflict = false;
	let confirmDiscard = false;
	let saving = false;
	let completionOnly = false;
	let error = '';
	let notice = '';
	let online = true;
	let canEdit = true;
	let session = listSettingsSession(listId);
	let dialog: HTMLDialogElement;
	let heading: HTMLHeadingElement;
	let body: HTMLDivElement;
	let viewportHeight: number | undefined;
	let viewportTop = 0;
	let alive = true;
	$: available = canEdit && $store.lists.listIdToList[listId] !== undefined;
	$: if (available) savedName = $store.lists.listIdToList[listId];
	$: people = $store.users.users
		.filter((user) => user.uid && user.uid !== $store.auth.uid)
		.map((user) => ({
			...user,
			uid: user.uid || '',
			status: sharingStatus($store.requests, listId, user.uid || '')
		}));
	$: labels = $store.lists.visibleLists
		.filter(
			(id) =>
				$store.lists.listIdToType[id] === 'label' &&
				getLabelVisibility($store.labels.labelIdToLabel[id]) !== 'fully_hidden'
		)
		.map((id) => ({
			id,
			name: $store.lists.listIdToList[id],
			included: getLabelPredicates($store.labels.labelIdToLabel[id]?.query).some(
				(p) => p.type === 'id' && p.id === listId
			)
		}));
	$: shared = people.filter((user) => user.status === 'shared').length;
	$: pending = people.filter((user) => ['invitation', 'removal'].includes(user.status)).length;
	$: sharingSummary = `${
		shared ? `${shared} ${shared === 1 ? 'person' : 'people'}` : 'Not shared'
	}${pending ? ` · ${pending} pending` : ''}`;
	$: selectedLabels = labels.filter((label) => label.included);
	$: labelsSummary = selectedLabels.length
		? selectedLabels
				.slice(0, 2)
				.map((label) => label.name)
				.join(', ') + (selectedLabels.length > 2 ? ` +${selectedLabels.length - 2} more` : '')
		: 'No labels';
	$: filteredPeople = [...people]
		.sort(
			(a, b) =>
				Number(b.status !== 'available' && b.status !== 'rejected') -
				Number(a.status !== 'available' && a.status !== 'rejected')
		)
		.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
	$: filteredLabels = labels.filter((label) =>
		label.name.toLowerCase().includes(search.toLowerCase())
	);
	$: matches =
		creating && newName.trim()
			? labels.filter((label) => label.name.toLowerCase() === newName.trim().toLowerCase())
			: [];
	$: changes = changedSelections(initial, selected);
	$: dirty =
		screen === 'name'
			? name !== initialName
			: (screen === 'sharing' || screen === 'labels') && (changes.length > 0 || creating);
	$: valid =
		screen === 'name' ? !!name.trim() : screen !== 'labels' || !creating || !!newName.trim();
	$: sync(savedName, people, labels);
	function values() {
		return screen === 'sharing'
			? Object.fromEntries(people.map((user) => [user.uid, user.status === 'shared']))
			: Object.fromEntries(labels.map((label) => [label.id, label.included]));
	}
	function statuses() {
		return JSON.stringify(people.map((user) => [user.uid, user.status]));
	}
	function sync(latest: string, _people: typeof people, _labels: typeof labels) {
		if (saving || completionOnly || screen === 'details' || screen === 'delete') return;
		if (screen === 'name') {
			if (latest !== initialName) {
				if (name !== initialName) conflict = true;
				else {
					name = latest;
					initialName = latest;
				}
			}
			return;
		}
		const next = values();
		for (const id of new Set([...Object.keys(initial), ...Object.keys(next)])) {
			if ((next[id] ?? false) !== (initial[id] ?? false)) {
				if (selected[id] !== initial[id]) conflict = true;
				else {
					selected = { ...selected, [id]: next[id] ?? false };
					initial = { ...initial, [id]: next[id] ?? false };
				}
			}
		}
		if (screen === 'sharing' && statuses() !== initialStatuses) {
			if (changedSelections(initial, selected).length) conflict = true;
			else initialStatuses = statuses();
		}
	}
	function resolve(reload: boolean) {
		if (screen === 'name') {
			if (reload) name = savedName;
			initialName = savedName;
		} else {
			const next = values();
			if (reload) {
				selected = { ...next };
				creating = false;
				newName = '';
			} else {
				for (const id of Object.keys(selected)) {
					if (
						!(id in next) ||
						(screen === 'sharing' &&
							people.some((p) => p.uid === id && ['invitation', 'removal'].includes(p.status)))
					)
						selected[id] = next[id] ?? false;
				}
				selected = { ...selected };
			}
			initial = { ...next };
			initialStatuses = statuses();
		}
		conflict = false;
	}
	async function open(next: Screen, restore?: Screen) {
		screen = next;
		search = '';
		error = '';
		conflict = false;
		confirmDiscard = false;
		creating = false;
		newName = '';
		name = savedName;
		initialName = savedName;
		initial = values();
		selected = { ...initial };
		initialStatuses = statuses();
		session = listSettingsSession(listId);
		completionOnly = false;
		await tick();
		body?.scrollTo(0, 0);
		if (restore) dialog.querySelector<HTMLButtonElement>(`[data-setting="${restore}"]`)?.focus();
		else if (next === 'delete') dialog.querySelector<HTMLButtonElement>('[data-keep]')?.focus();
		else heading?.focus();
	}
	function back() {
		if (saving) return;
		if (confirmDiscard) {
			confirmDiscard = false;
			return;
		}
		if (screen === 'details') onClose();
		else if (dirty) confirmDiscard = true;
		else open('details', screen);
	}
	function toggle(id: string) {
		selected = { ...selected, [id]: !selected[id] };
	}
	async function create() {
		creating = true;
		await tick();
		dialog.querySelector<HTMLInputElement>('#new-label-name')?.focus();
	}
	async function save() {
		if (saving || conflict || !available || !valid || (!dirty && screen !== 'delete')) return;
		saving = true;
		error = '';
		notice = '';
		const from = screen;
		try {
			if (from === 'name') await session.rename(name);
			else if (from === 'sharing')
				await session.share(Object.fromEntries(changes.map((id) => [id, selected[id]])));
			else if (from === 'labels')
				await session.labels(
					Object.fromEntries(changes.map((id) => [id, selected[id]])),
					creating ? newName : undefined
				);
			else if (from === 'delete') await session.remove();
			if (!alive) return;
			saving = false;
			if (from === 'delete') onDeleted();
			else {
				notice = 'Changes saved.';
				await open('details', from);
			}
		} catch {
			if (alive) {
				saving = false;
				completionOnly = session.committed;
				error = completionOnly
					? 'Changes were saved, but could not be refreshed. Retry to finish without submitting them again.'
					: 'Could not save changes. Your changes are still here. Retry to finish safely.';
			}
		}
	}
	function autosize(node: HTMLTextAreaElement, _value: string) {
		const resize = () => {
			node.style.height = 'auto';
			node.style.height = `${Math.max(80, node.scrollHeight)}px`;
		};
		const observer = new ResizeObserver(resize);
		observer.observe(node.parentElement!);
		resize();
		return { update: resize, destroy: () => observer.disconnect() };
	}
	function trapFocus(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const nodes = [
			...dialog.querySelectorAll<HTMLElement>(
				'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'
			)
		].filter((n) => n.getClientRects().length);
		if (
			event.shiftKey &&
			(document.activeElement === nodes[0] || document.activeElement === heading)
		) {
			event.preventDefault();
			nodes.at(-1)?.focus();
		} else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
			event.preventDefault();
			nodes[0]?.focus();
		}
	}
	beforeNavigate(({ cancel }) => {
		cancel();
		back();
	});
	onMount(() => {
		const opener = document.activeElement as HTMLElement;
		const uid = store.getState().auth.uid;
		const unwatchAccess = uid
			? onSnapshot(
					doc(firebase.firestore, 'editors', listId, uid, 'editor'),
					(snapshot) => {
						canEdit = snapshot.exists();
					},
					(error) => {
						if (error.code === 'permission-denied') canEdit = false;
					}
			  )
			: () => {};

		const labelWatches = new Map<string, () => void>();
		const unwatchLabels = store.subscribe((state: GlobalState) => {
			const ids = state.lists.visibleLists.filter((id) => state.lists.listIdToType[id] === 'label');
			for (const [id, stop] of labelWatches)
				if (!ids.includes(id)) {
					stop();
					labelWatches.delete(id);
				}
			for (const id of ids)
				if (!labelWatches.has(id)) {
					labelWatches.set(
						id,
						watch('lists', id, (changes) => handleDocChanges(changes, store.getState().auth, true))
					);
				}
		});
		dialog.showModal();
		heading.focus();
		dialog.addEventListener('keydown', trapFocus);
		const url = location.href;
		const state = { ...history.state, listDetailsEditor: true };
		let ownsEntry = true;
		history.pushState(state, '', url);
		const systemBack = (event: PopStateEvent) => {
			event.stopImmediatePropagation();
			ownsEntry = false;
			if (screen !== 'details' || saving) {
				history.pushState(state, '', url);
				ownsEntry = true;
			}
			back();
		};
		window.addEventListener('popstate', systemBack, true);
		const viewport = () => {
			viewportHeight = window.visualViewport?.height;
			viewportTop = window.visualViewport?.offsetTop ?? 0;
		};
		const connection = () => (online = navigator.onLine);
		viewport();
		connection();
		window.visualViewport?.addEventListener('resize', viewport);
		window.visualViewport?.addEventListener('scroll', viewport);
		window.addEventListener('online', connection);
		window.addEventListener('offline', connection);
		return () => {
			alive = false;
			unwatchAccess();
			unwatchLabels();
			labelWatches.forEach((stop) => stop());
			window.removeEventListener('popstate', systemBack, true);
			if (ownsEntry && history.state?.listDetailsEditor) history.back();
			dialog.removeEventListener('keydown', trapFocus);
			window.visualViewport?.removeEventListener('resize', viewport);
			window.visualViewport?.removeEventListener('scroll', viewport);
			window.removeEventListener('online', connection);
			window.removeEventListener('offline', connection);
			dialog.close();
			opener?.focus();
		};
	});
</script>

<dialog
	bind:this={dialog}
	class="list-details"
	aria-labelledby="list-details-heading"
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
				>{screen === 'details' ? 'Close' : '‹ Details'}</button
			>
			<h1 id="list-details-heading" tabindex="-1" bind:this={heading}>
				{screen === 'details'
					? isLabel
						? 'Label details'
						: 'List details'
					: screen === 'delete'
					? `Delete ${kind}`
					: screen === 'name'
					? 'Name'
					: screen === 'sharing'
					? 'Sharing'
					: 'Labels'}
			</h1>
			<span class="header-spacer"></span>
		</header>
		<div class="editor-body" bind:this={body}>
			{#if !available && !saving}<p role="alert" class="notice">
					This {kind} is no longer available. Changes cannot be saved.
				</p>{/if}
			{#if conflict}<section class="notice" role="alert">
					<p>This setting changed elsewhere. Your edits are still here.</p>
					<button on:click={() => resolve(true)}>Reload latest</button><button
						on:click={() => resolve(false)}>Keep my changes</button
					>
				</section>{/if}
			{#if error}<p role="alert" class="error">{error}</p>{/if}
			{#if saving}<p role="status">
					{online ? 'Saving changes…' : 'Waiting for connection to finish saving.'}
				</p>{:else if notice && screen === 'details'}<p role="status">{notice}</p>{/if}
			{#if confirmDiscard}
				<section class="notice" aria-label="Discard changes">
					<h2>Discard changes?</h2>
					<p>Only unsaved changes on this screen will be discarded. Saved changes will remain.</p>
					<button class="primary" on:click={() => (confirmDiscard = false)}>Keep editing</button
					><button on:click={() => open('details', screen)}>Discard changes</button>
				</section>
			{/if}
			{#if screen === 'details'}
				<h2 class="section-label">Settings</h2>
				<div class="settings">
					<button data-setting="name" disabled={!available} on:click={() => open('name')}
						><span class="material-icons" aria-hidden="true">edit</span><span
							><strong>Name</strong><small>{savedName}</small></span
						><span aria-hidden="true">›</span></button
					>
					<button data-setting="sharing" disabled={!available} on:click={() => open('sharing')}
						><span class="material-icons" aria-hidden="true">people</span><span
							><strong>Sharing</strong><small>{sharingSummary}</small></span
						><span aria-hidden="true">›</span></button
					>
					{#if !isLabel}<button
							data-setting="labels"
							disabled={!available}
							on:click={() => open('labels')}
							><span class="material-icons" aria-hidden="true">label</span><span
								><strong>Labels</strong><small>{labelsSummary}</small></span
							><span aria-hidden="true">›</span></button
						>{/if}
				</div>
				<p class="hint">Open a setting to make changes.</p>
				<h2 class="section-label actions-title">{isLabel ? 'Label' : 'List'} actions</h2>
				<div class="settings">
					<button
						class="danger"
						data-setting="delete"
						disabled={!available}
						on:click={() => open('delete')}
						><span class="material-icons" aria-hidden="true">delete_outline</span><span
							><strong>Delete {kind}…</strong><small>Confirmation required</small></span
						><span aria-hidden="true">›</span></button
					>
				</div>
			{:else if screen === 'name'}
				<label for="list-name">{isLabel ? 'Label' : 'List'} name</label><textarea
					id="list-name"
					use:autosize={name}
					rows="3"
					bind:value={name}
					disabled={saving || completionOnly}
					aria-invalid={!name.trim()}
					aria-describedby={!name.trim() ? 'name-error' : undefined}
				></textarea>
				{#if !name.trim()}<p class="error" id="name-error">Enter a {kind} name.</p>{/if}
				<p class="hint">Save updates this {kind}'s name.</p>
			{:else if screen === 'sharing'}
				<p class="context">{savedName}</p>
				<label for="people-search">Search people</label><input
					id="people-search"
					type="search"
					bind:value={search}
					disabled={saving || completionOnly}
				/>
				<p class="hint">Choose from people already in the app.</p>
				<p class="hint" role="status">
					{filteredPeople.length}
					{filteredPeople.length === 1 ? 'person' : 'people'}
				</p>
				<div class="choices">
					{#each filteredPeople as user (user.uid)}
						<label class="choice" class:pending={['invitation', 'removal'].includes(user.status)}>
							<span class="avatar" aria-hidden="true"
								>{(user.name || user.email || '?').slice(0, 1).toUpperCase()}</span
							><span
								><strong>{user.name || user.email || 'Unavailable person'}</strong><small
									>{user.email || 'Email unavailable'}</small
								><small
									>{user.status === 'invitation'
										? 'Invitation pending'
										: user.status === 'removal'
										? 'Removal pending'
										: selected[user.uid] !== initial[user.uid]
										? selected[user.uid]
											? 'Invite on Save'
											: 'Remove on Save'
										: user.status === 'shared'
										? 'Shared'
										: user.status === 'rejected'
										? 'Invitation declined'
										: 'Not shared'}</small
								></span
							>
							{#if !['invitation', 'removal'].includes(user.status)}<input
									type="checkbox"
									aria-label={`Share with ${user.email || user.name}`}
									checked={selected[user.uid] ?? false}
									disabled={saving || completionOnly || !user.email}
									on:change={() => toggle(user.uid)}
								/>{/if}
						</label>
					{/each}
				</div>
				{#if !filteredPeople.length}<p>
						{people.length ? 'No matching people' : 'No other people available yet'}
					</p>{/if}
				{#if changes.length}<section class="notice">
						<h2>On Save</h2>
						<ul>
							{#each changes as id}<li>
									{selected[id] ? 'Invite' : 'Remove'}
									{people.find((user) => user.uid === id)?.name ||
										people.find((user) => user.uid === id)?.email}
								</li>{/each}
						</ul>
					</section>{/if}
				<p class="hint">Save sends invitations and removal requests.</p>
			{:else if screen === 'labels'}
				<p class="context">{savedName}</p>
				<label for="labels-search">Search labels</label><input
					id="labels-search"
					type="search"
					bind:value={search}
					disabled={saving || completionOnly}
				/>
				<p class="hint">Include this list in these labels.</p>
				<div class="choices">
					{#each filteredLabels as label (label.id)}<label class="choice"
							><span class="material-icons" aria-hidden="true">label</span><span>{label.name}</span
							><input
								type="checkbox"
								aria-label={`Include in ${label.name}`}
								checked={selected[label.id] ?? false}
								disabled={saving || completionOnly}
								on:change={() => toggle(label.id)}
							/></label
						>{/each}
				</div>
				{#if !filteredLabels.length}<p>
						{labels.length ? 'No matching labels' : 'No labels yet'}
					</p>{/if}
				{#if creating}<section class="notice composer">
						<label for="new-label-name">New label</label><input
							id="new-label-name"
							bind:value={newName}
							disabled={saving || completionOnly}
							aria-invalid={!newName.trim()}
						/>{#if !newName.trim()}<p class="error">Enter a label name.</p>{/if}
						<p class="hint">Save creates this label and includes the list.</p>
						{#each matches as label}<button
								disabled={saving || completionOnly}
								on:click={() => {
									selected = { ...selected, [label.id]: true };
									creating = false;
									newName = '';
								}}>Use existing {label.name}</button
							>{/each}<button
							disabled={saving || completionOnly}
							on:click={() => {
								creating = false;
								newName = '';
							}}>Cancel new label</button
						>
					</section>
				{:else}<button class="outlined create" disabled={saving || completionOnly} on:click={create}
						>+ Create label</button
					>{/if}
				<p class="hint">Tasks stay in their original list.</p>
			{:else}
				<h2>Delete “{savedName}”?</h2>
				<p>This removes the {kind} from navigation for people who receive this {kind}'s updates.</p>
				{#if isLabel}<p>Source lists and their tasks remain intact.</p>{/if}
				<p class="hint">Review the {kind} name before deleting.</p>
				<div class="delete-actions">
					<button
						class="outlined"
						data-keep
						disabled={saving || completionOnly}
						on:click={() => open('details', 'delete')}>Keep {kind}</button
					><button class="destructive" disabled={saving || !available} on:click={save}
						>{error ? 'Retry deletion' : `Delete ${kind}`}</button
					>
				</div>
			{/if}
		</div>
		{#if ['name', 'sharing', 'labels'].includes(screen)}<footer>
				<button
					class="primary"
					disabled={saving || !available || !valid || conflict || !dirty || confirmDiscard}
					on:click={save}>{saving ? 'Saving…' : error ? 'Retry' : 'Save'}</button
				>
			</footer>{/if}
	</div>
</dialog>

<style>
	.list-details {
		--bg: #faf8f2;
		--card: #fff;
		--accent: #94482f;
		--muted: #665f5a;
		--border: #d9d1ca;
		--error: #a91c23;
		color: #302621;
		background: var(--bg);
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
	.list-details::backdrop {
		background: #21171080;
	}
	.editor-shell {
		height: 100%;
		display: flex;
		flex-direction: column;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: max(12px, env(safe-area-inset-top)) 12px 12px;
		flex-shrink: 0;
	}
	h1 {
		flex: 1;
		font-size: 1.05em;
		text-align: center;
		margin: 0;
		outline: none;
	}
	h2 {
		font-size: 1.15em;
		overflow-wrap: anywhere;
	}
	button,
	input,
	textarea {
		font: inherit;
		color: inherit;
	}
	button {
		cursor: pointer;
		min-height: 48px;
		padding: 10px 12px;
		border: 0;
		border-radius: 10px;
		background: transparent;
	}
	header button {
		color: var(--accent);
		padding-inline: 8px;
	}
	.header-spacer {
		width: 48px;
	}
	button.primary {
		background: var(--accent);
		color: white;
		font-weight: 600;
	}
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.editor-body {
		padding: 12px 16px 24px;
		overflow: auto;
		flex: 1;
		min-height: 0;
		overscroll-behavior: contain;
	}
	.section-label {
		text-transform: uppercase;
		font-size: 0.8em;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 12px 0;
	}
	.actions-title {
		margin-top: 28px;
	}
	.settings,
	.choices {
		background: var(--card);
		border-radius: 14px;
		overflow: hidden;
	}
	.settings button {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) 12px;
		gap: 12px;
		align-items: center;
		width: 100%;
		text-align: left;
		padding: 16px;
		border-radius: 0;
	}
	.settings button + button,
	.choice + .choice {
		border-top: 1px solid var(--border);
	}
	strong {
		display: block;
		font-weight: 500;
	}
	small {
		display: block;
		color: var(--muted);
		margin-top: 4px;
		font-size: 0.9em;
		overflow-wrap: anywhere;
	}
	.settings strong,
	.choice span {
		overflow-wrap: anywhere;
	}
	.danger {
		color: var(--error);
	}
	.hint,
	.context {
		color: var(--muted);
		font-size: 0.9em;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	label:not(.choice) {
		display: block;
		margin: 12px 0;
	}
	input:not([type='checkbox']),
	textarea {
		width: 100%;
		box-sizing: border-box;
		min-height: 48px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
	}
	textarea {
		resize: vertical;
	}
	.choice {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr) 28px;
		align-items: center;
		gap: 12px;
		padding: 16px;
		min-height: 48px;
		cursor: pointer;
	}
	input[type='checkbox'] {
		width: 24px;
		height: 24px;
		accent-color: var(--accent);
	}
	.pending {
		cursor: default;
	}
	.avatar {
		background: var(--bg);
		border-radius: 50%;
		text-align: center;
		padding: 6px;
	}
	.notice {
		overflow-wrap: anywhere;
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px;
		margin: 16px 0;
	}
	.error {
		color: var(--error);
	}
	.outlined {
		border: 1px solid var(--border);
		background: var(--card);
	}
	.create {
		width: 100%;
		margin-top: 16px;
		color: var(--accent);
	}
	.delete-actions {
		display: grid;
		gap: 12px;
		margin-top: 24px;
	}
	.destructive {
		background: var(--error);
		color: #fff;
	}
	footer {
		padding: 12px 16px max(16px, env(safe-area-inset-bottom));
		flex-shrink: 0;
		border-top: 1px solid var(--border);
	}
	footer button {
		width: 100%;
	}
	button:focus-visible,
	input:focus-visible,
	textarea:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: -3px;
	}
	@media (max-width: 600px), (max-height: 500px) and (pointer: coarse) {
		.list-details {
			position: fixed;
			inset: var(--viewport-top) 0 auto;
			margin: 0;
			width: 100%;
			height: var(--viewport-height);
			border-radius: 0;
			box-shadow: none;
		}
	}
	@media (prefers-color-scheme: dark) {
		.list-details {
			--bg: #241f1c;
			--card: #332c27;
			--accent: #e7a58a;
			--muted: #c9bdb4;
			--border: #66574b;
			--error: #ffb4ab;
			color: #f9eee5;
		}
		button.primary,
		.destructive {
			color: #281e18;
		}
	}
</style>
