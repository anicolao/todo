<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { CrossfadeParams, TransitionConfig } from 'svelte/transition';

	export let invisible = false;
	export let mouseY = 0;

	export let send: (
		node: Element,
		params: CrossfadeParams & { key: any }
	) => () => TransitionConfig = () => {
		return {};
	};

	export let receive: (
		node: Element,
		params: CrossfadeParams & { key: any }
	) => () => TransitionConfig = () => {
		return {};
	};

	const dispatchEvent = createEventDispatcher();

	let startY = 0;
	let clickOffset = 0;
	let box: DOMRect | undefined;
	let offset = 0;

	$: updatePositionOffset(mouseY);

	function updatePositionOffset(mouseY: number) {
		if (invisible) {
			if (!box) {
				box = self.getBoundingClientRect();
				// console.log({ updatePositionOffset: 'box', b: boxToString(box), startY });
				box.y -= offset;
				startY = box.top + clickOffset;
				// console.log({ updatePositionOffset: 'box', b: boxToString(box), startY });
			}
			let pos = self.getBoundingClientRect();
			// console.log({ updatePositionOffset: mouseY, b: boxToString(pos), clickOffset });
			offset = mouseY - startY;
			// console.log({ yposOffset: offset });
		}
	}

	function boxToString(box: DOMRect) {
		if (box) {
			return `t:${box.top} b:${box.bottom}`;
		}
		return '';
	}

	function fireStart(y: number, element: HTMLElement) {
		startY = y;
		box = element.getBoundingClientRect();
		clickOffset = y - box.top;
		// console.log({ fireStart: boxToString(box), startY, clickOffset });
		dispatchEvent('start', { y, element });
	}

	const DRAG_OUT_FUDGE_PX = 10;

	function fireMove(y: number, element: HTMLElement) {
		if (invisible && box) {
			// console.log({ top: box.top, bottom: box.bottom });
			if (y < box.top - DRAG_OUT_FUDGE_PX) {
				console.log('MOVE ME UP');
				dispatchEvent('moveup', { y, element });
				box = undefined;
			} else if (y > box.bottom + DRAG_OUT_FUDGE_PX) {
				console.log('MOVE ME DOWN');
				dispatchEvent('movedown', { y, element });
				box = undefined;
			}
		}
		// dispatchEvent('move', { y, element });
	}

	function end(y: number) {
		dispatchEvent('end', { y });
	}

	let self: HTMLElement;

	function mouseDown(element: HTMLElement) {
		return (e: MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
			fireStart(e.clientY, element);
		};
	}
	function mouseMove(element: HTMLElement) {
		return (e: MouseEvent) => {
			fireMove(e.clientY, element);
		};
	}
	function touchStart(element: HTMLElement) {
		return (e: TouchEvent) => {
			fireStart(e.touches[0].clientY, element);
		};
	}
	const touchMove = (element: HTMLElement) => (e: TouchEvent) => {
		fireMove(e.touches[0].clientY, element);
	};
</script>

<div
	bind:this={self}
	class="item"
	class:invisible
	style="transform: translateY({invisible ? offset : 0}px)"
	on:mousedown={mouseDown(self)}
	on:touchstart={touchStart(self)}
	on:mousemove={mouseMove(self)}
	on:touchmove={touchMove(self)}
	in:receive={{ key: 'item' }}
	out:send={{ key: 'item' }}
>
	<slot />
</div>

<style>
	.item {
		width: 100%;
		min-height: 3em;
		margin-bottom: 0;
		user-select: none;
	}

	.invisible {
		opacity: 0.8;
		background-color: aqua;
		position: relative;
		z-index: 100;
	}
</style>
