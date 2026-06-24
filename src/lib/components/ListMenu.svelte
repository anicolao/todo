<script lang="ts">
	console.log('ListMenu.svelte');
	import { page } from '$app/stores';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import List from '@smui/list';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import ListMenuItem from './ListMenuItem.svelte';
	import { resolveLabelQuery, type LabelsState, type ResolvedLabelEntry } from './labels';
	import { reorder_list, type ListsState } from './lists';
	import { Capacitor } from '@capacitor/core';
	import { createDragAutoScroller, findDragTarget } from './autoscroll';

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

	export let setActive: (name: string, keepDrawerOpen?: boolean) => void;
	export let openEditDialog: () => void;

	function arraysEqual(a: string[], b: string[]) {
		return a.length === b.length && a.every((value, index) => value === b[index]);
	}

	function resolveVisibleLabelEntries(labelId: string, lists: ListsState, labels: LabelsState) {
		return resolveLabelQuery(labels.labelIdToLabel[labelId]?.query, lists, labels).filter(
			(entry) => !entry.inaccessible
		);
	}

	function buildLabelEntriesById(lists: ListsState, labels: LabelsState) {
		return Object.fromEntries(
			lists.visibleLists
				.filter((listId) => lists.listIdToType[listId] === 'label')
				.map((labelId) => [labelId, resolveVisibleLabelEntries(labelId, lists, labels)])
		);
	}

	function findContainingLabelId(
		listId: string,
		lists: ListsState,
		labelEntriesById: { [labelId: string]: ResolvedLabelEntry[] }
	) {
		return (
			lists.visibleLists.find(
				(candidateId) =>
					lists.listIdToType[candidateId] === 'label' &&
					labelEntriesById[candidateId]?.some((entry) => entry.id === listId)
			) || ''
		);
	}

	function buildHiddenListIds(
		labelEntriesById: { [labelId: string]: ResolvedLabelEntry[] },
		lists: ListsState
	) {
		const hiddenListIds = new Set<string>();
		Object.values(labelEntriesById).forEach((entries) => {
			entries.forEach((entry) => {
				if (lists.listIdToType[entry.id] !== 'label') {
					hiddenListIds.add(entry.id);
				}
			});
		});
		return hiddenListIds;
	}

	function buildDisplayItems(lists: ListsState, hiddenListIds: Set<string>) {
		return lists.visibleLists.filter(
			(listId) => lists.listIdToType[listId] === 'label' || !hiddenListIds.has(listId)
		);
	}

	let items: string[] = [];
	function updateItems(displayItems: string[]) {
		if (!arraysEqual(items, displayItems)) {
			console.log('ListMenu.updateItems');
			items = displayItems;
		}
	}
	$: activeLabelId = $page.url.searchParams.get('labelId') || '';
	$: pageListId = $page.url.searchParams.get('listId') || '';
	$: labelEntriesById = buildLabelEntriesById($store.lists, $store.labels);
	$: expandedLabelId =
		activeLabelId ||
		(pageListId ? findContainingLabelId(pageListId, $store.lists, labelEntriesById) : '');
	$: activeLabelEntries = expandedLabelId ? labelEntriesById[expandedLabelId] || [] : [];
	$: hiddenListIds = buildHiddenListIds(labelEntriesById, $store.lists);
	$: displayItems = buildDisplayItems($store.lists, hiddenListIds);
	$: updateItems(displayItems);
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
			autoScroller.update(clientY);
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

	function updateDragTarget(clientX: number, clientY: number, edgeDirection: -1 | 0 | 1 = 0) {
		const target = findDragTarget({
			clientX,
			clientY,
			offsetY,
			boxHeight,
			edgeDirection,
			container,
			grabbed,
			itemCount: items.length
		});
		if (target && (target != lastTarget || edgeDirection !== 0)) {
			lastTarget = target;
			dragEnter(target);
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
		autoScroller.stop();
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

	let target: HTMLElement | null | undefined = null;
	let pointerX = 0;
	let touchTimeout = Capacitor.isNativePlatform() ? 400 : 0;
	let container: Element | undefined = undefined;
	let autoScroller = createDragAutoScroller(() => container, (direction, didScroll) => {
		if (grabbed) {
			updateDragTarget(pointerX, mouseY, didScroll ? 0 : direction);
		}
	});

	let containerDragHandlers = {
		onPointerDown: (e: PointerEvent) => {
			const pointerId = e.pointerId;
			const clientY = e.clientY;
			const currentTarget = e.currentTarget as HTMLElement;
			pointerX = e.clientX;
			target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.item') as HTMLElement;
			if (target) {
				window.setTimeout(() => {
					if (target) {
						currentTarget.setPointerCapture(pointerId);
						grab(clientY, target);
					} else {
						// console.log('onPointerDown no grab');
					}
				}, 100 + touchTimeout);
			}
		},
		onPointerMove: (e: PointerEvent) => {
			if (grabbed) {
				e.preventDefault();
				pointerX = e.clientX;
				drag(e.clientY);
				updateDragTarget(e.clientX, e.clientY);
			}
		},
		onPointerUp: (e: PointerEvent) => {
			release();
			if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
				(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
			}
			target = null;
		},
		onTouchStart: (e: TouchEvent) => {
			touchTimeout = 400;
		},
		onTouchMove: (e: TouchEvent) => {
			if (grabbed) {
				e.preventDefault();
				const x = e.touches[0].clientX;
				const y = e.touches[0].clientY;
				pointerX = x;
				drag(y);
				updateDragTarget(x, y);
			}
		},
		onTouchEnd: (e: TouchEvent) => {
			release();
			target = null;
		},
		onPointerCancel: (e: PointerEvent) => {
			if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
				(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
			}
			target = null;
		}
	};
</script>

<div bind:this={anchor} />

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
	<div
		id="ghost"
		class={grabbed ? 'item haunting' : 'item'}
		style={`transform: translate3d(0, ${mouseY + offsetY - layerY}px, 0)`}
	>
		{#if grabbed}<ListMenuItem listId={grabbedItem} {openEditDialog} />{/if}
	</div>
	<List>
		{#each items as listId, i (listId)}<div
				id={grabbed && listId == grabbed.dataset.id ? 'grabbed' : ''}
				class="item"
				data-index={i}
				data-id={listId}
				animate:flip={{ duration: 200 }}
			>
				<ListMenuItem {listId} {setActive} {openEditDialog} />
				{#if listId === expandedLabelId && activeLabelEntries.length > 0}
					<div class="nested-list-items" transition:slide={{ duration: 600 }}>
						{#each activeLabelEntries as entry (entry.id)}
							<div class="nested-list-item">
								<ListMenuItem listId={entry.id} {setActive} {openEditDialog} nested />
							</div>
						{/each}
					</div>
				{/if}
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

	.nested-list-items {
		border-left: 2px solid rgba(0, 0, 0, 0.12);
		margin-left: 28px;
		overflow: hidden;
	}

	.nested-list-item {
		min-height: 40px;
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
