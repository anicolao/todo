<script lang="ts">
	console.log('routes/(app)/starred/+page.svelte');
	import ItemList from '$lib/components/ItemList.svelte';
	import ListToggleButton from '$lib/components/ListToggleButton.svelte';
	import { set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';
	import { Icon } from '@smui/icon-button';
	import Textfield from '@smui/textfield';

	store.dispatch(set_icon('search'));
	store.dispatch(set_title('Search'));

	let listIds: string[] = [];
	$: listIds = $store.lists.visibleLists;

	function searchedItems(query: string): (listId: string, id: string) => boolean {
		const queryLC = query.toLocaleLowerCase('en-US');
		return (listId: string, id: string) => {
			const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[id];
			return (
				item && !item.completed && item.description.toLocaleLowerCase('en-US').includes(queryLC)
			);
		};
	}

	let hasItems = false;
	let hideCompleted: { [k: string]: boolean } = {};
	function toggleCompleted(listId: string) {
		return () => (hideCompleted[listId] = !hideCompleted[listId]);
	}

	let query: string = '';
	let searchText: string = '';

	$: if (searchText || !searchText) {
		search();
	}

	let queuedSearchId: NodeJS.Timeout;

	function search() {
		clearTimeout(queuedSearchId); // does nothing if the id is invalid.
		// A small delay when typing short words avoids slow responses, and lets
		// typing happen more naturally.  (Remove if/when that speeds up.)
		let delay = searchText.length > 3 ? 0 : 1000;
		queuedSearchId = setTimeout(() => {
			console.log('Search for <' + searchText + '>');
			query = searchText;
			listIds = listIds;
		}, delay);
	}
</script>

<div>
	<span
		><Textfield variant="filled" style="width: 100%" bind:value={searchText} label="Search"
			><Icon class="material-icons" style="padding-left: 0.5em" slot="leadingIcon">search</Icon
			></Textfield
		></span
	>{#each listIds as listId}
		<ItemList
			listIdMatcher={(i) => i === listId}
			filter={searchedItems(query)}
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
	span {
		display: block;
		position: sticky;
		top: 0;
		z-index: 1;
	}
</style>
