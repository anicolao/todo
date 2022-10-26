<script lang="ts">
	import { page } from '$app/stores';
	import { dispatch } from '$lib/components/ActionLog';
	import { complete_item, create_item, star_item } from '$lib/components/items';
	import { store } from '$lib/store';
	import IconButton from '@smui/icon-button';

	$: listId = $page.url.searchParams.get('listId') || 'hmph';

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
</script>

<ul>
	{#if $store.items.listIdToListOfItems[listId]}
		{#each $store.items.listIdToListOfItems[listId].itemIds as itemId}
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
					<IconButton class="material-icons" on:click={star(listId, itemId, false)}>star</IconButton
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
