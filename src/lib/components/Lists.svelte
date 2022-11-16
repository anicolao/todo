<script lang="ts">
	console.log('Lists.svelte');
	import {
		accept_pending_share,
		create_list,
		delete_list,
		register_pending_share,
		rename_list
	} from '$lib/components/lists';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import IconButton from '@smui/icon-button';
	import { doc, setDoc, type Unsubscribe } from 'firebase/firestore';
	import { onDestroy } from 'svelte';
	import { dispatch } from './ActionLog';
	import { complete_item, create_item, star_item } from './items';

	let errorMessage: string;

	let listName: string | undefined;

	function createNewList(event: any) {
		errorMessage = '';
		const name = event.srcElement.value;
		const id = crypto.randomUUID();
		console.log('on:edit Lists.svelte.createNewList ' + id);
		firebase.dispatch(create_list({ id, name }));
		listName = undefined;
	}

	function getUserById(id: string) {
		let users = $store.users.users.filter((x) => x.uid === id);
		return users[0];
	}

	$: latestListCount = $store.lists.visibleLists.length;
	let lastListCount = 0;
	let subscriptions: Unsubscribe[] = [];
	$: if (latestListCount > lastListCount) {
		console.log({ latestListCount, lastListCount });
		let numNewLists = latestListCount - lastListCount;
		const user = store.getState().auth;
		if (user.uid) {
			for (let i = 0; i < numNewLists; ++i) {
				const id = $store.lists.visibleLists[i];
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
					.catch((message) => {
						console.error(message);
					});
			}
			lastListCount = latestListCount;
		}
	}
	onDestroy(() => {
		subscriptions.forEach((unsub) => {
			console.log('UNSUBSCRIBE FROM LIST DETAIL...');
			unsub();
		});
		subscriptions = [];
	});

	function addListItem(list_id: string) {
		return (event: any) => {
			if ($store.auth.uid) {
				const description = event.srcElement.value;
				const id = crypto.randomUUID();
				dispatch('lists', list_id, $store.auth.uid, create_item({ list_id, id, description }));
			}
		};
	}

	function star(list_id: string, id: string, starred: boolean) {
		return (event: any) => {
			if ($store.auth.uid) {
				dispatch('lists', list_id, $store.auth.uid, star_item({ list_id, id, starred }));
			}
		};
	}
	function completed(list_id: string, id: string, completed: boolean) {
		return (event: any) => {
			if ($store.auth.uid) {
				dispatch('lists', list_id, $store.auth.uid, complete_item({ list_id, id, completed }));
			}
		};
	}

	function renameList(listId: string) {
		return (event: any) =>
			firebase.dispatch(rename_list({ id: listId, name: event.srcElement.value }));
	}

	function deleteList(listId: string) {
		return () => firebase.dispatch(delete_list(listId));
	}

	function shareList(listId: string, name: string, uid: string) {
		return () => firebase.request(uid, register_pending_share({ id: listId, name }));
	}

	function acceptPendingShare(listId: string) {
		return () => firebase.dispatch(accept_pending_share(listId));
	}
</script>

<label for="newListInput">New List:</label>
<input
	type="text"
	id="newListInput"
	bind:value={listName}
	placeholder="list name"
	on:change={createNewList}
/>
<ul>
	{#each $store.lists.visibleLists as listId (listId)}
		<li>
			<input type="text" value={$store.lists.listIdToList[listId]} on:change={renameList(listId)} />
			<ul>
				{#if $store.items.listIdToListOfItems[listId]}
					{#each $store.items.listIdToListOfItems[listId].itemIds as itemId (itemId)}
						<li>
							{#if $store.items.listIdToListOfItems[listId].itemIdToItem[itemId].completed}
								<IconButton class="material-icons" on:click={completed(listId, itemId, false)}
									>check_box</IconButton
								>
							{:else}
								<IconButton class="material-icons" on:click={completed(listId, itemId, true)}
									>check_box_outline_blank</IconButton
								>
							{/if}

							{$store.items.listIdToListOfItems[listId].itemIdToItem[itemId].description}

							{#if $store.items.listIdToListOfItems[listId].itemIdToItem[itemId].starred}
								<IconButton class="material-icons" on:click={star(listId, itemId, false)}
									>star</IconButton
								>
							{:else}
								<IconButton class="material-icons" on:click={star(listId, itemId, true)}
									>star_outline</IconButton
								>
							{/if}
						</li>
					{/each}
				{/if}
				<li>
					<input type="text" value="" on:change={addListItem(listId)} />
				</li>
			</ul>
			<p>
				{#each $store.users.users.filter((u) => u.uid != $store.auth.uid) as user (user.uid)}
					{#if user.uid}
						<button on:click={shareList(listId, $store.lists.listIdToList[listId], user.uid)}
							>Share list with {user.name}.</button
						>
					{/if}
				{/each}
			</p>
			<button on:click={deleteList(listId)}>Trash</button>
		</li>
	{/each}
</ul>

<ul>
	{#each $store.lists.pendingShares as { id, name, sharerId } (id)}
		<li>
			<button on:click={acceptPendingShare(id)}
				>Accept share of '{name}' from {getUserById(sharerId).name}</button
			>
		</li>
	{/each}
</ul>

{#if errorMessage}
	<p>{errorMessage}</p>
{/if}
