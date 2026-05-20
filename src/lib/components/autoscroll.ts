const EDGE_SIZE_PX = 96;
const MAX_SCROLL_PX_PER_FRAME = 24;

function isScrollable(element: HTMLElement) {
	const style = getComputedStyle(element);
	const overflowY = style.overflowY;
	return (
		(overflowY === 'auto' || overflowY === 'scroll') && element.scrollHeight > element.clientHeight
	);
}

function findScrollContainer(element: Element | null | undefined) {
	let current = element?.parentElement;
	while (current) {
		if (isScrollable(current)) {
			return current;
		}
		current = current.parentElement;
	}
	return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
}

function scrollSpeed(distanceIntoEdge: number) {
	const ratio = Math.min(Math.max(distanceIntoEdge / EDGE_SIZE_PX, 0), 1);
	return Math.ceil(ratio * MAX_SCROLL_PX_PER_FRAME);
}

export function createDragAutoScroller(
	getElement: () => Element | null | undefined,
	onScroll?: (direction: -1 | 1, didScroll: boolean) => void
) {
	let pointerY = 0;
	let animationFrame = 0;
	let scrollContainer: HTMLElement | null = null;

	function stop() {
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
			animationFrame = 0;
		}
		scrollContainer = null;
	}

	function tick() {
		animationFrame = 0;
		if (!scrollContainer) {
			return;
		}

		const rect = scrollContainer.getBoundingClientRect();
		let delta = 0;
		if (pointerY < rect.top + EDGE_SIZE_PX) {
			delta = -scrollSpeed(rect.top + EDGE_SIZE_PX - pointerY);
		} else if (pointerY > rect.bottom - EDGE_SIZE_PX) {
			delta = scrollSpeed(pointerY - (rect.bottom - EDGE_SIZE_PX));
		}

		if (delta === 0) {
			return;
		}

		const previousScrollTop = scrollContainer.scrollTop;
		scrollContainer.scrollTop += delta;
		const didScroll = scrollContainer.scrollTop !== previousScrollTop;
		onScroll?.(delta < 0 ? -1 : 1, didScroll);
		if (didScroll) {
			animationFrame = requestAnimationFrame(tick);
		}
	}

	function update(clientY: number) {
		pointerY = clientY;
		scrollContainer = scrollContainer || findScrollContainer(getElement());
		if (scrollContainer && !animationFrame) {
			animationFrame = requestAnimationFrame(tick);
		}
	}

	return {
		stop,
		update
	};
}
