<script lang="ts">
	console.log('routes/(app)/+layout.svelte');
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AcceptShare from '$lib/components/AcceptShare.svelte';
	import { dispatch, dispatchLabelAction } from '$lib/components/ActionLog';
	import Avatar from '$lib/components/Avatar.svelte';
	import FilterMenu from '$lib/components/FilterMenu.svelte';
	import ListMenu from '$lib/components/ListMenu.svelte';
	import TaskDetailsEditor from '$lib/components/TaskDetailsEditor.svelte';
	import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
	import SgDialog from '$lib/components/SgDialog.svelte';
	import type { AuthState } from '$lib/components/auth';
	import type { DueDate } from '$lib/components/items';
	import { describe_item, remove_due_date, set_due_date } from '$lib/components/items';
	import {
		add_label_predicate,
		getLabelVisibility,
		queryHasId,
		remove_label_predicate,
		set_label_query
	} from '$lib/components/labels';
	import {
		accept_pending_share,
		create_label,
		create_list,
		delete_list,
		rename_list,
		revoke_share
	} from '$lib/components/lists';
	import { show_edit_dialog, show_item_detail_dialog } from '$lib/components/ui';
	import { emailToUid, getSharedUsers } from '$lib/components/users';
	import firebase from '$lib/firebase';
	import {
		logTime,
		store,
		discardLocalAction,
		writeCacheNow,
		observeConfirmedActions
	} from '$lib/store';
	import Button, { Label } from '@smui/button';
	import Checkbox from '@smui/checkbox';
	import { Actions } from '@smui/dialog';
	import Drawer, { AppContent, Content, Scrim, Subtitle } from '@smui/drawer';
	import IconButton, { Icon } from '@smui/icon-button';
	import List, { Graphic, Item, Subheader, Text } from '@smui/list';
	import Paper from '@smui/paper';
	import Textfield from '@smui/textfield';
	import TopAppBar, { Row, Section, Title } from '@smui/top-app-bar';
	import { onDestroy } from 'svelte';
	import ShareList from './ShareList.svelte';
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

	function createList(name: string) {
		newlyCreatedListId = crypto.randomUUID();
		firebase.dispatch(create_list({ id: newlyCreatedListId, name }));
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
	$: if ($store.ui.showEditDialog && !dialogOpen) {
		beginEditDialog();
	}
	let listName = '';
	$: if ($store.ui.title && !dialogOpen) {
		if (listName !== $store.ui.title) listName = $store.ui.title;
	}
	$: currentDocumentType = $store.lists.listIdToType[$store.ui.listId];
	$: visibleLabelIds = $store.lists.visibleLists.filter(
		(id: string) =>
			$store.lists.listIdToType[id] === 'label' &&
			getLabelVisibility($store.labels.labelIdToLabel[id]) !== 'fully_hidden'
	);
	$: showLabelControls = !!$store.ui.listId && currentDocumentType !== 'label';
	type DraftLabel = { id: string; name: string };
	let newLabelName = '';
	let initialDialogLabelIds: string[] = [];
	let selectedDialogLabelIds: string[] = [];
	let draftCreatedLabels: DraftLabel[] = [];

	function openEditDialog() {
		store.dispatch(show_edit_dialog(true));
		beginEditDialog();
	}

	function labelHasCurrentList(labelId: string) {
		return queryHasId($store.labels.labelIdToLabel[labelId]?.query, $store.ui.listId);
	}

	function getCurrentLabelIds() {
		return visibleLabelIds.filter((labelId: string) => labelHasCurrentList(labelId));
	}

	function initializeDialogState() {
		listName = $store.ui.title || '';
		selectedShareUsers = getSharedUsers().map((u: AuthState) => u.email || '');
		initialDialogLabelIds = getCurrentLabelIds();
		selectedDialogLabelIds = [...initialDialogLabelIds];
		draftCreatedLabels = [];
		newLabelName = '';
	}

	function beginEditDialog() {
		initializeDialogState();
		dialogOpen = true;
	}

	function dialogHasLabel(labelId: string) {
		return selectedDialogLabelIds.indexOf(labelId) !== -1;
	}

	function setDialogLabel(labelId: string, selected: boolean) {
		const selectedSet = new Set(selectedDialogLabelIds);
		if (selected) {
			selectedSet.add(labelId);
		} else {
			selectedSet.delete(labelId);
		}
		selectedDialogLabelIds = [...selectedSet];
	}

	function toggleDialogLabel(labelId: string) {
		setDialogLabel(labelId, !dialogHasLabel(labelId));
	}

	function createLabelForCurrentList() {
		const name = newLabelName.trim();
		if (name.length === 0) {
			return;
		}
		const labelId = crypto.randomUUID();
		draftCreatedLabels = [...draftCreatedLabels, { id: labelId, name }];
		setDialogLabel(labelId, true);
		newLabelName = '';
	}

	async function commitLabelChanges(uid: string, currentListId: string) {
		const selectedSet = new Set(selectedDialogLabelIds);
		const initialSet = new Set(initialDialogLabelIds);
		const draftLabelIds = new Set(draftCreatedLabels.map((label) => label.id));
		const predicate = { type: 'id' as const, id: currentListId };

		for (const labelId of initialDialogLabelIds) {
			if (!selectedSet.has(labelId)) {
				const action = remove_label_predicate({ label_id: labelId, predicate });
				store.dispatch(action);
				await dispatchLabelAction(labelId, uid, action);
			}
		}

		for (const labelId of selectedDialogLabelIds) {
			if (!initialSet.has(labelId) && !draftLabelIds.has(labelId)) {
				const action = add_label_predicate({ label_id: labelId, predicate });
				store.dispatch(action);
				await dispatchLabelAction(labelId, uid, action);
			}
		}

		for (const label of draftCreatedLabels) {
			if (!selectedSet.has(label.id)) {
				continue;
			}
			const createAction = create_label({ id: label.id, name: label.name });
			store.dispatch(createAction);
			await firebase.dispatch(createAction);
			await createFirebaseListActions(label.id, $store.auth, label.name);
			const queryAction = set_label_query({
				label_id: label.id,
				query: {
					type: 'or' as const,
					predicates: [predicate]
				}
			});
			store.dispatch(queryAction);
			await dispatchLabelAction(label.id, uid, queryAction);
		}
	}

	async function closeDialog() {
		const uid = $store.auth.uid;
		const id = $store.ui.listId;
		const name = listName;
		if (uid) {
			if (listName !== $store.ui.title) {
				const action = rename_list({ id, name });
				dispatch('lists', id, uid, action);
			}
			if (id) {
				await commitLabelChanges(uid, id);
			}
			const previousShares: string[] = getSharedUsers()
				.map((u: AuthState) => u.email || '')
				.sort();
			selectedShareUsers.sort();
			console.log({ previousShares, currentShares: selectedShareUsers });
			let pi = 0;
			let ci = 0;
			function revokeShare(dontShareWith: string) {
				console.log('routes/(app)/+layout.svelte: remove share for ' + dontShareWith);
				firebase.request(emailToUid($store.users, dontShareWith), revoke_share({ id }));
			}
			function grantShare(shareWith: string) {
				console.log('routes/(app)/+layout.svelte: new share for ' + shareWith);
				firebase.request(emailToUid($store.users, shareWith), accept_pending_share(id));
			}
			while (pi < previousShares.length && ci < selectedShareUsers.length) {
				if (previousShares[pi] === selectedShareUsers[ci]) {
					pi++;
					ci++;
				} else if (previousShares[pi] < selectedShareUsers[ci]) {
					// remove a previously granted share
					revokeShare(previousShares[pi]);
					pi++;
				} else {
					// grant a new share
					grantShare(selectedShareUsers[ci]);
					ci++;
				}
			}
			for (; pi < previousShares.length; ++pi) {
				revokeShare(previousShares[pi]);
			}
			for (; ci < selectedShareUsers.length; ++ci) {
				grantShare(selectedShareUsers[ci]);
			}
		}
		selectedShareUsers = [];
		initialDialogLabelIds = [];
		selectedDialogLabelIds = [];
		draftCreatedLabels = [];
		store.dispatch(show_edit_dialog(false));
		dialogOpen = false;
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

	function deleteList() {
		const id = $store.ui.listId;
		const uid = $store.auth.uid;
		if (uid) {
			dispatch('lists', id, uid, delete_list(id));
		}
		store.dispatch(show_edit_dialog(false));
		dialogOpen = false;
		const remainingLists = $store.lists.visibleLists.filter((x: string) => x !== id);
		if (remainingLists.length == 0) {
			setActive('profile');
		} else {
			setActive('lists?listId=' + remainingLists[0]);
		}
	}

	$: bgUrl = $store?.uiSettings?.backgroundUrl;
	$: bgStyle = bgUrl ? `url(${bgUrl})` : '';

	let selectedShareUsers: string[] = [];

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
		<TopAppBar variant="fixed">
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
					<SgDialog
						bind:open={dialogOpen}
						{cancelDialog}
						labelledby="editlist-dialog-title"
						describedby="editlist-dialog-content"
					>
						<!-- Title cannot contain leading whitespace due to mdc-typography-baseline-top() -->
						<div class="editlist-dialog-title-div">
							<Title id="editlist-dialog-title">Edit List</Title>
						</div>
						<Content id="editlist-dialog-content">
							<div class="editlist-dialog-content-div">
								<Paper variant="unelevated">
									<Textfield bind:value={listName} label="Name" />
								</Paper>
								<Paper variant="unelevated"
									><Subtitle>Share with:</Subtitle>
									<ShareList bind:selected={selectedShareUsers} />
								</Paper>
								{#if showLabelControls}
									<Paper variant="unelevated">
										<section class="labels-editor" aria-labelledby="labels-editor-title">
											<Subtitle id="labels-editor-title">Labels</Subtitle>
											{#if visibleLabelIds.length > 0}
												<div class="existing-labels">
													{#each visibleLabelIds as labelId (labelId)}
														<div class="label-row">
															<Checkbox
																checked={dialogHasLabel(labelId)}
																input$aria-label={`Include in ${$store.lists.listIdToList[labelId]}`}
																on:change={() => toggleDialogLabel(labelId)}
															/>
															<span>{$store.lists.listIdToList[labelId]}</span>
														</div>
													{/each}
												</div>
											{/if}
											{#each draftCreatedLabels as label (label.id)}
												<div class="label-row">
													<Checkbox
														checked={dialogHasLabel(label.id)}
														input$aria-label={`Include in ${label.name}`}
														on:change={() => toggleDialogLabel(label.id)}
													/>
													<span>{label.name}</span>
												</div>
											{/each}
											<div class="new-label-row">
												<Textfield bind:value={newLabelName} label="New label" />
												<Button
													on:click={createLabelForCurrentList}
													disabled={newLabelName.trim().length === 0}
												>
													<Label>Create label</Label>
												</Button>
											</div>
										</section>
									</Paper>
								{/if}
							</div>
						</Content>
						<Actions>
							<IconButton on:click={deleteList} class="material-icons">delete</IconButton>
							<Button on:click={cancelDialog}>
								<Label>Cancel</Label>
							</Button>
							<Button action="" on:click={closeDialog}>
								<Label>Done</Label>
							</Button>
						</Actions>
					</SgDialog>
				{/if}
			</div>
		</AppContent>
	</div>
{/await}

<style>
	:global(.mdc-top-app-bar) {
		padding-top: var(--safe-area-top);
		padding-left: var(--safe-area-left);
		padding-right: var(--safe-area-right);
		box-sizing: border-box;
	}
	:global(.mdc-drawer) {
		padding-top: var(--safe-area-top);
		padding-bottom: var(--safe-area-bottom);
		padding-left: var(--safe-area-left);
		padding-right: var(--safe-area-right);
		box-sizing: border-box;
	}
	:global(.mdc-drawer__content) {
		--drawer-icon-artwork-inset: 7px;
		--drawer-icon-inline-margin: 2px;
		--drawer-row-height: 40px;
		--drawer-row-inline-margin: 2px;
		display: flex;
		flex-direction: column;
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
		min-height: 100dvh;
		box-sizing: border-box;
		padding: calc(2rem + var(--safe-area-top)) calc(2rem + var(--safe-area-right))
			calc(2rem + var(--safe-area-bottom)) calc(2rem + var(--safe-area-left));
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
		height: 100dvh;
		max-width: 100vw;
		overflow: hidden;
		z-index: 0;
		flex-grow: 1;
	}

	* :global(.app-content) {
		position: relative;
		margin-top: calc(var(--app-content-offset) + var(--safe-area-top));
		padding: 0 var(--safe-area-right) var(--safe-area-bottom) var(--safe-area-left);
		min-width: 0;
		min-height: 0;

		display: flex;
		flex: auto;
	}

	.mobile-margin {
		margin-left: 0;
	}
	.desk-margin {
		margin-left: 256px;
	}
	.editlist-dialog-content-div {
		padding-left: 0.5em;
		padding-right: 0.5em;
	}

	.editlist-dialog-title-div {
		padding-top: 0.75em;
	}
	.label-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2.5rem;
	}
	.new-label-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
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
