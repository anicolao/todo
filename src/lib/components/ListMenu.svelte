<script lang="ts">
	console.log('ListMenu.svelte');
	import { page } from '$app/stores';
	import firebase from '$lib/firebase';
	import { store } from '$lib/store';
	import List from '@smui/list';
	import { flip, type AnimationConfig } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import ListMenuItem from './ListMenuItem.svelte';
	import {
		getDirectLabelMemberIds,
		getLabelVisibility,
		reorder_label_members,
		resolveLabelQuery,
		type LabelsState,
		type ResolvedLabelEntry
	} from './labels';
	import {
		buildExpandedLabelIds,
		buildRouteExpandedLabelIds,
		orderDirectLabelEntries,
		type LabelEntriesById
	} from './label-sidebar';
	import { pin_label, reorder_list, unpin_label, type ListsState } from './lists';
	import { Capacitor } from '@capacitor/core';
	import { createDragAutoScroller, findDragTarget } from './autoscroll';
	import { dispatchLabelAction } from './ActionLog';

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

	function buildDirectLabelMemberIdsById(lists: ListsState, labels: LabelsState) {
		return Object.fromEntries(
			lists.visibleLists
				.filter((listId) => lists.listIdToType[listId] === 'label')
				.map((labelId) => [
					labelId,
					getDirectLabelMemberIds(labels.labelIdToLabel[labelId]?.query, lists)
				])
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

	function buildDisplayItems(lists: ListsState, labels: LabelsState, hiddenListIds: Set<string>) {
		return lists.visibleLists.filter((listId) =>
			lists.listIdToType[listId] === 'label'
				? getLabelVisibility(labels.labelIdToLabel[listId]) !== 'fully_hidden'
				: !hiddenListIds.has(listId)
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
	let labelMemberItemsById: Record<string, string[]> = {};
	let grabbedLabelId = '';
	function updateItems(displayItems: string[]) {
		if (!arraysEqual(items, displayItems)) {
			console.log('ListMenu.updateItems');
			items = displayItems;
		}
	}
	function updateLabelMemberItems(nextItemsById: Record<string, string[]>) {
		let changed = false;
		const next = { ...labelMemberItemsById };
		Object.entries(nextItemsById).forEach(([labelId, memberIds]) => {
			if (labelId !== grabbedLabelId && !arraysEqual(next[labelId] || [], memberIds)) {
				next[labelId] = memberIds;
				changed = true;
			}
		});
		Object.keys(next).forEach((labelId) => {
			if (!(labelId in nextItemsById)) {
				delete next[labelId];
				changed = true;
			}
		});
		if (changed) {
			labelMemberItemsById = next;
		}
	}
	$: pageListId = $page.url.searchParams.get('listId') || '';
	$: pageLabelId = $page.url.searchParams.get('labelId') || '';
	$: viaLabelId = $page.url.searchParams.get('via') || '';
	$: labelEntriesById = buildLabelEntriesById($store.lists, $store.labels);
	$: directLabelMemberIdsById = buildDirectLabelMemberIdsById($store.lists, $store.labels);
	$: updateLabelMemberItems(directLabelMemberIdsById);
	$: orderedLabelEntriesById = Object.fromEntries(
		Object.entries(labelEntriesById).map(([labelId, entries]) => [
			labelId,
			orderDirectLabelEntries(
				entries,
				labelMemberItemsById[labelId] || directLabelMemberIdsById[labelId] || []
			)
		])
	);
	$: routeExpandedLabelIds = buildRouteExpandedLabelIds(
		$page.url.pathname,
		pageLabelId,
		pageListId,
		viaLabelId,
		$store.lists,
		labelEntriesById
	);
	$: expandedLabelIds = new Set(
		[...buildExpandedLabelIds($store.lists.pinnedLabelIds, routeExpandedLabelIds)].filter(
			(labelId) => getLabelVisibility($store.labels.labelIdToLabel[labelId]) !== 'fully_hidden'
		)
	);
	$: hiddenListIds = buildHiddenListIds(labelEntriesById, $store.lists);
	$: displayItems = buildDisplayItems($store.lists, $store.labels, hiddenListIds);
	$: updateItems(displayItems);
	let dragTo: string;

	let anchor: Element;
	let grabbed: HTMLElement | null;
	let grabbedItem: string;
	let startIndex: number;
	let lastTarget: Element;
	let boxHeight: number;
	let dragContainer: Element | undefined;

	function currentDragItems() {
		return grabbedLabelId ? labelMemberItemsById[grabbedLabelId] || [] : items;
	}

	function flipWhileDragging(
		node: Element,
		positions: { from: DOMRect; to: DOMRect }
	): AnimationConfig {
		return grabbed ? flip(node, positions, { duration: 200 }) : { duration: 0 };
	}

	let mouseY = 0; // pointer y coordinate.  When mouseY changes, the ghost is repositioned.
	let offsetY = 0; // negative y distance from top of grabbed element to pointer
	let layerY = 0; // distance from top of list to top of client
	let ghostOffsetX = 0;
	let ghostWidth = '100%';

	function grab(clientY: number, element: HTMLElement) {
		// modify grabbed element
		grabbed = element;

		let dataMap: DOMStringMap = grabbed.dataset;
		grabbedLabelId = dataMap.labelId || '';
		dragContainer = grabbedLabelId ? grabbed.parentElement || undefined : container;
		const dragItems = currentDragItems();
		startIndex = Number(dataMap.index);
		grabbedItem = dataMap.id || dragItems[startIndex];
		if (!grabbedLabelId && startIndex + 1 < dragItems.length) {
			dragTo = dragItems[startIndex + 1];
		} else {
			dragTo = '';
		}
		// record offset from cursor to top of element
		// (used for positioning ghost)
		const box = grabbed.getBoundingClientRect();
		offsetY = box.y - clientY;
		boxHeight = box.height;
		const containerBox = container?.getBoundingClientRect();
		ghostOffsetX = grabbedLabelId && containerBox ? box.x - containerBox.x : 0;
		ghostWidth = grabbedLabelId ? `${box.width}px` : '100%';
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
			target.dataset.dragScope === grabbed.dataset.dragScope &&
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
			container: dragContainer || container,
			grabbed,
			itemCount: currentDragItems().length,
			itemSelector: grabbedLabelId ? '.nested-list-item[data-draggable="true"]' : '.item'
		});
		if (target && (target != lastTarget || edgeDirection !== 0)) {
			lastTarget = target;
			dragEnter(target);
		}
	}

	// does the actual moving of items in data
	function moveDatum(from: number, to: number) {
		const currentItems = currentDragItems();
		const movedItem = currentItems[from];
		const remainingItems = [...currentItems.slice(0, from), ...currentItems.slice(from + 1)];
		if (!grabbedLabelId) {
			if (to < remainingItems.length) {
				dragTo = remainingItems[to];
			} else {
				dragTo = '';
			}
			items = [...remainingItems.slice(0, to), movedItem, ...remainingItems.slice(to)];
		} else {
			labelMemberItemsById = {
				...labelMemberItemsById,
				[grabbedLabelId]: [...remainingItems.slice(0, to), movedItem, ...remainingItems.slice(to)]
			};
		}
	}

	function clearGrab() {
		grabbed = null;
		grabbedLabelId = '';
		dragContainer = undefined;
	}

	function release() {
		autoScroller.stop();
		if (
			$store.auth.uid &&
			grabbed &&
			grabbed.dataset.id &&
			Number(grabbed.dataset.index) !== startIndex
		) {
			if (grabbedLabelId) {
				const action = reorder_label_members({
					label_id: grabbedLabelId,
					ids: labelMemberItemsById[grabbedLabelId]
				});
				store.dispatch(action);
				dispatchLabelAction(grabbedLabelId, $store.auth.uid, action);
			} else {
				const payload: { id: string; goes_before?: string } = {
					id: grabbed.dataset.id
				};
				if (dragTo) {
					payload.goes_before = dragTo;
				}
				firebase.dispatch(reorder_list(payload));
			}
		}
		clearGrab();
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
	let autoScroller = createDragAutoScroller(
		() => dragContainer || container,
		(direction, didScroll) => {
			if (grabbed) {
				updateDragTarget(pointerX, mouseY, didScroll ? 0 : direction);
			}
		}
	);

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
			const hit = document.elementFromPoint(e.clientX, e.clientY);
			const nestedTarget = hit?.closest<HTMLElement>('.nested-list-item');
			target = nestedTarget
				? nestedTarget.dataset.draggable === 'true'
					? nestedTarget
					: null
				: (hit?.closest<HTMLElement>('.item') as HTMLElement | undefined);
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
				clearGrab();
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
		style={`width: ${ghostWidth}; transform: translate3d(${ghostOffsetX}px, ${
			mouseY + offsetY - layerY
		}px, 0)`}
	>
		{#if grabbed}
			<ListMenuItem listId={grabbedItem} {openEditDialog} nested={Boolean(grabbedLabelId)} />
		{/if}
	</div>
	<List>
		{#each items as listId, i (listId)}<div
				id={grabbed && !grabbedLabelId && listId == grabbed.dataset.id ? 'grabbed' : ''}
				class="item"
				data-index={i}
				data-id={listId}
				data-drag-scope="top-level"
				animate:flipWhileDragging
			>
				<ListMenuItem
					{listId}
					{setActive}
					{openEditDialog}
					labelExpanded={expandedLabelIds.has(listId)}
					labelPinned={$store.lists.pinnedLabelIds.includes(listId)}
					onTogglePinnedLabel={togglePinnedLabel}
				/>
				{#if expandedLabelIds.has(listId) && (orderedLabelEntriesById[listId] || []).length > 0}
					<div class="nested-list-items" transition:slide={{ duration: 200 }}>
						{#each orderedLabelEntriesById[listId] || [] as entry (entry.id)}
							<div
								id={grabbed && grabbedLabelId === listId && entry.id === grabbed.dataset.id
									? 'grabbed'
									: ''}
								class="nested-list-item"
								data-index={(labelMemberItemsById[listId] || []).indexOf(entry.id)}
								data-id={entry.id}
								data-label-id={listId}
								data-drag-scope={`label-${listId}`}
								data-draggable={(labelMemberItemsById[listId] || []).includes(entry.id)}
								animate:flipWhileDragging
							>
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
		margin-left: calc(
			var(--drawer-row-inline-margin) + var(--drawer-icon-inline-margin) +
				var(--drawer-icon-artwork-inset)
		);
		overflow: hidden;
	}

	.nested-list-item {
		user-select: none;
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
