<script lang="ts">
	console.log('routes/(app)/starred/+page.svelte');
	import ItemList from '$lib/components/ItemList.svelte';
	import { set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';
	import Fab, { Label } from '@smui/fab';
	import Textfield from '@smui/textfield';
	import { Icon } from '@smui/icon-button';

	store.dispatch(set_icon('search'));
	store.dispatch(set_title('Search'));

	let listIds: string[] = [];
	$: listIds = $store.lists.visibleLists;

	function searchedItems(query: string): (listId: string, id: string) => boolean {
		return (listId: string, id: string) => {
			const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[id];
			return item && !item.completed && item.description.indexOf(query) !== -1;
		};
	}

	let hasItems = false;
	let hideCompleted: { [k: string]: boolean } = {};
	function toggleCompleted(listId: string) {
		return () => (hideCompleted[listId] = !hideCompleted[listId]);
	}

	let searchText: string = '';
	$: if (searchText || !searchText) {
		listIds = listIds;
		console.log(searchText)
	}
</script>

<div class="container">
	<span
		><Textfield style="width: 100%" bind:value={searchText} label="Search"
			><Icon class="material-icons" slot="leadingIcon">search</Icon></Textfield
		></span
	>{#each listIds as listId}
		<ItemList
			listIdMatcher={(i) => i === listId}
			filter={searchedItems(searchText)}
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
	span {
		background-color: #fafaf0;
		margin: 0em;
		padding-left: 1em;
		display: block;
		position: sticky;
		top: 0;
		z-index: 1;
	}
</style>
