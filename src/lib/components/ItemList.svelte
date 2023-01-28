<script lang="ts">
	console.log('ItemList.svelte');
	import { dispatch } from '$lib/components/ActionLog';
	import { reorder_item, type TodoItem } from '$lib/components/items';
	import { store } from '$lib/store';
	import List from '@smui/list';
	import { flip } from 'svelte/animate';
	import ItemDisplay from './ItemDisplay.svelte';

	export let listIdMatcher: (listId: string) => boolean = () => true;
	export let filter: (listId: string, itemId: string) => boolean = () => true;
	export let comparator: null | ((a: TodoItem, b: TodoItem) => number) = null;
	export let hasItems = false;
	export let show = true;
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

	function watchListIdMatcher(listIdMatcher: (listId: string) => boolean, {}: any) {
		if (listIdMatcher) {
			items = [];
			listIds = $store.lists.visibleLists.filter(listIdMatcher);
			if (listIds.length === 1) {
				const singleListId = listIds[0];
				if ($store.items.listIdToListOfItems[singleListId]) {
					filterItems(singleListId);
				}
			} else {
				listIds.forEach((listId) => filterItems(listId));
				if (comparator !== null) {
					items.sort(comparator);
				}
			}
		}
	}
	$: watchListIdMatcher(listIdMatcher, $store.lists.visibleLists);

	type ExtendedTodoItem = TodoItem & { id: string; listId: string; animationId: string };
	let items: ExtendedTodoItem[] = [];
	function filterItems(listId: string) {
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

	let showListName = false;
	$: showListName =
		$store.ui.title === 'Starred' ||
		$store.ui.title === 'By Date' ||
		$store.ui.title === 'Completed';

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
			if (anchor.parentElement) {
				layerY = anchor.parentElement.getBoundingClientRect().y;
			}
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

	$: if (items && items.length > 0) {
		hasItems = true;
	}
</script>

<div bind:this={anchor} />

{#if items.length > 0}
	<slot />
	{#if show}
		<div
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
