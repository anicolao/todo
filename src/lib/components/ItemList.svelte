<script lang="ts">
	import { page } from '$app/stores';
	import { dispatch } from '$lib/components/ActionLog';
	import {
		complete_item,
		create_item,
		describe_item,
		star_item,
		type TodoItem
	} from '$lib/components/items';
	import { store } from '$lib/store';
	import IconButton, { Icon } from '@smui/icon-button';
	import Textfield from '@smui/textfield';
	import List, { Item, Meta, Graphic } from '@smui/list';
	import type { CrossfadeParams, TransitionConfig } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import Button from '@smui/button';

	export let listId = '';
	export let completed = false;
	export let send: (
		node: Element,
		params: CrossfadeParams & { key: any }
	) => () => TransitionConfig;
	export let receive: (
		node: Element,
		params: CrossfadeParams & { key: any }
	) => () => TransitionConfig;

	function star(list_id: string, id: string, starred: boolean) {
		return (event: any) => {
			if ($store.auth.uid) {
				dispatch('lists', list_id, $store.auth.uid, star_item({ list_id, id, starred }));
			}
		};
	}

	function complete(list_id: string, id: string, completed: boolean) {
		return (event: any) => {
			if ($store.auth.uid) {
				dispatch('lists', list_id, $store.auth.uid, complete_item({ list_id, id, completed }));
			}
		};
	}

	let items: (TodoItem & { id: string })[] = [];
	$: if ($store.items.listIdToListOfItems[listId]) {
		items = [];
		$store.items.listIdToListOfItems[listId].itemIds.forEach((itemId, i) => {
			const item = $store.items.listIdToListOfItems[listId].itemIdToItem[itemId];
			if (item.completed === completed) {
				items.push({ ...item, id: itemId, description: item.description });
			}
		});
	}

	let show = false;
	function toggleCompleted() {
		show = !show;
	}

	function handleEnterKey(list_id: string, item: TodoItem & { id: string }) {
		return (e: KeyboardEvent | CustomEvent) => {
			e = e as KeyboardEvent;
			if (e.key === 'Enter') {
				const target = e.target as HTMLInputElement;
				target.blur();
			}
		};
	}
	function handleBlur(list_id: string, item: TodoItem & { id: string }) {
		return (e: CustomEvent) => {
			console.log('blur event', e);
			console.log('value', e.detail.target.value);
			if ($store.auth.uid) {
				const target = e.target as HTMLInputElement;
				dispatch(
					'lists',
					list_id,
					$store.auth.uid,
					describe_item({ list_id, id: item.id, description: e.detail.target.value || '' })
				);
			}
		};
	}
</script>

{#if items.length > 0}{#if completed}<Button on:click={toggleCompleted}
			>{show ? 'Hide ' : 'Show '}Completed Items</Button
		>{/if}{#if show || completed === false}<List
			>{#each items as item (item.id)}<div
					in:receive={{ key: item.id }}
					out:send={{ key: item.id }}
					animate:flip={{ duration: 200 }}
				>
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
							on:keydown={handleEnterKey(listId, item)}
							on:blur={handleBlur(listId, item)}
						/><Meta
							>{#if item.starred}<IconButton
									class="material-icons"
									on:click={star(listId, item.id, false)}>star</IconButton
								>{:else}<IconButton class="material-icons" on:click={star(listId, item.id, true)}
									>star_outline</IconButton
								>{/if}</Meta
						></Item
					>
				</div>{/each}</List
		>{/if}{/if}
