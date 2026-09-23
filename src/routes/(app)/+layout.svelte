<script lang="ts">
	console.log('routes/(app)/+layout.svelte');
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import AcceptShare from '$lib/components/AcceptShare.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import FilterMenu from '$lib/components/FilterMenu.svelte';
	import ListMenu from '$lib/components/ListMenu.svelte';
	import RouteTransitionContent from '$lib/components/RouteTransitionContent.svelte';
	import TaskDetailsEditor from '$lib/components/TaskDetailsEditor.svelte';
	import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
	import ListDetailsEditor from '$lib/components/ListDetailsEditor.svelte';
	import type { DueDate } from '$lib/components/items';
	import { describe_item, remove_due_date, set_due_date } from '$lib/components/items';
	import { create_list } from '$lib/components/lists';
	import { show_edit_dialog, show_item_detail_dialog } from '$lib/components/ui';
	import firebase from '$lib/firebase';
	import {
		hideOutgoingScreen,
		isTouchFormFactor,
		mobileScreenSlide,
		prefersReducedMotion,
		routeSnapshots,
		type ScreenMovement
	} from '$lib/mobile-transitions';
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
	import TopAppBar, { Row, Section, Title } from '@smui/top-app-bar';
	import { onDestroy, onMount } from 'svelte';
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
	let height = 0;
	const MOBILE_LAYOUT_WIDTH = 720;
	let touchFormFactor = false;
	let reducedMotion = false;
	let transitionsReady = false;
	let routeMovement: ScreenMovement = 'none';
	let routeTransitioning = false;
	let plannedNavigation = false;
	let snapshotTimer: ReturnType<typeof setTimeout> | undefined;

	$: mobilePortrait = touchFormFactor && height >= width;
	$: mobileLandscape = touchFormFactor && width > height;
	$: persistentDrawer = width > MOBILE_LAYOUT_WIDTH || mobileLandscape;
	$: drawerOpen = persistentDrawer;
	$: screenKey = `${$page.url.pathname}${$page.url.search}`;
	$: routeMotionEnabled = transitionsReady && touchFormFactor && !reducedMotion;

	function navigationId(url: URL) {
		return url.searchParams.get('listId') || url.searchParams.get('labelId') || '';
	}

	function navigationMovement(name: string, source?: HTMLElement): ScreenMovement {
		if (mobilePortrait && drawerOpen) return 'none';
		if (!mobileLandscape) return 'forward';

		const targetUrl = new URL('/' + name, window.location.origin);
		const currentId = navigationId($page.url);
		const targetId = navigationId(targetUrl);
		if (!currentId || !targetId || currentId === targetId) return 'forward';

		const currentRow = document.querySelector<HTMLElement>(
			`[data-navigation-id="${CSS.escape(currentId)}"][data-navigation-active="true"]`
		);
		const targetRow =
			source ||
			document.querySelector<HTMLElement>(`[data-navigation-id="${CSS.escape(targetId)}"]`);
		if (!currentRow || !targetRow) return 'forward';
		return targetRow.getBoundingClientRect().top > currentRow.getBoundingClientRect().top
			? 'up'
			: 'down';
	}

	let active: string;
	function setActive(name: string, keepDrawerOpen = false, source?: HTMLElement) {
		console.log('setActive ' + name);
		routeMovement = navigationMovement(name, source);
		plannedNavigation = true;
		drawerOpen = keepDrawerOpen || persistentDrawer;
		active = name;
		firebase.dispatch(set_current_url('/' + name));
		goto('/' + name);
	}

	function finishRouteTransition(event: Event) {
		const element = event.currentTarget as HTMLElement;
		if (element.dataset.screenKey === screenKey) routeTransitioning = false;
	}

	onMount(() => {
		const touchQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
		const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updatePreferences = () => {
			touchFormFactor = isTouchFormFactor();
			reducedMotion = prefersReducedMotion();
		};
		updatePreferences();
		transitionsReady = true;
		touchQuery.addEventListener('change', updatePreferences);
		motionQuery.addEventListener('change', updatePreferences);
		return () => {
			touchQuery.removeEventListener('change', updatePreferences);
			motionQuery.removeEventListener('change', updatePreferences);
		};
	});

	beforeNavigate((navigation) => {
		if (!navigation.to || !navigation.from) return;
		if (!plannedNavigation) {
			routeMovement = navigation.type === 'popstate' ? 'backward' : 'forward';
		}
		plannedNavigation = false;
		if (!transitionsReady || !touchFormFactor || reducedMotion || routeMovement === 'none') return;
		routeTransitioning = true;

		const fromKey = `${navigation.from.url.pathname}${navigation.from.url.search}`;
		const element = document.getElementById(
			`route-screen-${fromKey.replace(/[^a-zA-Z0-9-]/g, '_')}`
		);
		if (element) {
			routeSnapshots.update((snapshots) => ({
				...snapshots,
				[fromKey]: element.innerHTML
			}));
		}
	});

	afterNavigate(() => {
		if (snapshotTimer) clearTimeout(snapshotTimer);
		snapshotTimer = setTimeout(() => routeSnapshots.set({}), 350);
	});

	onDestroy(() => {
		if (snapshotTimer) clearTimeout(snapshotTimer);
	});

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
		height = window.innerHeight;
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

<svelte:window
	bind:innerWidth={width}
	bind:innerHeight={height}
	on:orientationchange={onOrientationChanged}
/>

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
	<div
		class="drawer-container w{width}"
		class:mobile-portrait={mobilePortrait}
		class:mobile-landscape={mobileLandscape}
		class:drawer-open={drawerOpen}
	>
		<TopAppBar variant="fixed">
			<Row>
				<div class={persistentDrawer ? 'desk-margin' : 'mobile-margin'}>
					<Section>
						{#if !persistentDrawer}
							<IconButton
								class="material-icons"
								aria-label="Open navigation menu"
								on:click={() => (drawerOpen = !drawerOpen || persistentDrawer)}>menu</IconButton
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
			variant={persistentDrawer ? undefined : 'modal'}
			fixed={persistentDrawer ? undefined : false}
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
				<div class="route-stage" class:transition-active={routeTransitioning}>
					{#if routeMotionEnabled}
						{#key screenKey}
							<div
								class="route-screen"
								data-screen-key={screenKey}
								data-transition-direction={routeMovement}
								in:mobileScreenSlide={{ movement: routeMovement, phase: 'in' }}
								out:mobileScreenSlide={{ movement: routeMovement, phase: 'out' }}
								on:introend={finishRouteTransition}
								on:outrostart={hideOutgoingScreen}
							>
								<RouteTransitionContent {screenKey}><slot /></RouteTransitionContent>
							</div>
						{/key}
					{:else}
						<div class="route-screen" data-transition-direction="none"><slot /></div>
					{/if}
				</div>
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
	.drawer-container.mobile-portrait :global(.mdc-drawer--modal) {
		max-width: 100vw;
		width: 100vw;
	}
	.drawer-container.mobile-portrait :global(.mdc-top-app-bar),
	.drawer-container.mobile-portrait :global(.app-content) {
		transition: transform 280ms cubic-bezier(0.215, 0.61, 0.355, 1);
		will-change: transform;
	}
	.drawer-container.mobile-portrait.drawer-open :global(.mdc-top-app-bar),
	.drawer-container.mobile-portrait.drawer-open :global(.app-content) {
		transform: translate3d(100vw, 0, 0);
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
		min-height: 0;
		min-width: 0;
		overflow: auto;

		background-size: cover;
	}
	.route-stage {
		display: contents;
	}
	.route-screen {
		display: contents;
	}
	.route-stage.transition-active {
		display: grid;
		flex: 1 1 auto;
		grid-template-areas: 'screen';
		min-height: 0;
		min-width: 0;
		overflow: hidden;
	}
	.route-stage.transition-active > .route-screen {
		display: block;
		grid-area: screen;
		min-height: 0;
		min-width: 0;
		overflow: auto;
		width: 100%;
	}

	@media (prefers-reduced-motion: reduce) {
		.drawer-container.mobile-portrait :global(.mdc-top-app-bar),
		.drawer-container.mobile-portrait :global(.app-content) {
			transition-duration: 0ms;
		}
	}
</style>
