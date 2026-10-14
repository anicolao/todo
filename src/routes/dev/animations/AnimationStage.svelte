<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import {
		MOBILE_SCREEN_DURATION,
		MOBILE_SCREEN_EASING,
		mobileScreenOffset
	} from '$lib/mobile-transitions';
	import MockScreen from './MockScreen.svelte';
	import type { AnimationScenario } from './scenarios';

	export let scenario: AnimationScenario;
	export let speed = 1;

	const dispatch = createEventDispatcher<{
		state: { state: 'ready' | 'moving' | 'paused' | 'complete'; progress: number };
	}>();
	let fromNode: HTMLElement;
	let toNode: HTMLElement;
	let drawerNode: HTMLElement;
	let oldNode: HTMLElement;
	let animations: Animation[] = [];
	let frame = 0;
	let run = 0;
	let state: 'ready' | 'moving' | 'paused' | 'complete' = 'ready';

	function transform(x: number, y: number) {
		return `translate3d(${x}%, ${y}%, 0)`;
	}

	function set(node: HTMLElement | undefined, x: number, y: number, visible = true) {
		if (!node) return;
		node.style.transform = transform(x, y);
		node.style.visibility = visible ? 'visible' : 'hidden';
	}

	function initial() {
		animations.forEach((animation) => animation.cancel());
		animations = [];
		if (scenario.motion === 'paired') {
			const incoming = mobileScreenOffset(scenario.movement, 'in');
			set(fromNode, 0, 0);
			set(toNode, incoming.x, incoming.y);
		} else if (scenario.motion === 'drawer-open') {
			set(oldNode, 0, 0);
			set(drawerNode, -100, 0);
		} else if (scenario.motion === 'drawer-select') {
			set(drawerNode, 0, 0);
			set(toNode, 100, 0);
		} else {
			set(fromNode, 0, 0);
			set(toNode, 0, 0, false);
		}
		state = 'ready';
		dispatch('state', { state, progress: 0 });
	}

	function motion(node: HTMLElement, from: string, to: string) {
		const animation = node.animate([{ transform: from }, { transform: to }], {
			duration: MOBILE_SCREEN_DURATION,
			easing: MOBILE_SCREEN_EASING,
			fill: 'forwards'
		});
		animation.updatePlaybackRate(speed);
		return animation;
	}

	export function play() {
		initial();
		const thisRun = ++run;
		if (scenario.motion === 'instant') {
			set(fromNode, 0, 0, false);
			set(toNode, 0, 0, true);
			state = 'complete';
			dispatch('state', { state, progress: 100 });
			return;
		}

		if (scenario.motion === 'paired') {
			const incoming = mobileScreenOffset(scenario.movement, 'in');
			const outgoing = mobileScreenOffset(scenario.movement, 'out');
			animations = [
				motion(fromNode, transform(0, 0), transform(outgoing.x, outgoing.y)),
				motion(toNode, transform(incoming.x, incoming.y), transform(0, 0))
			];
		} else if (scenario.motion === 'drawer-open') {
			animations = [
				motion(oldNode, transform(0, 0), transform(100, 0)),
				motion(drawerNode, transform(-100, 0), transform(0, 0))
			];
		} else {
			animations = [
				motion(drawerNode, transform(0, 0), transform(-100, 0)),
				motion(toNode, transform(100, 0), transform(0, 0))
			];
		}
		state = 'moving';
		dispatch('state', { state, progress: 0 });
		Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
			if (run !== thisRun || state === 'ready') return;
			state = 'complete';
			dispatch('state', { state, progress: 100 });
		});
	}

	export function reset() {
		run++;
		initial();
	}

	export function togglePause() {
		if (!animations.length || state === 'complete' || state === 'ready') return;
		if (state === 'paused') {
			animations.forEach((animation) => animation.play());
			state = 'moving';
		} else {
			animations.forEach((animation) => animation.pause());
			state = 'paused';
		}
		dispatch('state', { state, progress: progress() });
	}

	export function setSpeed(value: number) {
		speed = value;
		animations.forEach((animation) => animation.updatePlaybackRate(value));
	}

	export function seek(value: number) {
		if (!animations.length) play();
		animations.forEach((animation) => {
			animation.pause();
			animation.currentTime = (MOBILE_SCREEN_DURATION * value) / 100;
		});
		state = value >= 100 ? 'complete' : 'paused';
		dispatch('state', { state, progress: value });
	}

	function progress() {
		const time = Number(animations[0]?.currentTime || 0);
		return Math.max(0, Math.min(100, (time / MOBILE_SCREEN_DURATION) * 100));
	}

	onMount(() => {
		initial();
		const inspect = () => {
			if (state === 'moving' || state === 'paused')
				dispatch('state', { state, progress: progress() });
			frame = requestAnimationFrame(inspect);
		};
		frame = requestAnimationFrame(inspect);
	});

	onDestroy(() => {
		cancelAnimationFrame(frame);
		animations.forEach((animation) => animation.cancel());
	});
</script>

<div
	class:portrait={scenario.viewport === 'portrait'}
	class:landscape={scenario.viewport === 'landscape'}
	class:desktop={scenario.viewport === 'desktop'}
	class="device"
	data-scenario={scenario.id}
	data-motion={scenario.motion}
>
	<div class="camera"></div>
	<div class="viewport">
		{#if scenario.viewport === 'landscape'}
			<div class="fixed-drawer"><MockScreen title="Navigation" surface="drawer" drawer /></div>
		{/if}
		<div class:landscape-pane={scenario.viewport === 'landscape'} class="motion-stage">
			{#if scenario.motion === 'drawer-open'}
				<div class="moving-screen" bind:this={oldNode}>
					<MockScreen title={scenario.from} surface="route" />
				</div>
				<div class="moving-screen drawer-layer" bind:this={drawerNode}>
					<MockScreen title={scenario.to} surface="drawer" drawer />
				</div>
			{:else if scenario.motion === 'drawer-select'}
				<div class="moving-screen" bind:this={toNode}>
					<MockScreen title={scenario.to} surface="route" />
				</div>
				<div class="moving-screen drawer-layer" bind:this={drawerNode}>
					<MockScreen title={scenario.from} surface="drawer" drawer />
				</div>
			{:else}
				<div class="moving-screen" bind:this={fromNode}>
					<MockScreen title={scenario.from} surface={scenario.fromSurface || scenario.surface} />
				</div>
				<div class="moving-screen" bind:this={toNode}>
					<MockScreen title={scenario.to} surface={scenario.toSurface || scenario.surface} />
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.device {
		position: relative;
		width: min(393px, calc((100svh - 100px) * 393 / 852), calc(100vw - 32px));
		aspect-ratio: 393/852;
		overflow: hidden;
		border: 9px solid #272321;
		border-radius: 30px;
		background: #111;
		box-shadow: 0 18px 55px #160d0966;
	}
	.device.landscape {
		width: min(852px, calc((100svh - 100px) * 852 / 393), calc(100vw - 32px));
		aspect-ratio: 852/393;
		border-radius: 24px;
	}
	.device.desktop {
		width: min(960px, calc((100svh - 100px) * 16 / 9), calc(100vw - 32px));
		aspect-ratio: 16/9;
		border-width: 7px;
		border-radius: 13px;
	}
	.camera {
		position: absolute;
		z-index: 20;
		top: 7px;
		left: 50%;
		width: 66px;
		height: 15px;
		transform: translateX(-50%);
		border-radius: 10px;
		background: #272321;
		pointer-events: none;
	}
	.landscape .camera,
	.desktop .camera {
		display: none;
	}
	.viewport {
		position: absolute;
		inset: 0;
		overflow: hidden;
		border-radius: 20px;
		background: #f7f4f2;
	}
	.desktop .viewport {
		border-radius: 6px;
	}
	.motion-stage {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}
	.moving-screen {
		position: absolute;
		inset: 0;
		will-change: transform;
		backface-visibility: hidden;
	}
	.drawer-layer {
		z-index: 5;
	}
	.fixed-drawer {
		position: absolute;
		z-index: 6;
		inset: 0 auto 0 0;
		width: 31%;
		border-right: 1px solid #d8d0cc;
	}
	.landscape-pane {
		left: 31%;
	}
	.desktop .motion-stage {
		left: 220px;
	}
	.desktop .viewport::before {
		content: 'Todo\A Today\A Starred\A Search\A\A Lists\A Weekend errands\A House\A\A Profile';
		white-space: pre;
		position: absolute;
		z-index: 6;
		inset: 0 auto 0 0;
		width: 220px;
		box-sizing: border-box;
		padding: 25px 24px;
		background: #fff;
		color: #4e403a;
		font:
			14px/2.55 Roboto,
			sans-serif;
		border-right: 1px solid #ddd6d2;
	}
</style>
