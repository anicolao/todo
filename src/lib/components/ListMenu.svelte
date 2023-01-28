<script lang="ts">
	console.log('ListMenu.svelte');
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import List from '@smui/list';
	import { flip } from 'svelte/animate';
	import ListMenuItem from './ListMenuItem.svelte';
	import { reorder_list } from './lists';

	/*
	export let send: (
		node: Element,
		params: CrossfadeParams & { key: any }
	) => () => TransitionConfig;
	export let receive: (
		node: Element,
		params: CrossfadeParams & { key: any }
	) => () => TransitionConfig;
	*/

	let items: string[];
	$: items = $store.lists.visibleLists;
	let dragTo: string;

	let anchor: Element;
	let grabbed: HTMLElement | null;
	let grabbedItem: string;
	let startIndex: number;
	let lastTarget: Element;
	let boxHeight: number;

	let mouseY = 0; // pointer y coordinate.  When mouseY changes, the ghost is repositioned.
	let offsetY = 0; // negative y distance from top of grabbed element to pointer
	let layerY = 0; // distance from top of list to top of client

	function grab(clientY: number, element: HTMLElement) {
		// modify grabbed element
		grabbed = element;

		let dataMap: DOMStringMap = grabbed.dataset;
		startIndex = Number(dataMap.index);
		grabbedItem = items[startIndex];
		if (startIndex + 1 < items.length) {
			dragTo = items[startIndex + 1];
		} else {
			dragTo = '';
		}
		// record offset from cursor to top of element
		// (used for positioning ghost)
		const box = grabbed.getBoundingClientRect();
		offsetY = box.y - clientY;
		boxHeight = box.height;
		drag(clientY);
	}

	// drag handler updates cursor position
	function drag(clientY: number) {
		if (grabbed) {
			mouseY = clientY;
			layerY = anchor.getBoundingClientRect().y;
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
			dragTo = '';
		}
		items = [...items.slice(0, to), temp, ...items.slice(to)];
	}

	function release() {
		if (
			$store.auth.uid &&
			grabbed &&
			grabbed.dataset.id &&
			Number(grabbed.dataset.index) !== startIndex
		) {
			const payload: { id: string; goes_before?: string } = {
				id: grabbed.dataset.id
			};
			if (dragTo) {
				payload.goes_before = dragTo;
			}
			firebase.dispatch(reorder_list(payload));
		}
		grabbed = null;
	}

	let containerDragHandlers = {
		onPointerDown: (e: PointerEvent) => {
			let target: HTMLElement | null | undefined = document
				.elementFromPoint(e.clientX, e.clientY)
				?.closest('.item');
			if (target) {
				grab(e.clientY, target);
			}
		},
		onPointerMove: (e: PointerEvent) => {
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
		},
		onPointerUp: (e: PointerEvent) => {
			e.stopPropagation();
			release();
		}
	};
</script>

<div bind:this={anchor} />

<div
	class="listContainer"
	on:pointerdown={containerDragHandlers.onPointerDown}
	on:pointermove={containerDragHandlers.onPointerMove}
	on:pointerup={containerDragHandlers.onPointerUp}
>
	<div
		id="ghost"
		class={grabbed ? 'item haunting' : 'item'}
		style={'top: ' + (mouseY + offsetY - layerY) + 'px'}
	>
		{#if grabbed}<ListMenuItem listId={grabbedItem} />{/if}
	</div>
	<List>
		{#each items as listId, i (listId)}<div
				id={grabbed && listId == grabbed.dataset.id ? 'grabbed' : ''}
				class="item"
				data-index={i}
				data-id={listId}
				animate:flip={{ duration: 200 }}
			>
				<ListMenuItem {listId} />
			</div>{/each}</List
	>
</div>

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
