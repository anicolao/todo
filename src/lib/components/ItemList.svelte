<script lang="ts">
	console.log('ItemList.svelte');
	import { dispatch } from '$lib/components/ActionLog';
	import { reorder_item, type ListOfItems, type TodoItem } from '$lib/components/items';
	import { store } from '$lib/store';
	import Button from '@smui/button';
	import List from '@smui/list';
	import { flip } from 'svelte/animate';
	import type { CrossfadeParams, TransitionConfig } from 'svelte/transition';
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
	$: if (listId) {
		items = [];
		lastListOfItems = undefined;
	}
	let dragTo: ExtendedTodoItem | undefined;
	let lastListOfItems: ListOfItems | undefined = undefined;
	$: if ($store.items.listIdToListOfItems[listId]) {
		if (lastListOfItems !== $store.items.listIdToListOfItems[listId]) {
			lastListOfItems = $store.items.listIdToListOfItems[listId];
			items = [];
			$store.items.listIdToListOfItems[listId].itemIds.forEach((itemId: string) => {
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

	let anchor: Element;
	let grabbed: HTMLElement | null;
	let grabbedItem: ExtendedTodoItem;
	let lastTarget: Element;
	let boxHeight: number;

	let mouseY = 0; // pointer y coordinate.  When mouseY changes, the ghost is repositioned.
	let offsetY = 0; // negative y distance from top of grabbed element to pointer
	let layerY = 0; // distance from top of list to top of client

	let dragTimeElapsed = false;

	function grab(clientY: number, element: HTMLElement) {
		// modify grabbed element
		grabbed = element;

		let dataMap: DOMStringMap = grabbed.dataset;
		const index = Number(dataMap.index);
		grabbedItem = items[index];
		if (index + 1 < items.length) {
			dragTo = items[index + 1];
		} else {
			dragTo = undefined;
		}
		// record offset from cursor to top of element
		// (used for positioning ghost)
		const box = grabbed.getBoundingClientRect();
		offsetY = box.y - clientY;
		boxHeight = box.height;
		drag(clientY);
		window.setTimeout(() => (dragTimeElapsed = true), 400);
	}

	// drag handler updates cursor position
	function drag(clientY: number) {
		if (grabbed) {
			mouseY = clientY;
			if (anchor.parentElement) {
				layerY = anchor.parentElement.getBoundingClientRect().y;
			}
		}
	}

	// touchEnter handler emulates the mouseenter event for touch input
	// (more or less)
	function touchEnter(ev: Touch) {
		drag(ev.clientY);
		// trigger dragEnter the first time the cursor moves over a list item
		let target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.item');
		if (target && target != lastTarget) {
			lastTarget = target;
			dragEnter(target as HTMLElement);
		}
	}

	function dragEnter(target: HTMLElement) {
		// swap items in data
		if (
			grabbed &&
			target != grabbed &&
			target.classList.contains('item') &&
			grabbed.dataset.index /* dataset entries are strings */ &&
			target.dataset.index
		) {
			moveDatum(parseInt(grabbed.dataset.index), parseInt(target.dataset.index));
		}
	}

	// does the actual moving of items in data
	function moveDatum(from: number, to: number) {
		let temp = items[from];
		items = [...items.slice(0, from), ...items.slice(from + 1)];
		if (to < items.length) {
			dragTo = items[to];
		} else {
			dragTo = undefined;
		}
		items = [...items.slice(0, to), temp, ...items.slice(to)];
	}

	function release() {
		if (!dragTimeElapsed) {
			console.log('ignore drag');
			window.setTimeout(() => (dragTimeElapsed = false), 400);
			grabbed = null;
			return;
		}
		dragTimeElapsed = false;
		console.log('release', grabbed);
		console.log({ dragTo, grabbed });
		if ($store.auth.uid && grabbed && grabbed.dataset.id) {
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

	let containerDragHandlers = {
		onPointerDown: (e: PointerEvent) => {
			if (dragEnabled) {
				let target: HTMLElement | null | undefined = document
					.elementFromPoint(e.clientX, e.clientY)
					?.closest('.item');
				if (target) {
					grab(e.clientY, target);
				}
			}
		},
		onPointerMove: (e: PointerEvent) => {
			if (dragEnabled) {
				e.stopPropagation();
				e.preventDefault();
				drag(e.clientY);
				if (grabbed) {
					const srcElement = e.currentTarget as HTMLElement;
					srcElement.setPointerCapture(e.pointerId);
					const midPoint = e.clientY + offsetY + boxHeight / 2;
					let target: HTMLElement | null | undefined = document
						.elementFromPoint(e.clientX, midPoint)
						?.closest('.item');
					if (target) {
						if (target != lastTarget) {
							lastTarget = target;
							dragEnter(target);
						}
					}
				}
			}
		},
		onPointerUp: (e: PointerEvent) => {
			if (dragEnabled) {
				e.stopPropagation();
				release();
			}
		}
	};
</script>

<div bind:this={anchor} />

{#if items.length > 0}{#if completed}<Button on:click={toggleCompleted}
			>{show ? 'Hide ' : 'Show '}Completed Items</Button
		>{/if}{#if show || completed === false}<div
			on:pointerdown={containerDragHandlers.onPointerDown}
			on:pointermove={containerDragHandlers.onPointerMove}
			on:pointerup={containerDragHandlers.onPointerUp}
		>
			<List
				><div
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
			>
		</div>{/if}{/if}

<style>
	:global(.mdc-deprecated-list) {
		padding: 0;
	}

	.item {
		box-sizing: border-box;
		width: 100%;
		min-height: 3em;
		margin-bottom: 0;
		user-select: none;
	}

	.item:last-child {
		margin-bottom: 0;
	}

	.item:not(#grabbed):not(#ghost) {
		z-index: 10;
	}

	#grabbed {
		opacity: 0;
	}

	#ghost {
		pointer-events: none;
		z-index: -5;
		position: absolute;
		top: 0;
		left: 0;
		opacity: 0;
	}

	#ghost.haunting {
		z-index: 20;
		opacity: 1;
	}
</style>
