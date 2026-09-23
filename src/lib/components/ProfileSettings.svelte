<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { getLabelVisibility, set_label_visibility, type LabelVisibility } from './labels';
	import { set_background_url, set_density, type UiSettings } from './UiSettings';
	import { profileSettingSession } from './profile-settings-save';
	import { watch } from './ActionLog';
	import firebase from '$lib/firebase';
	import { handleDocChanges, store } from '$lib/store';
	import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
	import { signOut } from 'firebase/auth';
	import { onDestroy, onMount, tick } from 'svelte';

	type Screen = 'profile' | 'spacing' | 'background' | 'labels' | 'label' | 'signout';
	type Density = UiSettings['density'];

	let screen: Screen = 'profile';
	let dialog: HTMLDialogElement;
	let heading: HTMLHeadingElement;
	let opener: HTMLElement | undefined;
	let ownsHistoryEntry = false;
	let confirmDiscard = false;
	let saving = false;
	let error = '';
	let notice = '';
	let conflict = false;
	let viewportHeight: number | undefined;
	let viewportTop = 0;
	let avatarFailed = false;

	let densityDraft: Density = 'high';
	let densityInitial: Density = 'high';
	let densityObserved: Density = 'high';
	let backgroundDraft = '';
	let backgroundInitial = '';
	let backgroundObserved = '';
	let previewUrl = '';
	let previewFailed = false;
	let previewLoading = false;
	let previewTimer: ReturnType<typeof setTimeout> | undefined;
	let labelSearch = '';
	let selectedLabelId = '';
	let visibilityDraft: LabelVisibility = 'visible';
	let visibilityInitial: LabelVisibility = 'visible';
	let visibilityObserved: LabelVisibility = 'visible';
	let canEditLabel = true;
	let watchAccess: Unsubscribe | undefined;
	let watchLabelActions: Unsubscribe | undefined;
	let session = profileSettingSession('account');

	$: labelIds = $store.lists.visibleLists.filter((id) => $store.lists.listIdToType[id] === 'label');
	$: labels = labelIds.map((id) => ({
		id,
		name: $store.lists.listIdToList[id] || 'Untitled label',
		owner: $store.lists.listIdToLastKnownInfo[id]?.ownerEmail || '',
		visibility: getLabelVisibility($store.labels.labelIdToLabel[id])
	}));
	$: filteredLabels = labels.filter((label) =>
		`${label.name} ${label.owner}`
			.toLocaleLowerCase()
			.includes(labelSearch.trim().toLocaleLowerCase())
	);
	$: selectedLabel = labels.find((label) => label.id === selectedLabelId);
	$: hiddenCount = labels.filter((label) => label.visibility === 'hidden').length;
	$: fullyHiddenCount = labels.filter((label) => label.visibility === 'fully_hidden').length;
	$: labelSummary = !labels.length
		? 'No labels yet'
		: !hiddenCount && !fullyHiddenCount
		? 'All labels visible'
		: [
				hiddenCount ? `${hiddenCount} hidden` : '',
				fullyHiddenCount ? `${fullyHiddenCount} fully hidden` : ''
		  ]
				.filter(Boolean)
				.join(' · ');
	$: densitySummary = $store.uiSettings.density === 'low' ? 'Comfortable' : 'Compact';
	$: backgroundSummary = $store.uiSettings.backgroundUrl?.trim() ? 'Custom image' : 'Default';
	$: dirty =
		screen === 'spacing'
			? densityDraft !== densityInitial
			: screen === 'background'
			? normalizedBackground(backgroundDraft) !== backgroundInitial
			: screen === 'label'
			? visibilityDraft !== visibilityInitial
			: false;
	$: backgroundValid = validBackground(backgroundDraft);
	$: selectedLabelAvailable = !!selectedLabel;
	$: saveValid =
		screen === 'spacing' ||
		(screen === 'background' && backgroundValid) ||
		(screen === 'label' && selectedLabelAvailable && canEditLabel);
	$: syncDensity($store.uiSettings.density);
	$: syncBackground($store.uiSettings.backgroundUrl || '');
	$: syncVisibility(selectedLabel?.visibility);

	function initials(name?: string | null, email?: string | null) {
		const words = (name || '').trim().split(/\s+/).filter(Boolean);
		if (words.length)
			return words
				.slice(0, 2)
				.map((word) => word[0])
				.join('')
				.toUpperCase();
		return (email || '?').slice(0, 1).toUpperCase();
	}

	function visibilityName(value: LabelVisibility) {
		return value === 'fully_hidden' ? 'Fully hidden' : value[0].toUpperCase() + value.slice(1);
	}

	function normalizedBackground(value: string) {
		return value.trim();
	}

	function validBackground(value: string) {
		if (value === '') return true;
		const trimmed = value.trim();
		if (!trimmed) return false;
		try {
			return ['http:', 'https:'].includes(new URL(trimmed).protocol);
		} catch {
			return false;
		}
	}

	function syncDensity(value: Density) {
		if (screen !== 'spacing') {
			densityObserved = value;
			return;
		}
		if (value === densityObserved) return;
		if (densityDraft === densityObserved) {
			densityDraft = value;
			densityInitial = value;
		} else if (densityDraft === value) densityInitial = value;
		else conflict = true;
		densityObserved = value;
	}

	function syncBackground(value: string) {
		value = normalizedBackground(value);
		if (screen !== 'background') {
			backgroundObserved = value;
			return;
		}
		if (value === backgroundObserved) return;
		if (normalizedBackground(backgroundDraft) === backgroundObserved) {
			backgroundDraft = value;
			backgroundInitial = value;
			setPreview(value);
		} else if (normalizedBackground(backgroundDraft) === value) backgroundInitial = value;
		else conflict = true;
		backgroundObserved = value;
	}

	function syncVisibility(value: LabelVisibility | undefined) {
		if (screen !== 'label' || !value) return;
		if (value === visibilityObserved) return;
		if (visibilityDraft === visibilityObserved) {
			visibilityDraft = value;
			visibilityInitial = value;
		} else if (visibilityDraft === value) visibilityInitial = value;
		else conflict = true;
		visibilityObserved = value;
	}

	function resetMessages() {
		confirmDiscard = false;
		conflict = false;
		error = '';
	}

	function initialize(next: Screen) {
		resetMessages();
		if (next === 'spacing') {
			densityDraft = densityInitial = densityObserved = $store.uiSettings.density;
			session = profileSettingSession('account');
		}
		if (next === 'background') {
			backgroundDraft =
				backgroundInitial =
				backgroundObserved =
					normalizedBackground($store.uiSettings.backgroundUrl || '');
			setPreview(backgroundDraft);
			session = profileSettingSession('account');
		}
		if (next === 'labels') labelSearch = '';
		if (next === 'signout') session = profileSettingSession('account');
	}

	async function open(next: Screen, event?: Event) {
		opener = (event?.currentTarget || document.activeElement) as HTMLElement;
		initialize(next);
		screen = next;
		await tick();
		dialog.showModal();
		if (next === 'signout') dialog.querySelector<HTMLElement>('[data-keep]')?.focus();
		else heading.focus();
		const url = location.href;
		history.pushState({ ...history.state, profileSettings: true }, '', url);
		ownsHistoryEntry = true;
	}

	async function openLabel(id: string, event: Event) {
		opener = event.currentTarget as HTMLElement;
		selectedLabelId = id;
		const value = getLabelVisibility($store.labels.labelIdToLabel[id]);
		visibilityDraft = visibilityInitial = visibilityObserved = value;
		canEditLabel = true;
		resetMessages();
		session = profileSettingSession({ labelId: id });
		watchAccess?.();
		watchLabelActions?.();
		const uid = $store.auth.uid;
		if (uid) {
			watchLabelActions = watch('lists', id, (changes) =>
				handleDocChanges(changes, store.getState().auth, true)
			);
			watchAccess = onSnapshot(
				doc(firebase.firestore, 'editors', id, uid, 'editor'),
				(snapshot) => (canEditLabel = snapshot.exists()),
				(error) => {
					if (error.code === 'permission-denied') canEditLabel = false;
				}
			);
		}
		screen = 'label';
		await tick();
		heading.focus();
	}

	function setPreview(value: string) {
		if (previewTimer) clearTimeout(previewTimer);
		previewFailed = false;
		previewLoading = false;
		const normalized = normalizedBackground(value);
		previewUrl = validBackground(value) && normalized ? normalized : '';
		previewLoading = !!previewUrl;
	}

	function updateBackground(value: string) {
		backgroundDraft = value;
		if (previewTimer) clearTimeout(previewTimer);
		previewFailed = false;
		previewLoading = false;
		previewTimer = setTimeout(() => setPreview(value), 450);
	}

	function useDefaultBackground() {
		backgroundDraft = '';
		setPreview('');
	}

	function resolveConflict(reload: boolean) {
		if (reload) {
			if (screen === 'spacing') densityDraft = densityInitial = densityObserved;
			if (screen === 'background') {
				backgroundDraft = backgroundInitial = backgroundObserved;
				setPreview(backgroundDraft);
			}
			if (screen === 'label') visibilityDraft = visibilityInitial = visibilityObserved;
		}
		conflict = false;
	}

	function closePanel(popHistory = true) {
		watchAccess?.();
		watchAccess = undefined;
		watchLabelActions?.();
		watchLabelActions = undefined;
		if (dialog?.open) dialog.close();
		screen = 'profile';
		resetMessages();
		if (popHistory && ownsHistoryEntry) {
			ownsHistoryEntry = false;
			history.back();
		}
		const target = opener;
		tick().then(() => target?.focus());
	}

	function returnToLabels() {
		watchAccess?.();
		watchAccess = undefined;
		watchLabelActions?.();
		watchLabelActions = undefined;
		screen = 'labels';
		resetMessages();
		tick().then(() => opener?.focus());
	}

	function back() {
		if (saving) return;
		if (dirty) {
			confirmDiscard = true;
			return;
		}
		if (screen === 'label') returnToLabels();
		else closePanel();
	}

	function discard() {
		confirmDiscard = false;
		if (screen === 'label') returnToLabels();
		else closePanel();
	}

	async function save() {
		if (!dirty || !saveValid || conflict || saving) return;
		saving = true;
		error = '';
		try {
			if (screen === 'spacing') {
				await session.save(set_density(densityDraft));
				densityInitial = densityDraft;
				notice = `Item spacing saved as ${densityDraft === 'low' ? 'Comfortable' : 'Compact'}.`;
				closePanel();
			} else if (screen === 'background') {
				const value = normalizedBackground(backgroundDraft);
				await session.save(set_background_url(value));
				backgroundInitial = value;
				notice = `Background saved as ${value ? 'Custom image' : 'Default'}.`;
				closePanel();
			} else if (screen === 'label' && selectedLabel) {
				await session.save(
					set_label_visibility({ label_id: selectedLabel.id, visibility: visibilityDraft })
				);
				visibilityInitial = visibilityDraft;
				notice = `${selectedLabel.name} saved as ${visibilityName(visibilityDraft)}.`;
				returnToLabels();
			}
		} catch {
			error = session.committed
				? 'Changes were saved, but could not be refreshed. Retry to finish safely.'
				: 'Could not save changes. Your choice is still here. Retry when ready.';
		} finally {
			saving = false;
		}
	}

	async function signout() {
		if (saving) return;
		saving = true;
		error = '';
		try {
			await signOut(firebase.auth);
		} catch {
			error = 'Could not sign out. You are still signed in. Retry or go back.';
			saving = false;
			return;
		}
		ownsHistoryEntry = false;
		closePanel(false);
		await goto('/login');
	}

	function trapFocus(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;
		const nodes = [
			...dialog.querySelectorAll<HTMLElement>(
				'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
			)
		].filter((node) => node.getClientRects().length);
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
		if (screen !== 'profile') {
			cancel();
			back();
		}
	});

	onMount(() => {
		const systemBack = (event: PopStateEvent) => {
			if (screen === 'profile' || !ownsHistoryEntry) return;
			event.stopImmediatePropagation();
			ownsHistoryEntry = false;
			if (screen === 'label' || dirty) {
				history.pushState({ ...history.state, profileSettings: true }, '', location.href);
				ownsHistoryEntry = true;
				back();
			} else closePanel(false);
		};
		const viewport = () => {
			viewportHeight = window.visualViewport?.height;
			viewportTop = window.visualViewport?.offsetTop ?? 0;
		};
		viewport();
		window.addEventListener('popstate', systemBack, true);
		window.visualViewport?.addEventListener('resize', viewport);
		window.visualViewport?.addEventListener('scroll', viewport);
		return () => {
			window.removeEventListener('popstate', systemBack, true);
			window.visualViewport?.removeEventListener('resize', viewport);
			window.visualViewport?.removeEventListener('scroll', viewport);
		};
	});

	onDestroy(() => {
		watchAccess?.();
		watchLabelActions?.();
		if (previewTimer) clearTimeout(previewTimer);
		if (ownsHistoryEntry && history.state?.profileSettings) history.back();
	});
</script>

<main class="profile-settings" aria-labelledby="profile-settings-title">
	<h1 id="profile-settings-title" class="sr-only">Profile</h1>
	<section class="identity" aria-label="Signed-in account">
		<div class="avatar" aria-hidden="true">
			{#if $store.auth.photo && !avatarFailed}<img
					src={$store.auth.photo}
					alt=""
					referrerpolicy="no-referrer"
					on:error={() => (avatarFailed = true)}
				/>{:else}{initials($store.auth.name, $store.auth.email)}{/if}
		</div>
		<div>
			<strong>{$store.auth.name || 'Signed-in user'}</strong><span>{$store.auth.email}</span><small
				>Signed in</small
			>
		</div>
	</section>

	{#if notice}<p class="root-notice" role="status">{notice}</p>{/if}

	<h2 class="section-label">Appearance</h2>
	<div class="settings">
		<button data-setting="spacing" on:click={(event) => open('spacing', event)}>
			<span class="material-icons" aria-hidden="true">density_medium</span><span
				><strong>Item spacing</strong><small>{densitySummary}</small></span
			><span aria-hidden="true">›</span>
		</button>
		<button data-setting="background" on:click={(event) => open('background', event)}>
			<span class="material-icons" aria-hidden="true">image</span><span
				><strong>Background</strong><small>{backgroundSummary}</small></span
			><span aria-hidden="true">›</span>
		</button>
	</div>

	<h2 class="section-label">Organization</h2>
	<div class="settings">
		<button data-setting="labels" on:click={(event) => open('labels', event)}>
			<span class="material-icons" aria-hidden="true">label</span><span
				><strong>Label visibility</strong><small>{labelSummary}</small></span
			><span aria-hidden="true">›</span>
		</button>
	</div>
	<p class="root-hint">Choose where labels and their lists appear.</p>

	<h2 class="section-label">Account</h2>
	<div class="settings">
		<button class="warning" data-setting="signout" on:click={(event) => open('signout', event)}>
			<span class="material-icons" aria-hidden="true">logout</span><span
				><strong>Sign out…</strong><small>{$store.auth.email}</small></span
			><span aria-hidden="true">›</span>
		</button>
	</div>
</main>

{#if screen !== 'profile'}
	<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
	<dialog
		bind:this={dialog}
		class="profile-editor"
		aria-labelledby="profile-editor-heading"
		on:cancel={(event) => {
			event.preventDefault();
			back();
		}}
		on:keydown={trapFocus}
		style:--viewport-height={viewportHeight ? `${viewportHeight}px` : '100dvh'}
		style:--viewport-top={`${viewportTop}px`}
	>
		<div class="editor-shell">
			<header>
				<button disabled={saving} on:click={back}
					>{screen === 'label' ? '‹ Labels' : '‹ Profile'}</button
				>
				<h1 id="profile-editor-heading" tabindex="-1" bind:this={heading}>
					{screen === 'spacing'
						? 'Item spacing'
						: screen === 'background'
						? 'Background'
						: screen === 'labels'
						? 'Label visibility'
						: screen === 'label'
						? 'Visibility'
						: 'Sign out'}
				</h1>
				<span class="header-spacer"></span>
			</header>
			<div class="editor-body">
				{#if conflict}<section class="notice" role="alert">
						<p>This setting changed elsewhere. Your choice is still here.</p>
						<button on:click={() => resolveConflict(true)}>Reload latest</button><button
							on:click={() => resolveConflict(false)}>Keep my choice</button
						>
					</section>{/if}
				{#if error}<p class="error" role="alert">{error}</p>{/if}
				{#if saving}<p role="status">
						{screen === 'signout' ? 'Signing out…' : 'Saving changes…'}
					</p>{/if}
				{#if confirmDiscard}<section class="notice" aria-label="Discard changes">
						<h2>Discard changes?</h2>
						<p>This setting has not been saved.</p>
						<button class="primary" on:click={() => (confirmDiscard = false)}>Keep editing</button
						><button on:click={discard}>Discard changes</button>
					</section>{/if}

				{#if screen === 'spacing'}
					<p class="context">Choose how much room each task uses.</p>
					<fieldset class="choices">
						<legend class="sr-only">Item spacing</legend>
						<label class="choice"
							><span
								><strong>Comfortable</strong><small>Larger controls and more breathing room</small
								></span
							><input type="radio" name="density" value="low" bind:group={densityDraft} /></label
						>
						<label class="choice"
							><span><strong>Compact</strong><small>More tasks visible at once</small></span><input
								type="radio"
								name="density"
								value="high"
								bind:group={densityDraft}
							/></label
						>
					</fieldset>
					<section
						class:comfortable={densityDraft === 'low'}
						class="task-preview"
						aria-label="Item spacing preview"
					>
						<span class="preview-check" aria-hidden="true"></span><span>Example task</span><span
							class="material-icons"
							aria-hidden="true">star_border</span
						>
					</section>
				{:else if screen === 'background'}
					<label for="background-url">Image URL</label>
					<input
						id="background-url"
						type="url"
						value={backgroundDraft}
						disabled={saving}
						aria-invalid={!backgroundValid}
						aria-describedby={!backgroundValid ? 'background-error' : 'background-help'}
						on:input={(event) => updateBackground(event.currentTarget.value)}
					/>
					{#if !backgroundValid}<p id="background-error" class="error">
							Enter a complete http:// or https:// image URL, or use the default background.
						</p>{/if}
					<p id="background-help" class="hint">Todo requests this image from its host.</p>
					<div class="background-preview" aria-live="polite">
						{#if previewUrl}<img
								src={previewUrl}
								alt="Background preview"
								referrerpolicy="no-referrer"
								on:load={() => (previewLoading = false)}
								on:error={() => {
									previewLoading = false;
									previewFailed = true;
								}}
							/>{:else}<span>Default background</span>{/if}
						{#if previewLoading}<span class="preview-status">Loading preview…</span>{/if}
						{#if previewFailed}<span class="preview-status error"
								>Couldn't load this image. Check the URL.</span
							>{/if}
					</div>
					<button
						class="outlined default-background"
						disabled={saving}
						on:click={useDefaultBackground}>Use default background</button
					>
				{:else if screen === 'labels'}
					<label for="label-search">Search labels</label><input
						id="label-search"
						type="search"
						bind:value={labelSearch}
					/>
					<p class="hint">
						Visibility changes navigation and aggregate views. It is not privacy or access control.
						Changes affect everyone who edits the label.
					</p>
					{#if labels.length}
						<div class="settings label-settings">
							{#each filteredLabels as label (label.id)}<button
									on:click={(event) => openLabel(label.id, event)}
								>
									<span class="material-icons" aria-hidden="true">label</span><span
										><strong>{label.name}</strong><small
											>{visibilityName(label.visibility)}{label.owner &&
											label.owner !== $store.auth.email
												? ` · Shared by ${label.owner}`
												: ''}</small
										></span
									><span aria-hidden="true">›</span>
								</button>{/each}
						</div>
						{#if !filteredLabels.length}<p>No matching labels.</p>{/if}
					{:else}<p>No labels yet. Create a label from a list, then return here.</p>{/if}
				{:else if screen === 'label'}
					{#if selectedLabel}<p class="context">
							<strong>{selectedLabel.name}</strong>{#if selectedLabel.owner}<span
									>{selectedLabel.owner}</span
								>{/if}
						</p>{/if}
					{#if !selectedLabelAvailable}<p role="alert" class="error">
							This label is no longer available. Your choice cannot be saved.
						</p>{:else if !canEditLabel}<p role="alert" class="notice">
							You can view this label, but editing is unavailable.
						</p>{/if}
					<fieldset class="choices visibility-choices" disabled={saving || !canEditLabel}>
						<legend class="sr-only">Visibility</legend>
						<label class="choice"
							><span
								><strong>Visible</strong><small
									>Show normally and include its lists in aggregate views.</small
								></span
							><input
								type="radio"
								name="visibility"
								value="visible"
								bind:group={visibilityDraft}
							/></label
						>
						<label class="choice"
							><span
								><strong>Hidden</strong><small
									>Keep it in Lists; exclude its lists from aggregate views.</small
								></span
							><input
								type="radio"
								name="visibility"
								value="hidden"
								bind:group={visibilityDraft}
							/></label
						>
						<label class="choice"
							><span
								><strong>Fully hidden</strong><small
									>Exclude its lists and show this label only in Profile → Label visibility.</small
								></span
							><input
								type="radio"
								name="visibility"
								value="fully_hidden"
								bind:group={visibilityDraft}
							/></label
						>
					</fieldset>
					<p class="hint">
						This is not a privacy setting. Direct list access and permissions do not change.
					</p>
				{:else}
					<section class="signout-identity">
						<div class="avatar" aria-hidden="true">
							{#if $store.auth.photo && !avatarFailed}<img
									src={$store.auth.photo}
									alt=""
									referrerpolicy="no-referrer"
									on:error={() => (avatarFailed = true)}
								/>{:else}{initials($store.auth.name, $store.auth.email)}{/if}
						</div>
						<div>
							<strong>{$store.auth.name || 'Signed-in user'}</strong><span>{$store.auth.email}</span
							>
						</div>
					</section>
					<h2>Sign out of this account?</h2>
					<p>You can sign in again to return to your synced lists.</p>
					<p class="hint">Todo may still be finishing changes in the background.</p>
					<div class="signout-actions">
						<button class="outlined" data-keep on:click={() => closePanel()}
							>Keep me signed in</button
						>
						<button class="destructive" disabled={saving} on:click={signout}
							>{saving ? 'Signing out…' : error ? 'Retry sign out' : 'Sign out'}</button
						>
					</div>
				{/if}
			</div>
			{#if ['spacing', 'background', 'label'].includes(screen)}<footer>
					<button
						class="primary"
						disabled={saving || !dirty || !saveValid || conflict || confirmDiscard}
						on:click={save}>{saving ? 'Saving…' : error ? 'Retry' : 'Save'}</button
					>
				</footer>{/if}
		</div>
	</dialog>
{/if}

<style>
	.profile-settings,
	.profile-editor {
		--bg: #faf8f2;
		--card: #fff;
		--accent: #94482f;
		--muted: #665f5a;
		--border: #d9d1ca;
		--error: #a91c23;
		color: #302621;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 17px;
	}
	.profile-settings {
		box-sizing: border-box;
		width: min(100%, 560px);
		margin: 0 auto;
		padding: 20px 16px max(32px, env(safe-area-inset-bottom));
		align-self: flex-start;
		background: color-mix(in srgb, var(--bg) 92%, transparent);
		border-radius: 0 0 20px 20px;
	}
	.identity,
	.signout-identity {
		display: grid;
		grid-template-columns: 64px minmax(0, 1fr);
		gap: 16px;
		align-items: center;
		background: color-mix(in srgb, var(--card) 94%, transparent);
		border-radius: 16px;
		padding: 16px;
	}
	.avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		background: #eadbd2;
		display: grid;
		place-items: center;
		font-size: 1.25em;
		font-weight: 600;
		overflow: hidden;
	}
	.avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.identity strong,
	.identity span,
	.identity small,
	.signout-identity strong,
	.signout-identity span {
		display: block;
		overflow-wrap: anywhere;
	}
	.identity small {
		color: var(--muted);
		margin-top: 4px;
	}
	.section-label {
		text-transform: uppercase;
		font-size: 0.8em;
		letter-spacing: 0.04em;
		color: var(--muted);
		margin: 28px 0 12px;
	}
	.settings,
	.choices {
		background: color-mix(in srgb, var(--card) 96%, transparent);
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
		font-weight: 600;
	}
	small {
		display: block;
		color: var(--muted);
		margin-top: 4px;
		font-size: 0.9em;
		overflow-wrap: anywhere;
	}
	.root-hint,
	.hint,
	.context {
		color: var(--muted);
		font-size: 0.9em;
		line-height: 1.5;
		overflow-wrap: anywhere;
	}
	.root-hint {
		margin: 8px 12px 0;
	}
	.root-notice {
		color: var(--accent);
		margin: 16px 4px 0;
	}
	.warning {
		color: var(--error);
	}
	button,
	input {
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
	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.profile-editor {
		background: var(--bg);
		border: 0;
		padding: 0;
		border-radius: 20px;
		width: min(520px, calc(100vw - 32px));
		max-width: none;
		max-height: none;
		height: min(850px, calc(var(--viewport-height) - 40px));
		box-shadow: 0 12px 60px #0004;
		box-sizing: border-box;
		overflow: hidden;
	}
	.profile-editor::backdrop {
		background: #21171080;
	}
	.editor-shell {
		height: 100%;
		display: flex;
		flex-direction: column;
		min-width: 0;
		max-width: 100%;
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: max(12px, env(safe-area-inset-top)) 12px 12px;
		flex-shrink: 0;
		box-sizing: border-box;
		min-width: 0;
		max-width: 100%;
	}
	header h1 {
		flex: 1;
		min-width: 0;
		font-size: 1.05em;
		text-align: center;
		margin: 0;
		outline: none;
		overflow-wrap: anywhere;
	}
	header button {
		color: var(--accent);
		padding-inline: 8px;
	}
	.header-spacer {
		flex: 0 1 64px;
		min-width: 0;
	}
	.editor-body {
		padding: 12px 16px 24px;
		overflow: auto;
		flex: 1;
		min-height: 0;
		min-width: 0;
		max-width: 100%;
		box-sizing: border-box;
		overscroll-behavior: contain;
	}
	.editor-body > label {
		display: block;
		margin: 12px 0;
	}
	input:not([type='radio']) {
		width: 100%;
		box-sizing: border-box;
		min-height: 48px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--card);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 16px 0;
	}
	.choice {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 28px;
		align-items: center;
		gap: 12px;
		padding: 16px;
		min-height: 48px;
		cursor: pointer;
	}
	.choice input {
		width: 24px;
		height: 24px;
		accent-color: var(--accent);
	}
	.task-preview {
		display: grid;
		grid-template-columns: 32px 1fr 32px;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		margin-top: 24px;
		padding: 6px 10px;
		background: var(--card);
		border: 1px solid var(--border);
		border-radius: 12px;
	}
	.task-preview.comfortable {
		min-height: 64px;
		padding-block: 12px;
		grid-template-columns: 40px 1fr 40px;
	}
	.preview-check {
		width: 22px;
		height: 22px;
		border: 2px solid var(--muted);
		border-radius: 50%;
		justify-self: center;
	}
	.comfortable .preview-check {
		width: 28px;
		height: 28px;
	}
	.background-preview {
		min-height: 180px;
		max-height: 240px;
		display: grid;
		place-items: center;
		position: relative;
		overflow: hidden;
		margin: 20px 0 12px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: #e9e4dd;
		color: var(--muted);
	}
	.background-preview img {
		width: 100%;
		height: 220px;
		object-fit: cover;
	}
	.preview-status {
		position: absolute;
		inset: auto 8px 8px;
		background: color-mix(in srgb, var(--card) 92%, transparent);
		padding: 8px;
		border-radius: 8px;
		text-align: center;
	}
	.default-background {
		width: 100%;
	}
	.label-settings {
		margin-top: 20px;
	}
	.context span {
		display: block;
	}
	.notice {
		overflow-wrap: anywhere;
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 12px;
		margin: 16px 0;
	}
	.notice button + button {
		margin-left: 8px;
	}
	.error {
		color: var(--error);
		overflow-wrap: anywhere;
	}
	.primary {
		background: var(--accent);
		color: white;
		font-weight: 600;
	}
	.outlined {
		border: 1px solid var(--border);
		background: var(--card);
	}
	.destructive {
		background: var(--error);
		color: white;
	}
	.signout-identity {
		grid-template-columns: 52px minmax(0, 1fr);
		margin-bottom: 28px;
	}
	.signout-identity .avatar {
		width: 52px;
		height: 52px;
	}
	.signout-actions {
		display: grid;
		gap: 12px;
		margin-top: 28px;
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
	input:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: -3px;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	@media (max-width: 600px), (max-height: 500px) and (pointer: coarse) {
		.profile-editor {
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
		.profile-settings,
		.profile-editor {
			--bg: #241f1c;
			--card: #332c27;
			--accent: #e7a58a;
			--muted: #c9bdb4;
			--border: #66574b;
			--error: #ffb4ab;
			color: #f9eee5;
		}
		.primary,
		.destructive {
			color: #281e18;
		}
		.background-preview {
			background: #403730;
		}
	}
</style>
