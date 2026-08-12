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
	import {
		buildExpandedLabelIds,
		buildRouteExpandedLabelIds,
		type LabelEntriesById
	} from './label-sidebar';
	import { pin_label, reorder_list, unpin_label, type ListsState } from './lists';
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

	function buildHiddenListIds(labelEntriesById: LabelEntriesById, lists: ListsState) {
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

	function togglePinnedLabel(labelId: string) {
		if ($store.lists.pinnedLabelIds.includes(labelId)) {
			const action = unpin_label({ id: labelId });
			store.dispatch(action);
			firebase.dispatch(action);
		} else {
			const action = pin_label({ id: labelId });
			store.dispatch(action);
			firebase.dispatch(action);
		}
	}

	let items: string[] = [];
	function updateItems(displayItems: string[]) {
		if (!arraysEqual(items, displayItems)) {
			console.log('ListMenu.updateItems');
			items = displayItems;
		}
	}
	$: pageListId = $page.url.searchParams.get('listId') || '';
	$: pageLabelId = $page.url.searchParams.get('labelId') || '';
	$: viaLabelId = $page.url.searchParams.get('via') || '';
	$: labelEntriesById = buildLabelEntriesById($store.lists, $store.labels);
	$: routeExpandedLabelIds = buildRouteExpandedLabelIds(
		$page.url.pathname,
		pageLabelId,
		pageListId,
		viaLabelId,
		$store.lists,
		labelEntriesById
	);
	$: expandedLabelIds = buildExpandedLabelIds($store.lists.pinnedLabelIds, routeExpandedLabelIds);
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
	let startX = 0;
	let startY = 0;
	let dragArmed = false;
	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	const DRAG_THRESHOLD = 8; // px the pointer must move before a drag begins
	const TOUCH_HOLD_MS = 400; // long-press before a touch can start a drag
	let container: Element | undefined = undefined;
	let autoScroller = createDragAutoScroller(() => container, (direction, didScroll) => {
		if (grabbed) {
			updateDragTarget(pointerX, mouseY, didScroll ? 0 : direction);
		}
	});

	// A press that never turned into a drag (a tap, or a touch scroll) must be
	// abandoned without grabbing, so the tap reaches the list item's navigation.
	function cancelPendingDrag() {
		if (holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = undefined;
		}
		target = null;
		dragArmed = false;
	}

	let containerDragHandlers = {
		onPointerDown: (e: PointerEvent) => {
			target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.item') as HTMLElement;
			if (!target) {
				return;
			}
			startX = e.clientX;
			startY = e.clientY;
			pointerX = e.clientX;
			// Mouse/pen: a drag may begin as soon as the pointer moves far enough.
			// Touch: only after a long press, so quick swipes scroll and taps tap.
			if (e.pointerType === 'touch') {
				dragArmed = false;
				holdTimer = setTimeout(() => {
					dragArmed = true;
				}, TOUCH_HOLD_MS);
			} else {
				dragArmed = true;
			}
		},
		onPointerMove: (e: PointerEvent) => {
			if (grabbed) {
				e.preventDefault();
				pointerX = e.clientX;
				drag(e.clientY);
				updateDragTarget(e.clientX, e.clientY);
				return;
			}
			if (!target) {
				return;
			}
			const movedFar = Math.hypot(e.clientX - startX, e.clientY - startY) > DRAG_THRESHOLD;
			if (!dragArmed) {
				// Moving before the long press arms a drag means the user is
				// scrolling; abandon the pending drag so the list scrolls normally.
				if (movedFar) {
					cancelPendingDrag();
				}
				return;
			}
			if (movedFar) {
				// A real drag: capture the pointer now (so autoscroll keeps getting
				// events) and pick the item up. Capturing only here means a plain
				// tap is never hijacked and still navigates.
				(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
				if (holdTimer) {
					clearTimeout(holdTimer);
					holdTimer = undefined;
				}
				grab(e.clientY, target);
				pointerX = e.clientX;
				updateDragTarget(e.clientX, e.clientY);
				e.preventDefault();
			}
		},
		onPointerUp: (e: PointerEvent) => {
			if (grabbed) {
				release();
			}
			if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
				(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
			}
			cancelPendingDrag();
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
		onTouchEnd: () => {
			if (grabbed) {
				release();
			}
			cancelPendingDrag();
		},
		onPointerCancel: (e: PointerEvent) => {
			if (grabbed) {
				autoScroller.stop();
				grabbed = null;
			}
			if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
				(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
			}
			cancelPendingDrag();
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
				<ListMenuItem
					{listId}
					{setActive}
					{openEditDialog}
					labelExpanded={expandedLabelIds.has(listId)}
					labelPinned={$store.lists.pinnedLabelIds.includes(listId)}
					onTogglePinnedLabel={togglePinnedLabel}
				/>
				{#if expandedLabelIds.has(listId) && (labelEntriesById[listId] || []).length > 0}
					<div class="nested-list-items" transition:slide={{ duration: 600 }}>
						{#each labelEntriesById[listId] || [] as entry (entry.id)}
							<div class="nested-list-item">
								<ListMenuItem
									listId={entry.id}
									{setActive}
									{openEditDialog}
									nested
									viaLabelId={listId}
								/>
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
