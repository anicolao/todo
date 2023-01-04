<script lang="ts">
	console.log('Lists.svelte');
	import { create_list, delete_list, rename_list } from '$lib/components/lists';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import IconButton from '@smui/icon-button';
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
		return () => {
			if ($store.auth.uid) {
				dispatch('lists', list_id, $store.auth.uid, star_item({ list_id, id, starred }));
			}
		};
	}
	function completed(list_id: string, id: string, completed: boolean) {
		return () => {
			if ($store.auth.uid) {
				const completed_time = new Date().getTime();
				dispatch('lists', list_id, $store.auth.uid, complete_item({ list_id, id, completed, completed_time }));
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
			<button on:click={deleteList(listId)}>Trash</button>
		</li>
	{/each}
</ul>

{#if errorMessage}
	<p>{errorMessage}</p>
{/if}
