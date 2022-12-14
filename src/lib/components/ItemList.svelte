<script lang="ts">
	console.log('ItemList.svelte');
	import { dispatch } from '$lib/components/ActionLog';
	import { reorder_item, type ListOfItems, type TodoItem } from '$lib/components/items';
	import { store } from '$lib/store';
	import Button from '@smui/button';
	import List from '@smui/list';
	import { flip } from 'svelte/animate';
	import type { CrossfadeParams, TransitionConfig } from 'svelte/transition';
	import DraggableItem from './DraggableItem.svelte';
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
	let dragTo: ExtendedTodoItem;
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

	interface Grabbed {
		id: string;
	}

	let ghost: Element;
	let anchor: Element;
	let grabbed: Grabbed | undefined;
	let grabbedItem: ExtendedTodoItem | undefined;
	let lastTarget: Grabbed;

	let mouseY = 0; // pointer y coordinate within client
	let offsetY = 0; // y distance from top of grabbed element to pointer
	let height = 0;
	let origY = 0;
	let offset = 0; 
	let layerY = 0; // distance from top of list to top of client

	let dragTimeElapsed = false;

	function getItem(id: string): ExtendedTodoItem | undefined {
		return items.filter((item) => item.id === id).shift();
	}

	function grab(clientY: number, id: string, element: HTMLElement) {
		// modify grabbed element
		grabbed = {
			id
		};
		grabbedItem = getItem(grabbed.id);

		// record offset from cursor to top of element
		// (used for positioning ghost)
		offsetY = element.getBoundingClientRect().y - clientY;
		origY = clientY;
		height = element.getBoundingClientRect().height;
		console.log({"grab": true, offset, offsetY, origY, mouseY, layerY, height});
		drag(clientY);
		window.setTimeout(() => (dragTimeElapsed = true), 400);
	}

	// drag handler updates cursor position
	function drag(clientY: number) {
		if (grabbed) {
			mouseY = clientY;
			offset = mouseY - origY;
			if (anchor.parentElement) {
				layerY = anchor.parentElement.getBoundingClientRect().y;
			}
			// console.log({'drag top': (mouseY + offsetY - layerY), offset, offsetY, origY, mouseY});
			console.log({'drag': true, mouseY, offsetY, layerY, offset, origY});
			// dragDistance = mouseY - origY;
		}
	}

	// touchEnter handler emulates the mouseenter event for touch input
	// (more or less)
	function touchEnter(y: number, target: Grabbed) {
		drag(y);
		// trigger dragEnter the first time the cursor moves over a list item
		if (!lastTarget || target.id !== lastTarget.id) {
			lastTarget = target;
			dragEnter(target);
		}
	}

	function dragEnter(target: Grabbed) {
		// swap items in data
		if (grabbed && target.id !== grabbed.id) {
			// moveDatumById(grabbed, target);
		}
	}

	function moveUp(index: number) {
		return () => moveDatum(index, index - 1);
	}

	function moveDown(index: number) {
		return () => moveDatum(index, index + 1);
	}

	function moveDatumById(from: Grabbed, to: Grabbed) {
		const f = items.findIndex((a) => a.id === from.id);
		const t = items.findIndex((a) => a.id === to.id);
		if (f !== -1 && t !== -1) {
			moveDatum(f, t);
		}
	}

	// does the actual moving of items in data
	function moveDatum(from: number, to: number) {
		if (to >= 0 && to < items.length) {
			console.log("moveDatum: from " + from + " to " + to);
			let moveCount = to - from;
			// origY += height*moveCount;
			let temp = items[from];
			items = [...items.slice(0, from), ...items.slice(from + 1)];
			dragTo = items[to];
			items = [...items.slice(0, to), temp, ...items.slice(to)];
		}
	}

	function release() {
		if (!dragTimeElapsed) {
			console.log('ignore drag');
			window.setTimeout(() => (dragTimeElapsed = false), 400);
			grabbed = undefined;
			return;
		}
		dragTimeElapsed = false;
		console.log('release', grabbed);
		console.log({ dragTo, grabbed });
		if ($store.auth.uid && grabbed) {
			const payload: { list_id: string; id: string; goes_before?: string } = {
				list_id: listId,
				id: grabbed.id
			};
			if (dragTo) {
				payload.goes_before = dragTo.id;
			}
			dispatch('lists', listId, $store.auth.uid, reorder_item(payload));
		}
		grabbed = undefined;
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
		onPointerMove: (e: PointerEvent) => {
			if (dragEnabled) {
				e.stopPropagation();
				e.preventDefault();
				drag(e.clientY);
			}
		},
		onPointerUp: (e: PointerEvent) => {
			if (dragEnabled) {
				e.stopPropagation();
				release();
			}
		},
	};

	let itemDragHandlers = {
		onStart: (id: string) => (e: CustomEvent) => {
			if (dragEnabled) {
				console.log({ onStart: e.detail });
				grab(e.detail.y, id, e.detail.element);
			}
		},
	};
</script>

<div bind:this={anchor} />
   <!--
			on:pointermove={containerDragHandlers.onPointerMove}
			on:pointerup={containerDragHandlers.onPointerUp}
	 -->

{#if items.length > 0}{#if completed}<Button on:click={toggleCompleted}
			>{show ? 'Hide ' : 'Show '}Completed Items</Button
		>{/if}{#if show || completed === false}<List
			><div
				bind:this={ghost}
				id="ghost"
				class={grabbed ? 'item haunting' : 'item'}
				style={'top: ' + (mouseY + offsetY - layerY) + 'px'}
			>
				{#if grabbedItem}<ItemDisplay {listId} item={grabbedItem} />{/if}
			</div>
			{#each items as item, i (item.id)}
				<!-- <div animate:flip={{ duration: 200 }}> -->
				<div>
					<DraggableItem
						invisible={grabbed && item.id == grabbed.id}
						on:start={itemDragHandlers.onStart(item.id)}
						on:moveup={moveUp(i)}
						on:movedown={moveDown(i)}
						{send}
						{receive}
					>
						<ItemDisplay
							{listId}
							{item}
							on:blur={() => (dragEnabled = true)}
							on:focus={itemTextfieldFocused}
						/>
					</DraggableItem>
				</div>
			{/each}</List
		>{/if}{/if}

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

	#ghost {
		pointer-events: none;
		z-index: -10;
		position: absolute;
		top: 0;
		left: 0;
		opacity: 0;
	}

	#ghost.haunting {
		z-index: 20;
		opacity: 0.3;
		background-color: red;
	}
</style>
