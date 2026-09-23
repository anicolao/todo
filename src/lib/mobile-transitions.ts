import { Capacitor } from '@capacitor/core';
import { cubicOut } from 'svelte/easing';
import { writable } from 'svelte/store';
import type { TransitionConfig } from 'svelte/transition';

export type ScreenMovement = 'forward' | 'backward' | 'up' | 'down' | 'none';

export const routeSnapshots = writable<Record<string, string>>({});

export function hideOutgoingScreen(event: Event) {
	(event.currentTarget as HTMLElement).setAttribute('aria-hidden', 'true');
}

export function isTouchFormFactor() {
	return (
		typeof window !== 'undefined' &&
		(Capacitor.isNativePlatform() ||
			window.matchMedia('(hover: none) and (pointer: coarse)').matches)
	);
}

export function prefersReducedMotion() {
	return (
		typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

export function mobileScreenSlide(
	node: Element,
	{
		movement,
		phase,
		active = true,
		duration = 280
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
	const incoming = phase === 'in';
	let x = 0;
	let y = 0;

	if (movement === 'forward') x = incoming ? 100 : -100;
	if (movement === 'backward') x = incoming ? -100 : 100;
	if (movement === 'up') y = incoming ? 100 : -100;
	if (movement === 'down') y = incoming ? -100 : 100;

	return {
		duration,
		easing: cubicOut,
		css: (_t, u) =>
			`transform: ${transform} translate3d(${u * x}%, ${u * y}%, 0); will-change: transform;`
	};
}
