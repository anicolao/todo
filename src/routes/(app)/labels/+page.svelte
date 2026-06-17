<script lang="ts">
	console.log('routes/(app)/labels/+page.svelte');
	import { page } from '$app/stores';
	import ItemList from '$lib/components/ItemList.svelte';
	import ListToggleButton from '$lib/components/ListToggleButton.svelte';
	import { resolveLabelQuery } from '$lib/components/labels';
	import { set_current_listid, set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';

	$: labelId = $page.url.searchParams.get('labelId') || '';
	$: label = $store.labels.labelIdToLabel[labelId];
	$: entries = resolveLabelQuery(label?.query, $store.lists, $store.labels);
	$: if (labelId) {
		store.dispatch(set_icon('label'));
		store.dispatch(set_title($store.lists.listIdToList[labelId] || 'Label'));
		store.dispatch(set_current_listid(labelId));
	}

	function selectedList(selectedList: string) {
		return (id: string) => id === selectedList;
	}

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
	{#each entries as entry (entry.id)}
		{#if entry.inaccessible}
			<div class="inaccessible-list">{entry.name}</div>
		{:else}
			<ListToggleButton
				name={entry.name}
				showHide={hideCompleted[entry.id]}
				buttonAction={toggleCompleted(entry.id)}
			/>
			<ItemList
				listIdMatcher={selectedList(entry.id)}
				filter={completedItems(false)}
				show={!hideCompleted[entry.id]}
				bind:hasItems
			/>
		{/if}
	{/each}
</div>

<style>
	.container {
		width: 100%;
	}
	.inaccessible-list {
		padding: 1rem;
		font-weight: 600;
	}
</style>
