<script lang="ts">
	import { page } from '$app/stores';
	import { dispatch } from '$lib/components/ActionLog';
	import {
		complete_item,
		create_item,
		describe_item,
		reorder_item,
		star_item,
		type ListOfItems,
		type TodoItem
	} from '$lib/components/items';
	import { store } from '$lib/store';
	import IconButton, { Icon } from '@smui/icon-button';
	import Textfield from '@smui/textfield';
	import List, { Item, Meta, Graphic } from '@smui/list';
	import type { CrossfadeParams, TransitionConfig } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import Button from '@smui/button';
	import ItemDisplay from './ItemDisplay.svelte';

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

	type ExtendedTodoItem = TodoItem & { id: string };
	let items: ExtendedTodoItem[] = [];
	let dragTo: ExtendedTodoItem;
	let lastListOfItems: ListOfItems | undefined = undefined;
	$: if ($store.items.listIdToListOfItems[listId]) {
		if (lastListOfItems !== $store.items.listIdToListOfItems[listId]) {
			lastListOfItems = $store.items.listIdToListOfItems[listId];
			items = [];
			$store.items.listIdToListOfItems[listId].itemIds.forEach((itemId, i) => {
				const item = $store.items.listIdToListOfItems[listId].itemIdToItem[itemId];
				if (item.completed === completed) {
					items.push({ ...item, id: itemId, description: item.description });
				}
			});
		}
	}

	let show = false;
	function toggleCompleted() {
		show = !show;
	}

	let ghost: Element;
	let anchor: Element;
	type ExtendedElement = Element | { dataset: { grabY: number } };
	let grabbed: ExtendedElement;
	let grabbedItem: ExtendedTodoItem;
	let lastTarget: Element;

	let mouseY = 0; // pointer y coordinate within client
	let offsetY = 0; // y distance from top of grabbed element to pointer
	let layerY = 0; // distance from top of list to top of client

	let dragTimeElapsed = false;

	function grab(clientY: number, element: Element) {
		// modify grabbed element
		grabbed = element as ExtendedElement;
		grabbed.dataset.grabY = clientY;

		grabbedItem = items[grabbed.dataset.index];
		// record offset from cursor to top of element
		// (used for positioning ghost)
		offsetY = grabbed.getBoundingClientRect().y - clientY;
		drag(clientY);
		window.setTimeout(() => (dragTimeElapsed = true), 400);
	}

	// drag handler updates cursor position
	function drag(clientY) {
		if (grabbed) {
			mouseY = clientY;
			layerY = anchor.parentNode.getBoundingClientRect().y;
		}
	}

	// touchEnter handler emulates the mouseenter event for touch input
	// (more or less)
	function touchEnter(ev) {
		drag(ev.clientY);
		// trigger dragEnter the first time the cursor moves over a list item
		let target = document.elementFromPoint(ev.clientX, ev.clientY).closest('.item');
		if (target && target != lastTarget) {
			lastTarget = target;
			dragEnter(ev, target);
		}
	}

	function dragEnter(ev, target) {
		// swap items in data
		if (grabbed && target != grabbed && target.classList.contains('item')) {
			moveDatum(parseInt(grabbed.dataset.index), parseInt(target.dataset.index));
		}
	}

	// does the actual moving of items in data
	function moveDatum(from, to) {
		let temp = items[from];
		items = [...items.slice(0, from), ...items.slice(from + 1)];
		dragTo = items[to];
		items = [...items.slice(0, to), temp, ...items.slice(to)];
	}

	function release(ev) {
		if (!dragTimeElapsed) {
			console.log('ignore drag');
			window.setTimeout(() => (dragTimeElapsed = false), 400);
			grabbed = null;
			return;
		}
		dragTimeElapsed = false;
		console.log('release', grabbed);
		console.log({ dragTo, grabbed });
		if ($store.auth.uid) {
			const payload: { list_id: string; id: string; goes_before?: string } = {
				list_id: listId,
				id: grabbed.dataset.id
			};
			if (dragTo) {
				payload.goes_before = dragTo.id;
			}
			dispatch('lists', listId, $store.auth.uid, reorder_item(payload));
		}
		grabbed = null;
	}

	let dragEnabled = true;
	$: console.log({ dragEnabled });
	function itemTextfieldFocused() {
		window.setTimeout(() => {
			console.log('Timeout for dragEnabled -> false');
			if (dragTimeElapsed === false) {
				dragEnabled = false;
			}
			console.log({ dragEnabled, grabbed, dragTimeElapsed });
		}, 900);
	}
</script>

<div bind:this={anchor} />

{#if items.length > 0}{#if completed}<Button on:click={toggleCompleted}
			>{show ? 'Hide ' : 'Show '}Completed Items</Button
		>{/if}{#if show || completed === false}<List
			on:mousemove={function (ev) {
				if (dragEnabled) {
					ev.stopPropagation();
					ev.preventDefault();
					drag(ev.clientY);
				}
			}}
			on:touchmove={function (ev) {
				if (dragEnabled) {
					ev.stopPropagation();
					drag(ev.touches[0].clientY);
				}
			}}
			on:mouseup={function (ev) {
				if (dragEnabled) {
					ev.stopPropagation();
					release(ev);
				}
			}}
			on:touchend={function (ev) {
				if (dragEnabled) {
					ev.stopPropagation();
					release(ev.touches[0]);
				}
			}}
			><div
				bind:this={ghost}
				id="ghost"
				class={grabbed ? 'item haunting' : 'item'}
				style={'top: ' + (mouseY + offsetY - layerY) + 'px'}
			>
				{#if grabbed}<ItemDisplay {listId} item={grabbedItem} />{/if}
			</div>
			{#each items as item, i (item.id)}<div
					id={grabbed && item.id == grabbed.dataset.id ? 'grabbed' : ''}
					class="item"
					data-index={i}
					data-id={item.id}
					data-grabY="0"
					on:mousedown={function (ev) {
						if (dragEnabled) {
							grab(ev.clientY, this);
						}
					}}
					on:touchstart={function (ev) {
						if (dragEnabled) {
							grab(ev.touches[0].clientY, this);
						}
					}}
					on:mouseenter={function (ev) {
						if (dragEnabled) {
							ev.stopPropagation();
							dragEnter(ev, ev.target);
						}
					}}
					on:touchmove={function (ev) {
						if (dragEnabled) {
							ev.stopPropagation();
							ev.preventDefault();
							touchEnter(ev.touches[0]);
						}
					}}
					animate:flip={{ duration: 200 }}
					in:receive={{ key: item.id }}
					out:send={{ key: item.id }}
				>
					<ItemDisplay
						{listId}
						{item}
						on:blur={() => (dragEnabled = true)}
						on:focus={itemTextfieldFocused}
					/>
				</div>{/each}</List
		>{/if}{/if}

<style>
	.item:last-child {
		margin-bottom: 0;
	}

	.item:not(#grabbed):not(#ghost) {
		z-index: 10;
	}

	#grabbed {
		opacity: 0;
	}

	#ghost.haunting {
		z-index: 20;
		opacity: 1;
	}
</style>
