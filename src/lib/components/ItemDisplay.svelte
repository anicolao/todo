<script lang="ts">
	console.log('ItemDisplay.svelte');
	import { dispatch } from '$lib/components/ActionLog';
	import { complete_item, describe_item, star_item, type TodoItem } from '$lib/components/items';
	import RepeatingDate from '$lib/components/RepeatingDate.svelte';
	import { store } from '$lib/store';
	import IconButton from '@smui/icon-button';
	import { Graphic, Item, Meta } from '@smui/list';
	import Textfield from '@smui/textfield';
	import { createEventDispatcher } from 'svelte';
	import { set_current_item, set_current_listid, show_item_detail_dialog } from './ui';

	type ExtendedTodoItem = TodoItem & { id: string };

	export let item: ExtendedTodoItem;
	export let listId = '';

	const dispatchEvent = createEventDispatcher();

	function showEditDetailsDialog(list_id: string, id: string) {
		return () => {
			if ($store.auth.uid) {
				store.dispatch(set_current_listid(list_id));
				store.dispatch(set_current_item(id));
				store.dispatch(show_item_detail_dialog(true));
			}
		};
	}

	function star(list_id: string, id: string, starred: boolean) {
		return () => {
			if ($store.auth.uid) {
				dispatch(
					'lists',
					list_id,
					$store.auth.uid,
					star_item({ list_id, id, starred, star_timestamp: new Date().getTime() })
				);
			}
		};
	}

	function complete(list_id: string, id: string, completed: boolean) {
		return () => {
			if ($store.auth.uid) {
				const completed_time = new Date().getTime();
				dispatch(
					'lists',
					list_id,
					$store.auth.uid,
					complete_item({ list_id, id, completed, completed_time })
				);
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
				const origItem = $store.items.listIdToListOfItems[list_id].itemIdToItem[item.id];
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
			><span
				><RepeatingDate
					on:click={() => console.log('Clicked!')}
					dueDate={item.dueDate}
				/><IconButton class="material-icons" on:click={showEditDetailsDialog(listId, item.id)}
					>edit_note</IconButton
				>{#if item.starred}<IconButton
						class="material-icons"
						on:click={star(listId, item.id, false)}>star</IconButton
					>{:else}<IconButton class="material-icons" on:click={star(listId, item.id, true)}
						>star_outline</IconButton
					>{/if}</span
			></Meta
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
	span {
		display: flex;
		align-items: center;
	}
</style>
