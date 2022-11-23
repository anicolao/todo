<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import IconButton from '@smui/icon-button';
	import { Item, Meta, Text } from '@smui/list';
	import { doc, setDoc, type Unsubscribe } from 'firebase/firestore';
	import { onDestroy } from 'svelte';
	import { watch } from './ActionLog';
	import ListIcon from './ListIcon.svelte';
	import { accept_pending_share, rename_list } from './lists';
	import { show_edit_dialog } from './ui';

	$: pageListId = $page.url.searchParams.get('listId') || 'hmph';

	export let listId: string | undefined = undefined;
	export let sharing = false;

	let unsub: Unsubscribe | undefined;
	if (listId) {
		if (unsub) {
			unsub();
			unsub = undefined;
		}

		const user = $store.auth;
		if (user.uid) {
			const id = listId;
			const name = $store.lists.listIdToList[id];
			console.log('Create new list for ', id);
			setDoc(doc(firebase.firestore, 'editors', id, user.uid, 'editor'), { email: user.email })
				.then(() => {
					console.log('Create new actions for ', id);
					if (name === undefined) {
						// this one isn't our own list.-
						console.log(`No need to create actions for ${id}`);
						return;
					}
					return setDoc(doc(firebase.firestore, 'lists', id, 'actions', 'name'), {
						...rename_list({ id, name }),
						timestamp: 0
					});
				})
				.then(() => {
					unsub = watch('lists', id);
				})
				.catch((message) => {
					console.error(message);
				});
		}
	}

	onDestroy(() => {
		if (unsub) unsub();
	});

	function gotoList(listId: string) {
		return () => goto(`/lists/?listId=${listId}`);
	}
	$: activated = pageListId === listId;

	function acceptPendingShare(id: string) {
		return () => firebase.dispatch(accept_pending_share(id));
	}
</script>

{#if listId}
	<Item href="javascript:void(0)" on:click={gotoList(listId)} {activated}>
		<ListIcon />
		<Text>{$store.lists.listIdToList[listId]}</Text>
		{#if activated}
			<Meta
				>{#if !sharing}<IconButton
						class="material-icons"
						on:click={() => store.dispatch(show_edit_dialog(true))}>edit</IconButton
					>{:else}<IconButton class="material-icons" on:click={acceptPendingShare(listId)}
						>check</IconButton
					>{/if}</Meta
			>
		{/if}
	</Item>
{/if}
