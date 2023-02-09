<script lang="ts">
	console.log('ItemDisplay.svelte');
	import { dispatch } from '$lib/components/ActionLog';
	import Card from '@smui/card';
	import { complete_item, describe_item, star_item, type TodoItem } from '$lib/components/items';
	import RepeatingDate from '$lib/components/RepeatingDate.svelte';
	import { store } from '$lib/store';
	import { Label } from '@smui/common';
	import IconButton from '@smui/icon-button';
	import { Graphic, Item, Meta } from '@smui/list';
	import Textfield from '@smui/textfield';
	import { createEventDispatcher } from 'svelte';
	import { set_current_item, set_current_listid, show_item_detail_dialog } from './ui';

	type ExtendedTodoItem = TodoItem & { id: string };

	export let item: ExtendedTodoItem;
	export let listId = '';
	export let showListName = false;

	let listName = '';
	$: if (listId !== '') {
		listName = $store.lists.listIdToList[listId];
		listName = listName.replaceAll(' ', '\u00a0');
	}

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
			dispatchEvent('blur', { originalEvent: e });
			if ($store.auth.uid) {
				const origItem = $store.items.listIdToListOfItems[list_id].itemIdToItem[item.id];
				const description = e.detail.target.value || '';
				if (description !== origItem.description) {
					dispatch(
						'lists',
						list_id,
						$store.auth.uid,
						describe_item({
							list_id,
							id: item.id,
							orig_description: origItem.description,
							description
						})
					);
				}
			}
		};
	}
</script>

<div class="container">
	<Card>
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
				enterkeyhint="enter"
				input$enterkeyhint="enter"
				on:blur={handleBlur(listId, item)}
				on:focus={(e) => dispatchEvent('focus', { originalEvent: e })}
			/><Meta
				><span
					><span class="itemInfo"
						><RepeatingDate on:click={() => console.log('Clicked!')} dueDate={item.dueDate} />
						{#if showListName}<Label>{listName}</Label>{/if}</span
					>
					<IconButton class="material-icons" on:click={showEditDetailsDialog(listId, item.id)}
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
	</Card>
</div>

<style>
	div {
		border-radius: 0.3em;
		margin: 0.25em;
		opacity: 0.9;
	}
	span {
		display: flex;
		align-items: center;
	}
	.itemInfo {
		display: block;
		color: var(--mdc-theme-primary, rgba(0, 0, 0, 0.7));
	}
</style>
