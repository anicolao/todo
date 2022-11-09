<script lang="ts">
	console.log('routes/(app)/lists/+page.svelte');
	import { page } from '$app/stores';
	import { dispatch } from '$lib/components/ActionLog';
	import ItemList from '$lib/components/ItemList.svelte';
	import { create_item } from '$lib/components/items';
	import { store } from '$lib/store';
	import { Icon } from '@smui/icon-button';
	import Textfield from '@smui/textfield';
	import { crossfade } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { set_icon, set_title } from '$lib/components/ui';

	$: listId = $page.url.searchParams.get('listId') || 'hmph';
	$: if (listId) {
		store.dispatch(set_icon('list'))
		store.dispatch(set_title($store.lists.listIdToList[listId]))
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
</script>

<div class="container">
	<Textfield
		style="width: 100%"
		bind:value={newItemText}
		label="New task"
		on:keydown={handleEnterKey}
		><Icon class="material-icons" slot="leadingIcon">add</Icon></Textfield
	><ItemList {listId} {send} {receive} /><ItemList {listId} {send} {receive} completed={true} />
</div>

<style>
	.container {
		width: 100%;
	}
</style>
