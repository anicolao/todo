<script lang="ts">
	console.log('routes/(app)/lists/+page.svelte');
	import { page } from '$app/stores';
	import { dispatch } from '$lib/components/ActionLog';
	import ItemList from '$lib/components/ItemList.svelte';
	import { create_item } from '$lib/components/items';
	import ListToggleButton from '$lib/components/ListToggleButton.svelte';
	import { set_current_listid, set_icon, set_title } from '$lib/components/ui';
	import { store } from '$lib/store';
	import { Icon } from '@smui/icon-button';
	import Textfield from '@smui/textfield';
	import { quintOut } from 'svelte/easing';
	import { crossfade } from 'svelte/transition';

	$: listId = $page.url.searchParams.get('listId') || 'hmph';
	$: if (listId) {
		store.dispatch(set_icon('list'));
		store.dispatch(set_title($store.lists.listIdToList[listId]));
		store.dispatch(set_current_listid(listId));
	}

	function addListItem(list_id: string, description: string) {
		if ($store.auth.uid) {
			const id = crypto.randomUUID();
			dispatch('lists', list_id, $store.auth.uid, create_item({ list_id, id, description }));
		}
	}

	let newItemText = '';

	function handleEnterKey(e: CustomEvent | KeyboardEvent) {
		e = e as KeyboardEvent;
		if (e.key === 'Enter') {
			addListItem(listId, newItemText);
			newItemText = '';
		}
	}

	const [send, receive] = crossfade({
		duration: (d) => 400,

		fallback(node, params) {
			const style = getComputedStyle(node);
			const transform = style.transform === 'none' ? '' : style.transform;

			return {
				duration: 600,
				easing: quintOut,
				css: (t) => `
					transform: ${transform} scale(${t});
					opacity: ${t}
				`
			};
		}
	});

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
	let showCompleted = false;
	function toggleCompleted() {
		showCompleted = !showCompleted;
	}
</script>

<div>
	<span
		><Textfield
			variant="filled"
			style="width: 100%"
			bind:value={newItemText}
			label="New task"
			enterkeyhint="enter"
			input$enterkeyhint="enter"
			on:keydown={handleEnterKey}
			><Icon class="material-icons" style="padding-left: 0.5em" slot="leadingIcon">add</Icon></Textfield
		></span
	><ItemList listIdMatcher={selectedList(listId)} filter={completedItems(false)} />
	<ItemList
		listIdMatcher={selectedList(listId)}
		filter={completedItems(true)}
		bind:hasItems
		show={showCompleted}
		>{#if hasItems}<ListToggleButton
				name="Completed Items"
				showHide={!showCompleted}
				buttonAction={toggleCompleted}
			/>{/if}
	</ItemList>
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
