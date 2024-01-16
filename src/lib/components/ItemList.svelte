<script lang="ts">
	console.log('ItemList.svelte');
	import { dispatch } from '$lib/components/ActionLog';
	import { reorder_item, type ListOfItems, type TodoItem } from '$lib/components/items';
	import { logTime, store } from '$lib/store';
	import List from '@smui/list';
	import { flip } from 'svelte/animate';
	import ItemDisplay from './ItemDisplay.svelte';
	import { Capacitor } from '@capacitor/core';

	export let listIdMatcher: (listId: string) => boolean = () => true;
	export let filter: (listId: string, itemId: string) => boolean = () => true;
	export let comparator: null | ((a: TodoItem, b: TodoItem) => number) = null;
	export let hasItems = false;
	export let show = true;
	export let enableUndo = false;
	export let showListName = false;

	/*
	export let send: (
		node: Element,
		params: CrossfadeParams & { key: any }
	) => () => TransitionConfig = () => () => {
		return {};
	};
	export let receive: (
		node: Element,
		params: CrossfadeParams & { key: any }
	) => () => TransitionConfig = () => () => {
		return {};
	};
	*/

	let listIds: string[] = [];

	function updateListIds(listIdMatcher: (listId: string) => boolean) {
		logTime('Itemlist: updating listIds.');
		listIds = $store.lists.visibleLists.filter(listIdMatcher);
		updateItemIds(filter, comparator);
	}
	$: updateListIds(listIdMatcher);

	$: visibleLists = $store.lists.visibleLists;
	let lastVisibleLists = $store.lists.visibleLists;
	$: if (visibleLists !== lastVisibleLists) {
		lastVisibleLists = visibleLists;
		updateListIds(listIdMatcher);
	}

	function updateItemIds(
		filter: (listId: string, itemId: string) => boolean,
		comparator: ((a: TodoItem, b: TodoItem) => number) | null
	) {
		items = [];
		listIds = $store.lists.visibleLists.filter(listIdMatcher);
		listIds.forEach((listId) => filterItems(listId, filter));
		if (comparator !== null) {
			items.sort(comparator);
		}
	}
	$: updateItemIds(filter, comparator);

	let lastListItems: { [id: string]: ListOfItems } = {};
	function updateLastListItemsCache() {
		let itemsChanged = false;
		listIds.forEach((listId) => {
			if (lastListItems[listId] !== $store.items.listIdToListOfItems[listId]) {
				lastListItems[listId] = $store.items.listIdToListOfItems[listId];
				itemsChanged = true;
			}
		});
		if (itemsChanged) {
			updateItemIds(filter, comparator);
		}
	}
	let lastItems = $store.items;
	$: if ($store.items !== lastItems) {
		lastItems = store.items;
		updateLastListItemsCache();
	}

	type ExtendedTodoItem = TodoItem & { id: string; listId: string; animationId: string };
	let items: ExtendedTodoItem[] = [];
	function filterItems(listId: string, filter: (listId: string, itemId: string) => boolean) {
		$store.items.listIdToListOfItems[listId]?.itemIds.forEach((itemId: string) => {
			const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[itemId];
			if (item && filter(listId, itemId)) {
				items.push({
					...item,
					id: itemId,
					animationId: itemId, // + (listIds?.length),
					listId,
					description: item.description
				});
			}
		});
	}

	let anchor: Element;
	let grabbed: HTMLElement | null;
	let grabbedItem: ExtendedTodoItem;
	let startIndex: number;
	let lastTarget: Element;
	let boxHeight: number;

	let mouseY = 0; // pointer y coordinate.  When mouseY changes, the ghost is repositioned.
	let offsetY = 0; // negative y distance from top of grabbed element to pointer
	let layerY = 0; // distance from top of list to top of client

	let dragTimeElapsed = false;
	let dragTo: ExtendedTodoItem | undefined;

	function grab(clientY: number, element: HTMLElement) {
		// modify grabbed element
		grabbed = element;

		let dataMap: DOMStringMap = grabbed.dataset;
		startIndex = Number(dataMap.index);
		grabbedItem = items[startIndex];
		if (startIndex + 1 < items.length) {
			dragTo = items[startIndex + 1];
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
			layerY = anchor.getBoundingClientRect().y;
			// console.log( 'mouseY ' + mouseY + ' offsetY ' + offsetY + ' -layerY ' + layerY + ' = ' + (mouseY + offsetY - layerY));
		} else {
			console.log('drag: grabbed is not set');
		}
	}

	/*
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
	*/

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
		if ($store.auth.uid && grabbed && grabbed.dataset.id) {
			if (Number(grabbed.dataset.index) !== startIndex) {
				const payload: { list_id: string; id: string; goes_before?: string } = {
					list_id: grabbedItem.listId,
					id: grabbed.dataset.id
				};
				if (dragTo) {
					payload.goes_before = dragTo.id;
				}
				dispatch('lists', grabbedItem.listId, $store.auth.uid, reorder_item(payload));
			}
		}
		grabbed = null;
	}

	$: canDrag = comparator === null;
	$: dragEnabled = canDrag;
	function enableDrag(on: boolean) {
		dragEnabled = canDrag && on;
	}

	$: console.log({ dragEnabled });
	function itemTextfieldFocused() {
		window.setTimeout(() => {
			console.log('Timeout for dragEnabled -> false');
			if (dragTimeElapsed === false) {
				enableDrag(false);
			}
			console.log({ dragEnabled, grabbed, dragTimeElapsed });
		}, 900);
	}

	let target: HTMLElement | null | undefined = null;
	let touchTimeout = Capacitor.isNativePlatform() ? 400 : 0;

	let containerDragHandlers = {
		onPointerDown: (e: PointerEvent) => {
			if (dragEnabled) {
				target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.item');
				if (target) {
					window.setTimeout(() => {
						if (target) {
							// console.log('onPointerDown GRAB');
							grab(e.clientY, target);
						} else {
							// console.log('onPointerDown no grab');
						}
					}, 50 + touchTimeout);
				}
			}
		},
		onPointerMove: (e: PointerEvent) => {
			if (dragEnabled) {
				// Prevent text selection while dragging by preventing this default.
				e.preventDefault();

				if (grabbed) {
					drag(e.clientY);
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
				release();
			}
			target = null;
		},
		onTouchStart: (e: TouchEvent) => {
			touchTimeout = 400;
		},
		onTouchMove: (e: TouchEvent) => {
			if (dragEnabled && grabbed) {
				e.preventDefault();
				const x = e.touches[0].clientX;
				const y = e.touches[0].clientY;
				drag(y);

				const midPoint = y + offsetY + boxHeight / 2;
				let target: HTMLElement | null | undefined = document
					.elementFromPoint(x, midPoint)
					?.closest('.item');
				if (target) {
					if (target != lastTarget) {
						lastTarget = target;
						dragEnter(target);
					}
				}
			}
		},
		onTouchEnd: (e: TouchEvent) => {
			if (dragEnabled) {
				release();
			}
			target = null;
		},
		onPointerCancel: (e: PointerEvent) => {
			target = null;
		}
	};

	$: if (items && items.length > 0) {
		hasItems = true;
		// logTime('ItemList has ' + items.length + ' items.');
	}

	let container: Element | undefined = undefined;
	$: if (container) {
		const ro = new ResizeObserver((x) => {
			logTime('ResizeObserver called');
		});
		ro.observe(container);
	}
</script>

{#if items.length > 0}
	<slot />
	<div bind:this={anchor} />
	{#if show}
		<div
			class="listContainer"
			bind:this={container}
			on:pointerdown={containerDragHandlers.onPointerDown}
			on:pointermove={containerDragHandlers.onPointerMove}
			on:pointerup={containerDragHandlers.onPointerUp}
			on:pointercancel={containerDragHandlers.onPointerCancel}
			on:touchstart={containerDragHandlers.onTouchStart}
			on:touchmove|nonpassive={containerDragHandlers.onTouchMove}
			on:touchend={containerDragHandlers.onTouchEnd}
		>
			<List
				><div
					id="ghost"
					class={grabbed ? 'item haunting' : 'item'}
					style={`transform: translate3d(0, ${mouseY + offsetY - layerY}px, 0)`}
				>
					{#if grabbed}<ItemDisplay
							listId={grabbedItem.listId}
							item={grabbedItem}
							{showListName}
						/>{/if}
				</div>
				{#each items as item, i (item.animationId)}<div
						id={grabbed && item.id == grabbed.dataset.id ? 'grabbed' : ''}
						class="item"
						data-index={i}
						data-id={item.id}
						animate:flip={{ duration: 200 }}
					>
						<ItemDisplay
							listId={item.listId}
							{item}
							{showListName}
							{enableUndo}
							on:blur={() => enableDrag(true)}
							on:focus={itemTextfieldFocused}
						/>
					</div>{/each}</List
			>
		</div>{/if}{/if}

<style>
	:global(.mdc-deprecated-list) {
		padding: 0;
	}

	.listContainer {
		position: relative;
	}

	.item {
		box-sizing: border-box;
		width: 100%;
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
