<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { CrossfadeParams, TransitionConfig } from 'svelte/transition';

	export let invisible = false;
	export let offset = 0;

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
	let offsetY = 0;
	let top = 0;
	let bottom = 0;
	let height = 0;

	let needNewTop = false;

	function fireStart(y: number, element: HTMLElement) {
		startY = y;
		const originalBox = element.getBoundingClientRect();
		top = originalBox.top;
		bottom = originalBox.bottom;
		height = originalBox.height;
		console.log({ top, bottom, height, h2: bottom - top });
		offsetY = 0;
		console.log({ fireStart: '', offset, 'Drag.offsetY': offsetY, startY, top, bottom, height });
		dispatchEvent('start', { y, element });
	}
	function fireMove(y: number, element: HTMLElement) {
		/*
		if(needNewTop) {
			const box = element.getBoundingClientRect();
			if(top !== element.getBoundingClientRect().top) {
				top = box.top;
				bottom = box.bottom;
				height = box.height;
				startY = y;
				offsetY = 0;

				needNewTop = false;
			} else {
				console.log("Need New Top");
				return;
			}
		}
		*/
		offsetY = y - startY;
		if (invisible) {
			console.log({ fireMove: offsetY, top, bottom });
			if (y < top) {
				console.log('MOVE ME UP');
				// needNewTop = true;
				// startY -= height;
				startY = y;
				offsetY = 0;
				top -= height;
				bottom -= height;
				console.log({
					fireMove: 'up',
					offset,
					'Drag.offsetY': offsetY,
					startY,
					top,
					bottom,
					height
				});
				dispatchEvent('moveup', { y, element });
			} else if (y > bottom) {
				console.log('MOVE ME DOWN');
				// needNewTop = true;
				// startY += height;
				startY = y;
				offsetY = 0;
				top += height;
				bottom += height;
				console.log({
					fireMove: 'down',
					offset,
					'Drag.offsetY': offsetY,
					startY,
					top,
					bottom,
					height
				});
				dispatchEvent('movedown', { y, element });
			}
		}
		dispatchEvent('move', { y, element });
	}
	function end(y: number) {
		dispatchEvent('end', { y });
	}

	let self: HTMLElement;

	function mouseDown(element: HTMLElement) {
		console.log({ 'mouseDown setup': element });
		return (e: MouseEvent) => {
			console.log(e, e.target);
			console.log({ mouseDown: element });
			fireStart(e.clientY, element);
		};
	}
	function mouseMove(element: HTMLElement) {
		return (e: MouseEvent) => {
			e.stopPropagation();
			e.preventDefault();
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
	style="transform: translateY({invisible ? offsetY : 0}px)"
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
		opacity: 0.7;
		background-color: aqua;
		position: relative;
		z-index: 100;
	}
</style>
