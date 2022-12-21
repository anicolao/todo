<script lang="ts">
	import firebase from '$lib/firebase';
	console.log('ListMenu.svelte');
	import { store } from '$lib/store';
	import List from '@smui/list';
	import { flip } from 'svelte/animate';
	import { construct_svelte_component } from 'svelte/internal';
	import type { CrossfadeParams, TransitionConfig } from 'svelte/transition';
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

	let ghost: Element;
	let anchor: Element;
	let grabbed: HTMLElement | null;
	let grabbedItem: string;
	let lastTarget: Element;

	let mouseY = 0; // pointer y coordinate within client
	let offsetY = 0; // y distance from top of grabbed element to pointer
	let layerY = 0; // distance from top of list to top of client

	function grab(clientY: number, element: HTMLElement) {
		// modify grabbed element
		grabbed = element;

		let dataMap: DOMStringMap = grabbed.dataset;
		grabbedItem = items[Number(dataMap.index)];
		// record offset from cursor to top of element
		// (used for positioning ghost)
		offsetY = grabbed.getBoundingClientRect().y - clientY;
		drag(clientY);
	}

	// drag handler updates cursor position
	function drag(clientY: number) {
		if (grabbed) {
			mouseY = clientY;
			layerY = anchor.getBoundingClientRect().y;
			console.log({ layerY });
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
			grabbed.dataset.index &&
			target.dataset.index
		) {
			moveDatum(parseInt(grabbed.dataset.index), parseInt(target.dataset.index));
		}
	}

	// does the actual moving of items in data
	function moveDatum(from: number, to: number) {
		let temp = items[from];
		items = [...items.slice(0, from), ...items.slice(from + 1)];
		dragTo = items[to];
		items = [...items.slice(0, to), temp, ...items.slice(to)];
	}

	function release() {
		console.log('release', grabbed);
		console.log({ dragTo, grabbed });
		if ($store.auth.uid && grabbed && grabbed.dataset.id) {
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

	let dragEnabled = true;
	$: console.log({ dragEnabled });

	let containerDragHandlers = {
		onMouseMove: (ev: Event) => {
			const e = ev as MouseEvent;
			if (dragEnabled) {
				e.stopPropagation();
				e.preventDefault();
				drag(e.clientY);
			}
		},
		onTouchMove: (ev: Event) => {
			const e = ev as TouchEvent;
			if (dragEnabled) {
				e.stopPropagation();
				drag(e.touches[0].clientY);
			}
		},
		onMouseUp: (ev: Event) => {
			const e = ev as MouseEvent;
			if (dragEnabled) {
				e.stopPropagation();
				release();
			}
		},
		onTouchEnd: (ev: Event) => {
			const e = ev as TouchEvent;
			if (dragEnabled) {
				e.stopPropagation();
				release();
			}
		}
	};

	let itemDragHandlers = {
		onMouseDown: (e: MouseEvent, src: any) => {
			if (dragEnabled) {
				const srcElement = src as HTMLElement;
				grab(e.clientY, srcElement);
			}
		},
		onTouchStart: (e: TouchEvent, src: any) => {
			if (dragEnabled) {
				const srcElement = src as HTMLElement;
				grab(e.touches[0].clientY, srcElement);
			}
		},
		onMouseEnter: (e: MouseEvent) => {
			if (dragEnabled) {
				e.stopPropagation();
				e.target && dragEnter(e.target as HTMLElement);
			}
		},
		onTouchMove: (e: TouchEvent) => {
			if (dragEnabled) {
				e.stopPropagation();
				e.preventDefault();
				touchEnter(e.touches[0]);
			}
		}
	};
</script>

<div bind:this={anchor} />

<div class="listContainer">
	<List
		on:mousemove={containerDragHandlers.onMouseMove}
		on:touchmove={containerDragHandlers.onTouchMove}
		on:mouseup={containerDragHandlers.onMouseUp}
		on:touchend={containerDragHandlers.onTouchEnd}
		><div
			bind:this={ghost}
			id="ghost"
			class={grabbed ? 'item haunting' : 'item'}
			style={'top: ' + (mouseY + offsetY - layerY) + 'px'}
		>
			{#if grabbed}<ListMenuItem listId={grabbedItem} />{/if}
		</div>
		{#each items as listId, i (listId)}<div
				id={grabbed && listId == grabbed.dataset.id ? 'grabbed' : ''}
				class="item"
				data-index={i}
				data-id={listId}
				on:mousedown={function (e) {
					itemDragHandlers.onMouseDown(e, this);
				}}
				on:touchstart={function (e) {
					itemDragHandlers.onTouchStart(e, this);
				}}
				on:mouseenter={itemDragHandlers.onMouseEnter}
				on:touchmove={itemDragHandlers.onTouchMove}
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
