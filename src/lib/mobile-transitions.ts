import { Capacitor } from '@capacitor/core';
import { cubicOut } from 'svelte/easing';
import { writable } from 'svelte/store';
import type { TransitionConfig } from 'svelte/transition';

export type ScreenMovement = 'forward' | 'backward' | 'up' | 'down' | 'none';

export const MOBILE_SCREEN_DURATION = 280;
// Exact CSS representation of Svelte's cubicOut easing. Keeping CSS-driven
// drawer motion on this curve lets its edge stay locked to Svelte transitions.
export const MOBILE_SCREEN_EASING = 'cubic-bezier(0.333333, 1, 0.666667, 1)';
export const ANIMATION_LAB_RESET_KEY = 'todo-animation-lab-reset';

export type RouteSnapshot = {
	html: string;
	title: string;
	icon: string;
};

export const routeSnapshots = writable<Record<string, RouteSnapshot>>({});

export function snapshotElementHtml(element: HTMLElement) {
	const clone = element.cloneNode(true) as HTMLElement;
	const sourceControls = element.querySelectorAll<
		HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
	>('input, textarea, select');
	const clonedControls = clone.querySelectorAll<
		HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
	>('input, textarea, select');

	sourceControls.forEach((source, index) => {
		const target = clonedControls[index];
		if (!target) return;
		if (source instanceof HTMLInputElement) {
			target.setAttribute('value', source.value);
			if (source.checked) target.setAttribute('checked', '');
			else target.removeAttribute('checked');
		} else if (source instanceof HTMLTextAreaElement) {
			target.textContent = source.value;
		} else {
			const sourceSelect = source as HTMLSelectElement;
			const targetSelect = target as HTMLSelectElement;
			[...targetSelect.options].forEach((option, optionIndex) => {
				if (sourceSelect.options[optionIndex]?.selected) option.setAttribute('selected', '');
				else option.removeAttribute('selected');
			});
		}
	});

	return clone.innerHTML;
}

export function hideOutgoingScreen(event: Event) {
	(event.currentTarget as HTMLElement).setAttribute('aria-hidden', 'true');
}

export function isTouchFormFactor() {
	const labViewport =
		typeof window !== 'undefined' && import.meta.env.VITE_ANIMATION_LAB === 'true'
			? new URLSearchParams(window.location.search).get('__animationLabViewport')
			: null;
	return (
		typeof window !== 'undefined' &&
		(import.meta.env.VITE_ANIMATION_LAB === 'true'
			? labViewport
				? labViewport !== 'desktop'
				: window.innerWidth < 900
			: Capacitor.isNativePlatform() ||
			  window.matchMedia('(hover: none) and (pointer: coarse)').matches)
	);
}

export function prefersReducedMotion() {
	return (
		typeof window !== 'undefined' &&
		((import.meta.env.VITE_ANIMATION_LAB === 'true' &&
			localStorage.getItem('todo-animation-lab-reduced-motion') === 'true') ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches)
	);
}

export function animationLabResetInProgress() {
	return (
		typeof window !== 'undefined' &&
		import.meta.env.VITE_ANIMATION_LAB === 'true' &&
		sessionStorage.getItem(ANIMATION_LAB_RESET_KEY) === 'true'
	);
}

const editorBaseAnimations = new WeakMap<HTMLElement, Animation>();

export function animateEditorBase(nodes: Array<HTMLElement | null | undefined>, open: boolean) {
	const active = isTouchFormFactor() && !prefersReducedMotion();
	for (const node of nodes) {
		if (!node) continue;
		editorBaseAnimations.get(node)?.cancel();
		editorBaseAnimations.delete(node);
		if (!active) {
			node.style.removeProperty('transform');
			node.style.removeProperty('will-change');
			continue;
		}

		const from = open ? 0 : -100;
		const to = open ? -100 : 0;
		const step = 16.666 / MOBILE_SCREEN_DURATION;
		const keyframes: Keyframe[] = [];
		for (let offset = 0; offset <= 1; offset += step) {
			const value = from + (to - from) * cubicOut(offset);
			keyframes.push({ offset, transform: `translate3d(${value}%, 0, 0)` });
		}
		keyframes.push({ offset: 1, transform: `translate3d(${to}%, 0, 0)` });
		node.style.willChange = 'transform';
		const animation = node.animate(keyframes, {
			duration: MOBILE_SCREEN_DURATION,
			easing: 'linear',
			fill: 'forwards'
		});
		editorBaseAnimations.set(node, animation);
		void animation.finished.then(
			() => {
				if (editorBaseAnimations.get(node) !== animation) return;
				node.style.transform = open ? `translate3d(${to}%, 0, 0)` : '';
				node.style.removeProperty('will-change');
				animation.cancel();
				editorBaseAnimations.delete(node);
			},
			() => undefined
		);
	}
}

export function mobileScreenOffset(movement: ScreenMovement, phase: 'in' | 'out') {
	const incoming = phase === 'in';
	let x = 0;
	let y = 0;

	if (movement === 'forward') x = incoming ? 100 : -100;
	if (movement === 'backward') x = incoming ? -100 : 100;
	if (movement === 'up') y = incoming ? 100 : -100;
	if (movement === 'down') y = incoming ? -100 : 100;

	return { x, y };
}

export function mobileScreenSlide(
	node: Element,
	{
		movement,
		phase,
		active = true,
		duration = MOBILE_SCREEN_DURATION
	}: {
		movement: ScreenMovement;
		phase: 'in' | 'out';
		active?: boolean;
		duration?: number;
	}
): TransitionConfig {
	if (!active || movement === 'none' || prefersReducedMotion() || !isTouchFormFactor()) {
		return { duration: 0 };
	}

	const style = getComputedStyle(node);
	const transform = style.transform === 'none' ? '' : style.transform;
	const { x, y } = mobileScreenOffset(movement, phase);

	return {
		duration,
		easing: cubicOut,
		css: (_t, u) =>
			`transform: ${transform} translate3d(${u * x}%, ${u * y}%, 0); will-change: transform;`
	};
}
