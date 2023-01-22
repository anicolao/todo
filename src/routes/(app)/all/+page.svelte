<script lang="ts">
	console.log('routes/(app)/starred/+page.svelte');
	import ItemList from '$lib/components/ItemList.svelte';
	import ListToggleButton from '$lib/components/ListToggleButton.svelte';
	import { set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';

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

<div>
	{#each listIds as listId}
		<ItemList
			listIdMatcher={(i) => i === listId}
			filter={completedItems(false)}
			show={!hideCompleted[listId]}
			bind:hasItems
			>{#if hasItems}<ListToggleButton
					name={$store.lists.listIdToList[listId]}
					showHide={hideCompleted[listId]}
					buttonAction={toggleCompleted(listId)}
				/>{/if}
		</ItemList>
	{/each}
</div>

<style>
	div {
		width: 100%;
	}
</style>
