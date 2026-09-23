<script lang="ts">
	console.log('routes/(app)/+layout.svelte');
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AcceptShare from '$lib/components/AcceptShare.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import FilterMenu from '$lib/components/FilterMenu.svelte';
	import ListMenu from '$lib/components/ListMenu.svelte';
	import TaskDetailsEditor from '$lib/components/TaskDetailsEditor.svelte';
	import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
	import ListDetailsEditor from '$lib/components/ListDetailsEditor.svelte';
	import type { DueDate } from '$lib/components/items';
	import { describe_item, remove_due_date, set_due_date } from '$lib/components/items';
	import { create_list } from '$lib/components/lists';
	import { show_edit_dialog, show_item_detail_dialog } from '$lib/components/ui';
	import firebase from '$lib/firebase';
	import {
		logTime,
		store,
		discardLocalAction,
		writeCacheNow,
		observeConfirmedActions
	} from '$lib/store';
	import Drawer, { AppContent, Content, Scrim } from '@smui/drawer';
	import IconButton, { Icon } from '@smui/icon-button';
	import List, { Graphic, Item, Subheader, Text } from '@smui/list';
	import Textfield from '@smui/textfield';
	import TopAppBar, { AutoAdjust, Row, Section, Title } from '@smui/top-app-bar';
	import { onDestroy } from 'svelte';
	import { createFirebaseListActions, load } from '$lib/database';
	import { set_current_url } from '$lib/components/UiSettings';

	let count = 0;
	onDestroy(() => {
		console.log('routes/(app)/+layout.svelte: Destroyed with count ', { count });
	});

	console.log('routes/(app)/+layout.svelte loaded', {
		count
	});

	let pageData: any = load();
	onDestroy(pageData.cleanupSubscriptions);

	let width = 0;
	const MOBILE_LAYOUT_WIDTH = 720;

	$: drawerOpen = width > MOBILE_LAYOUT_WIDTH;
	let topAppBar;

	let active: string;
	function setActive(name: string, keepDrawerOpen = false) {
		console.log('setActive ' + name);
		drawerOpen = keepDrawerOpen || width > MOBILE_LAYOUT_WIDTH;
		active = name;
		firebase.dispatch(set_current_url('/' + name));
		goto('/' + name);
	}

	function getIconName(name: string) {
		return name;
	}
	function textLookup(text: string) {
		const i18n: { [k: string]: string } = {
			account_circle: 'Profile'
		};
		return i18n[text];
	}

	let newListName = '';

	function submitNewList() {
		const name = newListName.trim();
		if (name.length > 0) {
			createList(name);
		}
		newListName = '';
	}

	function handleEnterKey(e: CustomEvent | KeyboardEvent) {
		e = e as KeyboardEvent;
		if (e.key === 'Enter') {
			e.preventDefault();
			submitNewList();
		}
	}

	let newlyCreatedListId = '';

	async function createList(name: string) {
		const id = crypto.randomUUID();
		// Finish permission setup before publishing the list: its details dialog can
		// be opened immediately, while a listener racing the editor write can observe
		// a missing document and incorrectly disable editing.
		await createFirebaseListActions(id, $store.auth, name);
		newlyCreatedListId = id;
		firebase.dispatch(create_list({ id, name }));
	}

	let oldListLength = 0;
	function checkForNewlyCreatedList() {
		const lists = $store.lists.visibleLists;
		oldListLength = lists.length;
		if (lists.length > 0 && lists[lists.length - 1] === newlyCreatedListId) {
			setActive('lists?listId=' + newlyCreatedListId);
			newlyCreatedListId = '';
		}
	}
	$: if ($store.lists.visibleLists.length !== oldListLength) {
		checkForNewlyCreatedList();
	}

	let itemDetailsOpen = false;
	$: if ($store.ui.showItemDetailsDialog && !itemDetailsOpen) {
		itemDetailsOpen = true;
	}

	let dialogOpen = false;
	let detailsListId = '';
	$: if ($store.ui.showEditDialog && !dialogOpen) openEditDialog();
	function openEditDialog() {
		detailsListId = $store.ui.listId;
		dialogOpen = true;
		store.dispatch(show_edit_dialog(true));
	}

	async function saveTaskDetails(description: string, dueDate: DueDate | undefined) {
		const { listId, itemId } = $store.ui;
		const uid = $store.auth.uid;
		const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[itemId];
		if (!uid || !item || $store.lists.listIdToList[listId] === undefined)
			throw new Error('Task is no longer available');
		// One batch gives the editor one success/failure boundary. Firestore queues
		// writes offline; the editor retains the draft until acknowledgment.
		const batch = writeBatch(firebase.firestore);
		const actions = collection(firebase.firestore, 'lists', listId, 'actions');
		const actionIds: string[] = [];
		const add = (action: object) => {
			const reference = doc(actions);
			actionIds.push(reference.id);
			batch.set(reference, { ...action, timestamp: serverTimestamp(), creator: uid });
		};
		if (description !== item.description)
			add(
				describe_item({
					list_id: listId,
					id: itemId,
					orig_description: item.description,
					description
				})
			);
		if (JSON.stringify(dueDate) !== JSON.stringify(item.dueDate)) {
			add(
				dueDate
					? set_due_date({ list_id: listId, id: itemId, due_date: dueDate })
					: remove_due_date({ list_id: listId, id: itemId })
			);
		}
		const confirmation = observeConfirmedActions(actionIds);
		try {
			await batch.commit();
			await confirmation.promise;
		} catch (error) {
			// The action-log listener may already have replayed pending local writes.
			// A rejected batch must not remain in the store or make Retry a no-op.
			confirmation.cancel();
			actionIds.forEach(discardLocalAction);
			throw error;
		}
		// Flush the confirmed state before closing so an immediate reload resumes
		// after the entire edit, rather than a partially cached action timestamp.
		await writeCacheNow();
	}

	function cancelDialog() {
		store.dispatch(show_edit_dialog(false));
		dialogOpen = false;
	}

	function cancelItemDetailsDialog() {
		store.dispatch(show_item_detail_dialog(false));
		itemDetailsOpen = false;
	}

	async function listDeleted() {
		// Closing the modal consumes its history entry asynchronously. Navigate only
		// after that popstate so it cannot take us back to the deleted document.
		const closed = history.state?.listDetailsEditor
			? new Promise<void>((resolve) =>
					window.addEventListener('popstate', () => resolve(), { once: true })
			  )
			: Promise.resolve();
		cancelDialog();
		await closed;
		const remaining = $store.lists.visibleLists.filter((id: string) => id !== detailsListId);
		const id = remaining[0];
		setActive(
			!id
				? 'profile'
				: $store.lists.listIdToType[id] === 'label'
				? 'labels?labelId=' + id
				: 'lists?listId=' + id
		);
	}

	$: bgUrl = $store?.uiSettings?.backgroundUrl;
	$: bgStyle = bgUrl ? `url(${bgUrl})` : '';

	function onOrientationChanged() {
		width = window.innerWidth;
	}

	$: loadingListPercent =
		$store.ui.loadingListTotal > 0
			? Math.floor(($store.ui.loadingListIndex / $store.ui.loadingListTotal) * 100)
			: $store.ui.loadingPercentage || 0;
	$: loadingListText = $store.ui.loadingListName || 'Loading lists';
	$: loadingListCount =
		$store.ui.loadingListTotal > 0
			? `${Math.min($store.ui.loadingListIndex || 1, $store.ui.loadingListTotal)}/${
					$store.ui.loadingListTotal
			  } (${loadingListPercent}%)`
			: `${loadingListPercent}%`;
	$: loadingActionPercent =
		$store.ui.loadingActionTotal > 0
			? Math.floor(($store.ui.loadingActionIndex / $store.ui.loadingActionTotal) * 100)
			: 0;
	$: loadingActionLabel = `Action ${$store.ui.loadingActionIndex} of ${$store.ui.loadingActionTotal}`;
</script>

<svelte:window bind:innerWidth={width} on:orientationchange={onOrientationChanged} />

{#await pageData.loaded.loaded}
	<div class="loading-screen">
		<div class="loading-panel">
			<div class="loading-title">Loading...</div>
			<div class="loading-row">
				<div class="loading-line">
					<span class="loading-list-text">{loadingListText}</span>
					<span class="loading-count">{loadingListCount}</span>
				</div>
				<progress value={loadingListPercent} max="100" aria-label="List loading progress" />
			</div>
			<div
				class:loading-row-hidden={$store.ui.loadingActionTotal <= 0}
				class="loading-row loading-action-row"
				aria-hidden={$store.ui.loadingActionTotal <= 0}
			>
				<div class="loading-line">
					<span>{loadingActionLabel}</span>
					<span>{loadingActionPercent}%</span>
				</div>
				<progress value={loadingActionPercent} max="100" aria-label="Action replay progress" />
			</div>
		</div>
	</div>
{:then value}
	<div class="drawer-container w{width} ">
		<TopAppBar bind:this={topAppBar} variant="fixed">
			<Row>
				<div class={width > MOBILE_LAYOUT_WIDTH ? 'desk-margin' : 'mobile-margin'}>
					<Section>
						{#if width <= MOBILE_LAYOUT_WIDTH}
							<IconButton
								class="material-icons"
								aria-label="Open navigation menu"
								on:click={() => (drawerOpen = !drawerOpen || width > MOBILE_LAYOUT_WIDTH)}
								>menu</IconButton
							>
						{/if}
						<IconButton class="material-icons">{$store.ui.icon}</IconButton><Title
							>{$store.ui.title}</Title
						>
					</Section>
				</div>
				<Section align="end" toolbar>
					<span><Avatar name={$store.auth.name || ''} photo={$store.auth.photo || ''} /></span>
				</Section>
			</Row>
		</TopAppBar>

		<AutoAdjust {topAppBar} />

		<Drawer
			variant={width > MOBILE_LAYOUT_WIDTH ? undefined : 'modal'}
			fixed={width > MOBILE_LAYOUT_WIDTH ? undefined : false}
			bind:open={drawerOpen}
		>
			<Content>
				<FilterMenu {setActive} />
				<ListMenu {setActive} {openEditDialog} />
				<div class="verticalspacer" />
				<AcceptShare />
				<Textfield
					style="width: 100%; min-height: 55px;"
					bind:value={newListName}
					label="New list"
					input$aria-label="New list"
					enterkeyhint="enter"
					input$enterkeyhint="enter"
					on:keydown={handleEnterKey}
					on:blur={submitNewList}
					><Icon class="material-icons" slot="leadingIcon">add</Icon></Textfield
				>
				<List>
					<Subheader>Settings</Subheader>
					<Item on:click={() => setActive('profile')} activated={active === 'profile'}>
						<Graphic class="material-icons" aria-hidden="true"
							>{getIconName('account_circle')}</Graphic
						>
						<Text>{textLookup('account_circle')}</Text>
					</Item>
					<Subheader>
						v{import.meta.env.VITE_APP_VERSION} ({import.meta.env.VITE_APP_DIRTY_FLAG
							? '⚠'
							: ''}{import.meta.env.VITE_APP_COMMIT_HASH})
					</Subheader>
				</List>
			</Content>
		</Drawer>

		<Scrim fixed={false} />
		<AppContent class="app-content">
			<div class="backdrop" style:background-image={bgStyle}>
				<slot />
				{#if itemDetailsOpen}
					<TaskDetailsEditor
						item={$store.lists.listIdToList[$store.ui.listId] === undefined
							? undefined
							: $store.items.listIdToListOfItems[$store.ui.listId]?.itemIdToItem[$store.ui.itemId]}
						onSave={saveTaskDetails}
						onClose={cancelItemDetailsDialog}
					/>
				{/if}
				{#if dialogOpen}
					<ListDetailsEditor
						listId={detailsListId}
						onClose={cancelDialog}
						onDeleted={listDeleted}
					/>
				{/if}
			</div>
		</AppContent>
	</div>
{/await}

<style>
	:global(.mdc-top-app-bar) {
		padding-top: env(safe-area-inset-top);
	}
	:global(.mdc-drawer__content) {
		--drawer-icon-artwork-inset: 7px;
		--drawer-icon-inline-margin: 2px;
		--drawer-row-height: 40px;
		--drawer-row-inline-margin: 2px;
		display: flex;
		flex-direction: column;
		padding-top: env(safe-area-inset-top);
		padding-bottom: env(safe-area-inset-bottom);
		padding-left: env(safe-area-inset-left);
	}
	:global(.mdc-drawer__content .mdc-deprecated-list-item) {
		height: var(--drawer-row-height);
		margin: 0 var(--drawer-row-inline-margin);
		padding: 0;
	}
	:global(.mdc-drawer__content .mdc-deprecated-list-item > img) {
		margin: 0 var(--drawer-icon-inline-margin);
	}
	.verticalspacer {
		display: flex;
		flex: 1;
		border-bottom: 1px solid #888e;
	}
	.loading-screen {
		align-items: center;
		background: #f7f8f5;
		color: #1e2522;
		display: flex;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
	}
	.loading-panel {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		max-width: 34rem;
		min-height: 13.5rem;
		overflow: hidden;
		position: relative;
		width: min(100%, 34rem);
	}
	.loading-panel::before {
		background-image: url('/loading-icon.png');
		background-position: center;
		background-repeat: no-repeat;
		background-size: contain;
		content: '';
		height: 13rem;
		left: 50%;
		opacity: 0.1;
		pointer-events: none;
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 13rem;
	}
	.loading-title {
		font-size: 1.45rem;
		font-weight: 600;
		line-height: 1.35;
		min-height: 2rem;
		overflow: hidden;
		position: relative;
		text-align: center;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.loading-row {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		position: relative;
	}
	.loading-list-text {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.loading-count {
		flex: 0 0 auto;
		margin-left: 1rem;
	}
	.loading-action-row {
		transition: opacity 120ms ease;
	}
	.loading-row-hidden {
		opacity: 0;
		pointer-events: none;
		visibility: hidden;
	}
	.loading-line {
		display: flex;
		font-size: 0.95rem;
		justify-content: space-between;
		line-height: 1.4;
	}
	progress {
		accent-color: #2e7d67;
		height: 0.65rem;
		width: 100%;
	}
	/* Hide everything above this component. */
	:global(app),
	:global(body),
	:global(html) {
		display: block !important;
		height: auto !important;
		width: auto !important;
		position: static !important;
		margin: 0;
		padding: 0;
	}

	.drawer-container {
		position: relative;
		display: flex;
		height: 100vh;
		max-width: 100vw;
		overflow: hidden;
		z-index: 0;
		flex-grow: 1;
	}

	* :global(.app-content) {
		position: relative;
		margin-top: 64px;
		padding: 0;
		padding-top: env(safe-area-inset-top);

		display: flex;
		flex: auto;
	}

	.mobile-margin {
		margin-left: 0;
	}
	.desk-margin {
		margin-left: 256px;
	}

	* :global(.mdc-text-field__input::-webkit-calendar-picker-indicator) {
		display: initial !important;
	}

	* :global(.mdc-text-field__resizer) {
		height: 10em;
	}

	.backdrop {
		display: flex;
		flex: auto;
		flex-grow: 1;
		overflow: auto;

		background-size: cover;
	}
</style>
