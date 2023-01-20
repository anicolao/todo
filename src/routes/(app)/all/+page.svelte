<script lang="ts">
	console.log('routes/(app)/starred/+page.svelte');
	import ItemList from '$lib/components/ItemList.svelte';
	import { set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';
	import Fab, { Label } from '@smui/fab';

	store.dispatch(set_icon('all_inclusive'));
	store.dispatch(set_title('All'));

	let listIds: string[] = [];
	$: listIds = $store.lists.visibleLists;

	function completedItems(completedFlag: boolean): (listId: string, id: string) => boolean {
		return (listId: string, id: string) => {
			const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[id];
			return item && item.completed === completedFlag;
		};
	}

	let hasItems = false;
	let hideCompleted: { [k: string]: boolean } = {};
	function toggleCompleted(listId: string) {
		return () => (hideCompleted[listId] = !hideCompleted[listId]);
	}
</script>

<div class="container">
	{#each listIds as listId}
		<ItemList
			listIdMatcher={(i) => i === listId}
			filter={completedItems(false)}
			show={!hideCompleted[listId]}
			bind:hasItems
		>
			{#if hasItems}
				<div class="toggleCompleted">
					<Fab on:click={toggleCompleted(listId)} extended
						><Label
							>{!hideCompleted[listId] ? 'Hide ' : 'Show '}{$store.lists.listIdToList[
								listId
							]}</Label
						></Fab
					>
				</div>
			{/if}
		</ItemList>
	{/each}
</div>

<style>
	.container {
		width: 100%;
	}
	.toggleCompleted {
		text-align: center;
		margin: 0.75em;
		opacity: 0.7;
	}
</style>
