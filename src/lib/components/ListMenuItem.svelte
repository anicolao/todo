<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import firebase from '$lib/firebase';
	import { logTime, store } from '$lib/store';
	import IconButton from '@smui/icon-button';
	import { Item, Meta, Text } from '@smui/list';
	import { doc, getDoc, setDoc, type Unsubscribe } from 'firebase/firestore';
	import { onDestroy } from 'svelte';
	import { watch } from './ActionLog';
	import ListIcon from './ListIcon.svelte';
	import { rename_list } from './lists';
	import { accept_request, reject_request } from './requests';
	import { show_edit_dialog } from './ui';

	$: pageListId = $page.url.searchParams.get('listId') || 'hmph';

	export let listId: string | undefined = undefined;
	export let requestId = '';
	export let sharerId = '';
	export let setActive: (name: string) => void = (name: string) => {
		console.log('ListMenuItem.setActive DEFAULT goto ' + name);
		goto('/' + name);
	};

	function gotoList(listId: string) {
		return () => {
			const duration = new Date().getTime() - navigationTimeout;
			if (duration < 600) {
				setActive(`lists/?listId=${listId}`);
			}
		};
	}
	$: activated = pageListId === listId;

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

	let navigationTimeout = 0;
</script>

{#if listId}
	<Item
		href="javascript:void(0)"
		on:touchstart={(e) => {
			navigationTimeout = new Date().getTime();
		}}
		on:pointerdown={(e) => {
			navigationTimeout = new Date().getTime();
		}}
		on:pointerup={gotoList(listId)}
		{activated}
		draggable="false"
	>
		<ListIcon />
		<Text>{$store.lists.listIdToList[listId]}</Text>
		{#if activated}
			<Meta
				>{#if sharerId === ''}<IconButton
						class="material-icons"
						on:click={() => store.dispatch(show_edit_dialog(true))}>edit</IconButton
					>{:else}<div>
						<IconButton class="material-icons" on:click={acceptPendingShare()}>check</IconButton
						><IconButton class="material-icons" on:click={rejectPendingShare()}>close</IconButton>
					</div>{/if}</Meta
			>
		{/if}
	</Item>
{/if}

<style>
	div {
		min-width: 96px; /* 2 x icon width. */
	}
</style>
