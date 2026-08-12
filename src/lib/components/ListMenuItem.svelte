<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import IconButton from '@smui/icon-button';
	import { Item, Text } from '@smui/list';
	import ListIcon from './ListIcon.svelte';
	import SharedListIcon from './SharedListIcon.svelte';
	import { accept_request, reject_request } from './requests';
	import { show_edit_dialog } from './ui';
	import { getSharedUsers } from './users';

	$: pageListId = $page.url.searchParams.get('listId') || 'hmph';

	export let listId: string | undefined = undefined;
	export let requestId = '';
	export let sharerId = '';
	export let nested = false;
	export let viaLabelId = '';
	export let labelExpanded = false;
	export let labelPinned = false;
	export let setActive: (name: string, keepDrawerOpen?: boolean) => void = (name: string) => {
		console.log('ListMenuItem.setActive DEFAULT goto ' + name);
		goto('/' + name);
	};
	export let onTogglePinnedLabel: (listId: string) => void = () => {};
	export let openEditDialog = () => {
		store.dispatch(show_edit_dialog(true));
	};

	let isShared = false;

	let lastCompletedRequests: any = undefined;
	let lastUserList: any = undefined;
	function setIsShared(completedRequests: any) {
		if (completedRequests !== lastCompletedRequests || lastUserList !== $store.users.users) {
			isShared = getSharedUsers(listId).length > 0;
			lastCompletedRequests = completedRequests;
			lastUserList = $store.users.users;
		}
	}

	setIsShared($store.requests.completedRequests);
	$: setIsShared($store.requests.completedRequests);

	function gotoList(listId: string) {
		return () => {
			// A real drag captures the pointer on the container, so this pointerup
			// only fires for taps — navigate regardless of how long the press was.
			const isLabel = $store.lists.listIdToType[listId] === 'label';
			if (isLabel) {
				setActive(`labels?labelId=${encodeURIComponent(listId)}`);
			} else {
				const via = viaLabelId ? `&via=${encodeURIComponent(viaLabelId)}` : '';
				setActive(`lists?listId=${encodeURIComponent(listId)}${via}`);
			}
		};
	}
	$: pageLabelId = $page.url.searchParams.get('labelId') || 'hmph';
	$: activated = pageListId === listId || pageLabelId === listId;

	function acceptPendingShare() {
		return () => {
			const accept = accept_request({ id: requestId });
			firebase.request(sharerId, accept);
			firebase.dispatch(accept);
			firebase.dispatch($store.requests.requestIdToRequest[requestId]);
		};
	}

	function rejectPendingShare() {
		return () => {
			const reject = reject_request({ id: requestId });
			firebase.request(sharerId, reject);
			firebase.dispatch(reject);
		};
	}

	function stopEvent(e: Event) {
		e.stopPropagation();
	}

	function handleOpenEditDialog(e: Event) {
		e.stopPropagation();
		openEditDialog();
	}

	function handleTogglePinnedLabel(e: Event) {
		e.stopPropagation();
		if (listId) {
			onTogglePinnedLabel(listId);
		}
	}
</script>

{#if listId}
	<div class="list-menu-item" class:nested>
		<Item
			on:pointerup={gotoList(listId)}
			{activated}
			draggable="false"
			aria-expanded={$store.lists.listIdToType[listId] === 'label' ? labelExpanded : undefined}
		>
			{#if $store.lists.listIdToType[listId] === 'label'}
				<img class="sidebar-row-icon" src="/new/label.svg" alt="" />
			{:else if isShared}
				<SharedListIcon />
			{:else}
				<ListIcon />
			{/if}
			<Text>{$store.lists.listIdToList[listId]}</Text>
		</Item>
		{#if $store.lists.listIdToType[listId] === 'label' && labelExpanded}
			<div class="list-menu-actions">
				<button
					type="button"
					aria-label={`${labelPinned ? 'Unpin' : 'Pin'} label ${$store.lists.listIdToList[listId]}`}
					title={`${labelPinned ? 'Unpin' : 'Pin'} label`}
					class="list-pin-button"
					on:pointerdown={stopEvent}
					on:mousedown={stopEvent}
					on:pointerup|stopPropagation
					on:click={handleTogglePinnedLabel}
					><img src={labelPinned ? '/new/unpin.svg' : '/new/pin.svg'} alt="" /></button
				>
			</div>
		{/if}
		{#if activated}
			<div class="list-menu-actions">
				{#if sharerId === ''}
					<button
						type="button"
						aria-label="Edit list"
						class="list-edit-button"
						on:pointerdown={handleOpenEditDialog}
						on:mousedown={handleOpenEditDialog}
						on:pointerup|stopPropagation
						on:click={handleOpenEditDialog}><img src="/new/edit.svg" alt="" /></button
					>
				{:else}
					<IconButton
						class="material-icons"
						on:pointerdown={stopEvent}
						on:pointerup={stopEvent}
						on:click={(e) => {
							stopEvent(e);
							acceptPendingShare()();
						}}>check</IconButton
					><IconButton
						class="material-icons"
						on:pointerdown={stopEvent}
						on:pointerup={stopEvent}
						on:click={(e) => {
							stopEvent(e);
							rejectPendingShare()();
						}}>close</IconButton
					>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	.list-menu-item {
		align-items: stretch;
		display: flex;
		width: 100%;
	}
	.list-menu-item :global(.mdc-deprecated-list-item) {
		flex: 1 1 auto;
		min-width: 0;
	}
	.list-menu-item.nested :global(.mdc-deprecated-list-item) {
		min-height: 40px;
		padding-left: 8px;
	}
	.sidebar-row-icon {
		display: block;
		flex: 0 0 auto;
	}
	.list-menu-actions {
		align-items: center;
		display: flex;
		flex: 0 0 auto;
		min-width: 48px;
	}
	.list-edit-button {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: 50%;
		color: inherit;
		cursor: pointer;
		display: inline-flex;
		height: 48px;
		justify-content: center;
		padding: 0;
		width: 48px;
	}
	.list-pin-button {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: 50%;
		color: inherit;
		cursor: pointer;
		display: inline-flex;
		height: 48px;
		justify-content: center;
		padding: 0;
		width: 48px;
	}
	.list-edit-button img,
	.list-pin-button img {
		display: block;
		height: 20px;
		width: 30px;
	}
</style>
