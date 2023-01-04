<script lang="ts">
	console.log('ItemDisplay.svelte');
	import { dispatch } from '$lib/components/ActionLog';
	import { complete_item, describe_item, star_item, type TodoItem } from '$lib/components/items';
	import { store } from '$lib/store';
	import IconButton from '@smui/icon-button';
	import { Graphic, Item, Meta } from '@smui/list';
	import Textfield from '@smui/textfield';
	import { createEventDispatcher } from 'svelte';

	type ExtendedTodoItem = TodoItem & { id: string };

	export let item: ExtendedTodoItem;
	export let listId = '';

	const dispatchEvent = createEventDispatcher();

	function star(list_id: string, id: string, starred: boolean) {
		return () => {
			if ($store.auth.uid) {
				dispatch('lists', list_id, $store.auth.uid, star_item({ list_id, id, starred }));
			}
		};
	}

	function complete(list_id: string, id: string, completed: boolean) {
		return () => {
			if ($store.auth.uid) {
				const completed_time = new Date().getTime();
				dispatch('lists', list_id, $store.auth.uid, complete_item({ list_id, id, completed, completed_time }));
			}
		};
	}

	function handleEnterKey(e: KeyboardEvent | CustomEvent) {
		e = e as KeyboardEvent;
		if (e.key === 'Enter') {
			const target = e.target as HTMLInputElement;
			target.blur();
		}
	}

	function handleBlur(list_id: string, item: TodoItem & { id: string }) {
		return (e: CustomEvent) => {
			console.log('blur event', e);
			dispatchEvent('blur', { originalEvent: e });
			console.log('value', e.detail.target.value);
			if ($store.auth.uid) {
				const origItem = $store.items.listIdToListOfItems[listId].itemIdToItem[item.id];
				dispatch(
					'lists',
					list_id,
					$store.auth.uid,
					describe_item({
						list_id,
						id: item.id,
						orig_description: origItem.description,
						description: e.detail.target.value || ''
					})
				);
			}
		};
	}
</script>

<div>
	<Item
		><Graphic
			>{#if item.completed}<IconButton
					class="material-icons"
					on:click={complete(listId, item.id, false)}>check_box</IconButton
				>
			{:else}
				<IconButton class="material-icons" on:click={complete(listId, item.id, true)}
					>check_box_outline_blank</IconButton
				>
			{/if}
		</Graphic><Textfield
			style="width: 100%"
			value={item.description}
			on:keydown={handleEnterKey}
			on:blur={handleBlur(listId, item)}
			on:focus={(e) => dispatchEvent('focus', { originalEvent: e })}
		/><Meta
			>{#if item.starred}<IconButton class="material-icons" on:click={star(listId, item.id, false)}
					>star</IconButton
				>{:else}<IconButton class="material-icons" on:click={star(listId, item.id, true)}
					>star_outline</IconButton
				>{/if}</Meta
		></Item
	>
</div>

<style>
	div {
		background-color: #fafaf0;
		border-radius: 0.3em;
		margin: 0.25em;
		opacity: 0.9;
	}
</style>
