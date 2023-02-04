<script lang="ts">
	console.log('drag/+page.svelte');

	type ExtendedTodoItem = { id: number; desc: string };

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

	function dragEnter(target: HTMLElement) {
		// swap items in data
		console.log({ dragEnter: grabbed, target });
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
		grabbed = null;
	}

	$: canDrag = true;
	$: dragEnabled = canDrag;
	function enableDrag(on: boolean) {
		dragEnabled = canDrag && on;
	}

	$: console.log({ dragEnabled });

	let target: HTMLElement | null | undefined = null;
	let touchTimeout = 0;

	let containerDragHandlers = {
		onPointerDown: (e: PointerEvent) => {
			console.log('onPointerDown ' + dragEnabled);
			if (dragEnabled) {
				target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.item');
				if (target) {
					window.setTimeout(() => {
						if (target) {
							console.log('onPointerDown GRAB');
							grab(e.clientY, target);
						} else {
							console.log('onPointerDown no grab');
						}
					}, 50 + touchTimeout);
				}
			}
		},
		onPointerMove: (e: PointerEvent) => {
			console.log('onPointerMove enabled? ' + dragEnabled + ' grabbed? ' + grabbed);
			if (dragEnabled) {
				// Prevent text selection while dragging by preventing these defaults.
				e.stopPropagation();
				e.preventDefault();

				if (grabbed) {
					drag(e.clientY);
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
				} else {
					// target = null;
				}
			}
		},
		onPointerUp: (e: PointerEvent) => {
			console.log('onPointerUp enabled? ' + dragEnabled);
			if (dragEnabled) {
				e.stopPropagation();
				release();
			}
			target = null;
		},
		onTouchStart: (e: TouchEvent) => {
			console.log('onTouchStart');
			touchTimeout = 200;
		},
		onTouchMove: (e: TouchEvent) => {
			console.log('onTouchMove');
			if (grabbed) {
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
			console.log('onTouchEnd');
			if (dragEnabled) {
				release();
			}
			target = null;
			touchTimeout = 0;
		},
		onPointerCancel: (e: PointerEvent) => {
			console.log({ 'onPointerCancel enabled?': dragEnabled, e });
			target = null;
		}
	};

	let items: any[] = [];
	for (let i = 0; i < 100; ++i) {
		items.push({
			id: i,
			desc: 'Hi from item ' + i
		});
	}
</script>

<div bind:this={anchor} />
<div
	class="listContainer"
	class:grabbed
	on:pointerdown|nonpassive={containerDragHandlers.onPointerDown}
	on:pointermove|nonpassive={containerDragHandlers.onPointerMove}
	on:pointerup|nonpassive={containerDragHandlers.onPointerUp}
	on:pointercancel|nonpassive={containerDragHandlers.onPointerCancel}
	on:touchstart|nonpassive={containerDragHandlers.onTouchStart}
	on:touchmove|nonpassive={containerDragHandlers.onTouchMove}
	on:touchend|nonpassive={containerDragHandlers.onTouchEnd}
>
	<div
		id="ghost"
		class={grabbed ? 'item haunting' : 'item'}
		style={'top: ' + (mouseY + offsetY - layerY) + 'px'}
	>
		{#if grabbed}<span>GHOST!</span>{/if}
	</div>
	{#each items as item, i (item.id)}
		<span class="item" data-index={i} data-id={item.id}>{item.desc}</span>
	{/each}
</div>

<style>
	span {
		display: block;
		border: 1px solid grey;
		padding: 0.5em;
		margin: 0.2em;
	}

	:global(.mdc-deprecated-list) {
		padding: 0;
	}

	.listContainer {
		position: relative;
		/* touch-action: none; */
	}

	/*
	.item {
		width: 100%;
		box-sizing: border-box;
		min-height: 3em;
		margin-bottom: 0;
		user-select: none;
	}
  */

	.item:last-child {
		margin-bottom: 0;
	}

	.item:not(#grabbed):not(#ghost) {
		z-index: 10;
	}

  /*
	#grabbed {
		opacity: 0;
	}
  */

	.grabbed {
		/*touch-action: none;*/
		border: 1px solid red;
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
