<script lang="ts">
	import firebase from '$lib/firebase';
	import { create_list, delete_list, rename_list } from '$lib/components/lists';
	import { store } from '$lib/store';

	let errorMessage: string;

	let listName: string | undefined;

	function createNewList(event: any) {
		errorMessage = '';
		let name = event.srcElement.value;
		firebase.dispatch(create_list({ id: crypto.randomUUID(), name: name }));
		listName = undefined;
	}

	function renameList(listId: string) {
		return (event: any) => firebase.dispatch(rename_list({ id: listId, name: event.srcElement.value }));
	}

	function deleteList(listId: string) {
		return () => firebase.dispatch(delete_list(listId));
	}
</script>

<label for="newListInput">New List:</label>
<input type="text" id="newListInput" bind:value={listName} placeholder="list name" on:change={createNewList} />
<ul>
	{#each $store.lists.visibleLists as listId}
		<li>
			<input type="text" value={$store.lists.listIdToList[listId]} on:change={renameList(listId)} />
			<button on:click={deleteList(listId)}>Trash</button>
		</li>
	{/each}
</ul>

{#if errorMessage}
	<p>{errorMessage}</p>
{/if}
