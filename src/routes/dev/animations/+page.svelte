<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { animationLabFixture, prepareAnimationLabFixture } from '$lib/animation-lab-fixture';
	import { ANIMATION_LAB_RESET_KEY, MOBILE_SCREEN_DURATION } from '$lib/mobile-transitions';
	import { animationGroups, animationScenarios, type LabSetup, type LabTrigger } from './scenarios';

	type Review = 'pending' | 'approved' | 'issue';
	type PlayerState = 'preparing' | 'ready' | 'moving' | 'paused' | 'complete' | 'error';
	const reviewKey = 'todo-real-animation-lab-reviews-v2';
	const reducedMotionKey = 'todo-animation-lab-reduced-motion';
	let subject = animationScenarios[0].id;
	let frame: HTMLIFrameElement;
	let speed = 1;
	let playerState: PlayerState = 'preparing';
	let progress = 0;
	let moving = 0;
	let toolsOpen = true;
	let reviews: Record<string, Review> = {};
	let error = '';
	let prepared = false;
	let tracked: Animation[] = [];
	let inspectFrame = 0;
	let setupGeneration = 0;
	let primed = false;
	let playbackStartedAt = 0;
	let playbackStartedProgress = 0;
	let productLoad = 0;

	$: scenario = animationScenarios.find((item) => item.id === subject) || animationScenarios[0];
	$: reviewed = animationScenarios.filter(
		(item) => reviews[item.id] === 'approved' || reviews[item.id] === 'issue'
	).length;
	$: issues = animationScenarios.filter((item) => reviews[item.id] === 'issue').length;
	$: frameWidth =
		scenario.viewport === 'portrait' ? 393 : scenario.viewport === 'landscape' ? 852 : 960;
	$: frameHeight =
		scenario.viewport === 'portrait' ? 852 : scenario.viewport === 'landscape' ? 393 : 640;

	function frameDocument() {
		const document = frame?.contentDocument;
		if (!document) throw new Error('The real Todo frame is not available.');
		return document;
	}

	async function waitFor<T>(read: () => T | undefined | null | false, timeout = 12000): Promise<T> {
		const started = Date.now();
		while (Date.now() - started < timeout) {
			const value = read();
			if (value) return value;
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
		throw new Error('Timed out preparing the real Todo screen.');
	}

	function element(selector: string, root: ParentNode = frameDocument()) {
		const match = root.querySelector<HTMLElement>(selector);
		if (!match) throw new Error(`Real Todo control not found: ${selector}`);
		return match;
	}

	function buttonWithText(text: string, root: ParentNode = frameDocument()) {
		const match = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
			(button) => button.textContent?.replace(/\s+/g, ' ').trim() === text
		);
		if (!match) throw new Error(`Real Todo button not found: ${text}`);
		return match;
	}

	function clickableWithText(selector: string, text: string, root: ParentNode = frameDocument()) {
		const match = [...root.querySelectorAll<HTMLElement>(selector)].find(
			(node) => node.textContent?.replace(/\s+/g, ' ').trim() === text
		);
		if (!match) throw new Error(`Real Todo control not found: ${text}`);
		return match;
	}

	function setting(name: string, root: ParentNode = frameDocument()) {
		const match = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
			(button) => button.querySelector('strong')?.textContent?.trim() === name
		);
		if (!match) throw new Error(`Real Todo setting not found: ${name}`);
		return match;
	}

	function navigation(listId: string) {
		return element(`[data-navigation-id="${listId}"] .mdc-deprecated-list-item`);
	}

	function tapNavigation(listId: string) {
		navigation(listId).dispatchEvent(
			new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'touch' })
		);
	}

	async function settle() {
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);
		await waitFor(
			() =>
				reviewAnimations().every(
					(animation) => animation.playState !== 'running' && !animation.pending
				) || undefined,
			4000
		).catch(() => undefined);
	}

	function reviewAnimations() {
		return frameDocument()
			.getAnimations()
			.filter((animation) => {
				const target = (animation.effect as KeyframeEffect | null)?.target as Element | null;
				if (
					target?.matches('.mdc-drawer, .mdc-drawer-scrim') &&
					target.closest('.drawer-motion-suppressed')
				)
					return false;
				return (
					typeof target?.matches === 'function' &&
					target.matches(
						'.route-screen, .route-page-surface, .editor-screen, .task-details, .list-details, .profile-editor, .profile-settings, .mdc-drawer, .mdc-drawer-scrim, .mdc-top-app-bar, .app-content'
					)
				);
			});
	}

	async function loadProduct(path: string, reducedMotion = false) {
		localStorage.setItem(reducedMotionKey, reducedMotion ? 'true' : 'false');
		const target = new URL(path, location.origin);
		target.searchParams.set('__animationLabLoad', String(++productLoad));
		target.searchParams.set('__animationLabViewport', scenario.viewport);
		// Real editors protect their drafts from navigation. Scenario resets are
		// the one lab-owned unload, so mark it narrowly and clear it in the newly
		// loaded product before any reviewed interaction can begin.
		frame.contentWindow?.sessionStorage.setItem(ANIMATION_LAB_RESET_KEY, 'true');
		const loaded = new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(
				() => reject(new Error('Timed out loading the real Todo app.')),
				15000
			);
			frame.onload = () => {
				clearTimeout(timeout);
				resolve();
			};
		});
		frame.src = target.href;
		await loaded;
		frame.contentWindow?.sessionStorage.removeItem(ANIMATION_LAB_RESET_KEY);
		await waitFor(() => frame.contentDocument?.querySelector<HTMLElement>('.drawer-container'));
		await waitFor(() =>
			frame.contentDocument?.querySelector('.loading-screen')
				? undefined
				: frame.contentDocument?.querySelector<HTMLElement>('.route-screen')
		);
		await settle();
	}

	async function openTask(id = animationLabFixture.starredItemId) {
		element(
			`[aria-label="Edit details for ${
				id === animationLabFixture.starredItemId
					? 'Review animation timing'
					: 'Plan the next transition'
			}"]`
		).click();
		await waitFor(() =>
			frameDocument().querySelector<HTMLDialogElement>('dialog.task-details[open]')
		);
		await settle();
	}

	async function openListDetails() {
		element('[aria-label="Edit list"]').click();
		await waitFor(() =>
			frameDocument().querySelector<HTMLDialogElement>('dialog.list-details[open]')
		);
		await settle();
	}

	async function prepareSetup(setup: LabSetup) {
		const upper = `/lists?listId=${animationLabFixture.upperListId}`;
		const lower = `/lists?listId=${animationLabFixture.lowerListId}`;
		if (setup === 'lower-list') {
			await loadProduct(lower, scenario.reducedMotion);
			return;
		}
		if (setup.startsWith('profile')) {
			await loadProduct('/profile', scenario.reducedMotion);
			if (setup === 'profile') return;
			if (setup === 'profile-spacing') {
				element('[data-setting="spacing"]').click();
				await waitFor(() => frameDocument().querySelector('dialog.profile-editor[open]'));
				await settle();
				return;
			}
			element('[data-setting="labels"]').click();
			await waitFor(() => frameDocument().querySelector('dialog.profile-editor[open]'));
			await settle();
			if (setup === 'profile-labels') return;
			setting('House', element('dialog.profile-editor')).click();
			await settle();
			return;
		}

		await loadProduct(upper, scenario.reducedMotion);
		if (setup === 'upper-list') return;
		if (setup === 'upper-list-drawer') {
			element('[aria-label="Open navigation menu"]').click();
			await waitFor(() => element('.drawer-container').classList.contains('drawer-open'));
			await settle();
			return;
		}
		if (setup.startsWith('list')) {
			element('[aria-label="Open navigation menu"]').click();
			await waitFor(() => element('.drawer-container').classList.contains('drawer-open'));
			await settle();
			await openListDetails();
			if (setup === 'list-sharing') {
				setting('Sharing', element('dialog.list-details')).click();
				await settle();
			}
			return;
		}
		if (setup === 'task-repeat-via-date' || setup === 'task-repeat-after-date') {
			await openTask(animationLabFixture.undatedItemId);
			setting('Repeat', element('dialog.task-details')).click();
			await settle();
			if (setup === 'task-repeat-after-date') {
				buttonWithText('Done', element('dialog.task-details')).click();
				await settle();
			}
			return;
		}
		await openTask();
		if (setup === 'task-date') {
			setting('Due date', element('dialog.task-details')).click();
			await settle();
		}
	}

	async function setupSelected() {
		if (!prepared) return;
		const generation = ++setupGeneration;
		tracked.forEach((animation) => animation.cancel());
		tracked = [];
		primed = false;
		playerState = 'preparing';
		progress = 0;
		moving = 0;
		error = '';
		try {
			await tick();
			await prepareSetup(scenario.setup);
			if (generation !== setupGeneration) return;
			performTrigger(scenario.trigger);
			await captureAnimations();
			if (generation !== setupGeneration) return;
			if (tracked.length) {
				primed = true;
				setProgress(0);
			} else {
				// Some product actions are deliberately instant. Reload their setup so
				// priming does not leave the preview in its post-trigger state.
				await undoInstantTrigger(scenario.trigger);
				await prepareSetup(scenario.setup);
				if (generation !== setupGeneration) return;
				progress = 0;
			}
			playerState = 'ready';
			const url = new URL(location.href);
			url.searchParams.set('scenario', subject);
			url.searchParams.set('speed', String(speed));
			history.replaceState(null, '', url);
		} catch (cause) {
			if (generation !== setupGeneration) return;
			error = cause instanceof Error ? cause.message : String(cause);
			playerState = 'error';
		}
	}

	function performTrigger(trigger: LabTrigger) {
		const document = frameDocument();
		const taskDialog = () => element('dialog.task-details', document);
		const listDialog = () => element('dialog.list-details', document);
		const profileDialog = () => element('dialog.profile-editor', document);
		switch (trigger) {
			case 'open-drawer':
				element('[aria-label="Open navigation menu"]').click();
				break;
			case 'dismiss-drawer':
				element('.mdc-drawer-scrim').click();
				break;
			case 'select-upper-list':
				tapNavigation(animationLabFixture.upperListId);
				break;
			case 'select-lower-list':
				tapNavigation(animationLabFixture.lowerListId);
				break;
			case 'select-profile':
				clickableWithText(
					'.mdc-deprecated-list-item__text',
					'Profile',
					element('.mdc-drawer')
				).click();
				break;
			case 'open-task':
				element('[aria-label="Edit details for Review animation timing"]').click();
				break;
			case 'close-task':
				buttonWithText('Cancel', taskDialog()).click();
				break;
			case 'open-date':
				setting('Due date', taskDialog()).click();
				break;
			case 'open-repeat':
				setting('Repeat', taskDialog()).click();
				break;
			case 'finish-date':
				buttonWithText('Done', taskDialog()).click();
				break;
			case 'back-details':
				buttonWithText('‹ Details', taskDialog()).click();
				break;
			case 'back-date':
				buttonWithText('‹ Details', taskDialog()).click();
				break;
			case 'open-list-details':
				element('[aria-label="Edit list"]').click();
				break;
			case 'close-list-details':
				buttonWithText('Close', listDialog()).click();
				break;
			case 'open-sharing':
				setting('Sharing', listDialog()).click();
				break;
			case 'back-list-details':
				buttonWithText('‹ Details', listDialog()).click();
				break;
			case 'open-spacing':
				element('[data-setting="spacing"]').click();
				break;
			case 'back-profile':
				buttonWithText('‹ Profile', profileDialog()).click();
				break;
			case 'open-profile-label':
				setting('House', profileDialog()).click();
				break;
			case 'back-labels':
				buttonWithText('‹ Labels', profileDialog()).click();
				break;
		}
	}

	async function undoInstantTrigger(trigger: LabTrigger) {
		if (trigger === 'open-task') {
			buttonWithText('Cancel', element('dialog.task-details')).click();
			await waitFor(() => !frameDocument().querySelector('dialog.task-details[open]'));
		} else if (trigger === 'open-list-details') {
			buttonWithText('Close', element('dialog.list-details')).click();
			await waitFor(() => !frameDocument().querySelector('dialog.list-details[open]'));
		} else if (trigger === 'open-spacing') {
			buttonWithText('‹ Profile', element('dialog.profile-editor')).click();
			await waitFor(() => !frameDocument().querySelector('dialog.profile-editor[open]'));
		}
	}

	async function captureAnimations() {
		// Route changes do not necessarily mount their keyed screen in the same
		// frame as the click. Catch and pause each product-screen animation as
		// soon as it appears. Keeping the real animation paused lets the timeline
		// inspect any frame without allowing component cleanup to remove its DOM.
		const found = new Set<Animation>();
		const started = performance.now();
		do {
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
			for (const animation of reviewAnimations()) {
				if (animation.playState !== 'running' && !animation.pending) continue;
				animation.pause();
				found.add(animation);
			}
		} while (
			performance.now() - started < 80 ||
			(!found.size && performance.now() - started < 600)
		);
		tracked = [...found].map((animation) => {
			const effect = animation.effect as KeyframeEffect | null;
			const target = effect?.target as HTMLElement | null;
			if (!effect || !target || typeof target.matches !== 'function') return animation;
			if (animation.constructor.name !== 'CSSAnimation') return animation;
			if (
				!target.matches(
					'.route-screen, .editor-screen, .task-details, .list-details, .profile-editor'
				)
			)
				return animation;

			// Svelte removes an outgoing element and clears an incoming element's
			// generated animation on its own wall-clock, even when DevTools pauses
			// that animation. Review a visual clone so every captured frame remains
			// seekable after the real component has completed its cleanup.
			const clone = target.cloneNode(true) as HTMLElement;
			clone.dataset.animationLabClone = 'true';
			clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
			// cloneNode also copies Svelte's generated CSS animation declaration.
			// Letting that continue underneath the seekable Web Animation advances
			// the clone on wall-clock time and makes the timeline lie about its frame.
			clone.style.animation = 'none';
			target.style.visibility = 'hidden';
			// The product runs in an iframe, so cross-realm `instanceof
			// HTMLDialogElement` is false even for a real dialog.
			if (target.matches('dialog')) {
				clone.setAttribute('open', '');
				clone.style.display = 'block';
				clone.style.zIndex = '2147483646';
				// A cloned modal is no longer in the browser's top layer, so its auto
				// margins otherwise give it a different origin from the real dialog.
				// Pin the clone to the real dialog's untransformed box before replaying
				// the captured transform keyframes.
				clone.style.position = 'fixed';
				clone.style.inset = 'auto';
				clone.style.left = `${target.offsetLeft}px`;
				clone.style.top = `${target.offsetTop}px`;
				clone.style.width = `${target.offsetWidth}px`;
				clone.style.height = `${target.offsetHeight}px`;
				clone.style.margin = '0';
				frameDocument().body.append(clone);
			} else target.after(clone);
			if (target.matches('.route-screen') && target.parentElement) {
				const stage = target.parentElement;
				stage.style.display = 'grid';
				stage.style.gridTemplateAreas = "'screen'";
				stage.querySelectorAll<HTMLElement>('.route-screen').forEach((screen) => {
					screen.style.gridArea = 'screen';
					screen.style.height = '100%';
					screen.style.width = '100%';
					screen.style.minHeight = '0';
					screen.style.minWidth = '0';
					screen.style.overflow = 'hidden';
				});
			}

			const timing = effect.getTiming();
			const replacement = clone.animate(effect.getKeyframes(), {
				delay: timing.delay,
				endDelay: timing.endDelay,
				duration: timing.duration,
				easing: timing.easing,
				fill: timing.fill,
				iterationStart: timing.iterationStart,
				iterations: timing.iterations,
				direction: timing.direction
			});
			replacement.pause();
			return replacement;
		});
		moving = 0;
	}

	async function trigger() {
		if (playerState === 'moving') {
			togglePause();
			return;
		}
		if (playerState === 'paused') {
			toolsOpen = false;
			startPlayback();
			return;
		}
		if (playerState === 'complete') await setupSelected();
		if (playerState !== 'ready') return;
		toolsOpen = false;
		try {
			if (!primed) {
				performTrigger(scenario.trigger);
				await captureAnimations();
				if (!tracked.length) {
					progress = 100;
					playerState = 'complete';
					return;
				}
				primed = true;
				setProgress(0);
			}
			startPlayback();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
			playerState = 'error';
			toolsOpen = true;
		}
	}

	function togglePause() {
		if (!tracked.length) return;
		if (playerState === 'paused') startPlayback();
		else {
			moving = 0;
			playerState = 'paused';
		}
	}

	function animationEndTime(animation: Animation) {
		return Number(animation.effect?.getComputedTiming().endTime || 1);
	}

	function timelineDuration() {
		return MOBILE_SCREEN_DURATION;
	}

	function setProgress(value: number) {
		const clamped = Math.max(0, Math.min(100, value));
		tracked.forEach((animation) => {
			animation.pause();
			// Landing exactly on endTime dispatches the product transition's finish
			// cleanup. Stop an imperceptible fraction short so 100% remains rewindable.
			const reviewableEnd = Math.max(0, animationEndTime(animation) - 1);
			animation.currentTime = Math.min(
				reviewableEnd,
				(animationEndTime(animation) * clamped) / 100
			);
		});
		progress = clamped;
	}

	function startPlayback() {
		if (!tracked.length) return;
		playbackStartedAt = performance.now();
		playbackStartedProgress = progress;
		moving = tracked.length;
		playerState = 'moving';
	}

	function seek(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		if (!tracked.length) return;
		setProgress(value);
		moving = 0;
		playerState = value >= 100 ? 'complete' : 'paused';
	}

	function changeSpeed() {
		if (playerState !== 'moving') return;
		playbackStartedAt = performance.now();
		playbackStartedProgress = progress;
	}

	function setReview(value: Review) {
		reviews = { ...reviews, [subject]: reviews[subject] === value ? 'pending' : value };
		localStorage.setItem(reviewKey, JSON.stringify(reviews));
	}

	async function next(pendingOnly = false) {
		const index = animationScenarios.findIndex((item) => item.id === subject);
		const ordered = [
			...animationScenarios.slice(index + 1),
			...animationScenarios.slice(0, index + 1)
		];
		const target = pendingOnly
			? ordered.find((item) => !reviews[item.id] || reviews[item.id] === 'pending') || ordered[0]
			: ordered[0];
		subject = target.id;
		await setupSelected();
	}

	onMount(async () => {
		const params = new URLSearchParams(location.search);
		if (animationScenarios.some((item) => item.id === params.get('scenario')))
			subject = params.get('scenario')!;
		const requestedSpeed = Number(params.get('speed'));
		if ([0.1, 0.25, 0.5, 1, 2].includes(requestedSpeed)) speed = requestedSpeed;
		try {
			reviews = JSON.parse(localStorage.getItem(reviewKey) || '{}');
		} catch {
			reviews = {};
		}

		try {
			await new Promise<void>((resolve, reject) => {
				const request = indexedDB.deleteDatabase('TODOS');
				request.onsuccess = () => resolve();
				request.onerror = () =>
					reject(request.error || new Error('Could not clear the Todo animation-lab cache.'));
				request.onblocked = () =>
					reject(
						new Error(
							'Another Todo animation-lab tab is using the local cache. Close the other lab tabs, then reload this page.'
						)
					);
			});
			await prepareAnimationLabFixture();
			prepared = true;
			await tick();
			await setupSelected();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
			playerState = 'error';
		}

		const inspect = (now: number) => {
			if (tracked.length && playerState === 'moving') {
				const elapsed = (now - playbackStartedAt) * Number(speed);
				const next = playbackStartedProgress + (elapsed / timelineDuration()) * 100;
				setProgress(next);
				if (next >= 100) {
					moving = 0;
					playerState = 'complete';
				}
			}
			inspectFrame = requestAnimationFrame(inspect);
		};
		inspectFrame = requestAnimationFrame(inspect);
	});

	onDestroy(() => {
		cancelAnimationFrame(inspectFrame);
		localStorage.removeItem(reducedMotionKey);
	});
</script>

<svelte:head><title>Real-product animation lab · Todo</title></svelte:head>

<main class="lab">
	<section class="product-stage" aria-label={`${scenario.name} real Todo preview`}>
		{#if prepared}
			<div
				class:portrait={scenario.viewport === 'portrait'}
				class:landscape={scenario.viewport === 'landscape'}
				class:desktop={scenario.viewport === 'desktop'}
				class="device"
				style:--frame-width={`${frameWidth}px`}
				style:--frame-height={`${frameHeight}px`}
			>
				<iframe bind:this={frame} title="Real Todo product" src="about:blank"></iframe>
			</div>
		{:else}
			<div class="boot">
				{#if playerState === 'error'}
					<strong>Could not prepare the animation lab</strong>
					<small>{error}</small>
					<button on:click={() => location.reload()}>Reload</button>
				{:else}
					<span class="spinner"></span><strong>Preparing real Todo…</strong><small
						>Starting an isolated Firebase-backed product session.</small
					>
				{/if}
			</div>
		{/if}
	</section>

	<aside class:open={toolsOpen} class="lab-tools" aria-label="Animation lab controls">
		<div class="quick-controls">
			<button class="lab-title" on:click={() => (toolsOpen = !toolsOpen)} aria-expanded={toolsOpen}
				>Real Todo lab {toolsOpen ? '▾' : '▴'}</button
			>
			<button
				class="primary"
				disabled={!prepared || playerState === 'preparing' || playerState === 'error'}
				on:click={trigger}
			>
				{playerState === 'moving'
					? 'Pause'
					: playerState === 'paused'
					? 'Play'
					: playerState === 'complete'
					? 'Replay'
					: primed
					? 'Play'
					: 'Trigger'}
			</button>
			<button disabled={!prepared || playerState === 'preparing'} on:click={setupSelected}
				>Reset</button
			>
			<button disabled={!prepared || playerState === 'preparing'} on:click={() => next()}
				>Next →</button
			>
			<span class:active={playerState === 'moving'} class="status" role="status"
				>{moving ? `${moving} moving` : playerState}</span
			>
		</div>

		{#if toolsOpen}
			<div class="settings">
				<label
					>Scenario<select
						bind:value={subject}
						on:change={setupSelected}
						aria-label="Animation scenario"
						disabled={!prepared || playerState === 'preparing'}
					>
						{#each animationGroups as group}<optgroup label={group}
								>{#each animationScenarios.filter((item) => item.group === group) as item}<option
										value={item.id}
										>{reviews[item.id] === 'approved'
											? '✓ '
											: reviews[item.id] === 'issue'
											? '! '
											: ''}{item.name}</option
									>{/each}</optgroup
							>{/each}
					</select></label
				>
				<div class="control-row">
					<label
						>Playback speed<select
							bind:value={speed}
							on:change={changeSpeed}
							aria-label="Playback speed"
							><option value={0.1}>¹⁄₁₀×</option><option value={0.25}>¼×</option><option value={0.5}
								>½×</option
							><option value={1}>Normal</option><option value={2}>2×</option></select
						></label
					>
					<div class="facts">
						<strong>{scenario.viewport}</strong><span>{frameWidth} × {frameHeight}</span><span
							>real UI</span
						>
					</div>
				</div>
				<label class="timeline-label" for="timeline">Timeline · {Math.round(progress)}%</label>
				<input
					id="timeline"
					class="timeline"
					type="range"
					min="0"
					max="100"
					step="1"
					value={progress}
					on:input={seek}
					disabled={!tracked.length}
				/>
				<section class="expectation">
					<span>Expected</span>
					<p>{scenario.expected}</p>
				</section>
				{#if error}<p class="error" role="alert">{error}</p>{/if}
				<div class="review-controls">
					<span
						>{reviewed}/{animationScenarios.length} reviewed{issues
							? ` · ${issues} need changes`
							: ''}</span
					>
					<div>
						<button
							class:chosen={reviews[subject] === 'approved'}
							on:click={() => setReview('approved')}>✓ Looks right</button
						><button
							class:chosen-issue={reviews[subject] === 'issue'}
							on:click={() => setReview('issue')}>! Needs changes</button
						>
					</div>
					<button class="next-pending" on:click={() => next(true)}>Next unreviewed →</button>
				</div>
				<p class="note">
					This is the real Todo app, components, router, dialogs, store, and Firestore replay
					running against isolated emulators. The lab only seeds data and drives real controls.
				</p>
			</div>
		{/if}
	</aside>
</main>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		min-height: 100%;
		background: #1d1715;
		font-family: Roboto, sans-serif;
	}
	:global(body) {
		overflow: hidden;
	}
	.lab {
		min-height: 100svh;
		color: #f6eee9;
		background: radial-gradient(circle at 42% 35%, #4f3b33 0, #211916 48%, #130e0d 100%);
	}
	.product-stage {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		padding: 20px 424px 20px 16px;
		overflow: auto;
	}
	.device {
		width: var(--frame-width);
		height: var(--frame-height);
		max-width: calc(100vw - 456px);
		max-height: calc(100svh - 40px);
		overflow: hidden;
		border: 9px solid #272321;
		border-radius: 30px;
		background: #111;
		box-shadow: 0 18px 55px #160d0966;
	}
	.device.landscape {
		border-radius: 24px;
	}
	.device.desktop {
		border-width: 7px;
		border-radius: 13px;
	}
	.device iframe {
		display: block;
		width: 100%;
		height: 100%;
		border: 0;
		background: #fafafa;
	}
	.boot {
		display: grid;
		justify-items: center;
		gap: 10px;
		color: #eadbd4;
	}
	.boot small {
		color: #bbaaa3;
		max-width: 32rem;
		text-align: center;
	}
	.boot button {
		min-height: 34px;
		border: 1px solid #9f7d6e;
		border-radius: 6px;
		padding: 5px 12px;
		background: #3b2c27;
		color: #f7ede8;
		cursor: pointer;
	}
	.spinner {
		width: 26px;
		height: 26px;
		border: 3px solid #806359;
		border-top-color: #e0b29d;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.lab-tools {
		position: fixed;
		z-index: 100;
		top: 50%;
		right: 12px;
		width: 400px;
		max-width: calc(100vw - 16px);
		transform: translateY(-50%);
		border: 1px solid #9f7d6e;
		border-radius: 11px;
		background: #231a17f5;
		box-shadow: 0 10px 32px #0008;
		color: #f7ede8;
		font:
			12px/1.4 Roboto,
			sans-serif;
		backdrop-filter: blur(12px);
	}
	.quick-controls {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px;
		flex-wrap: wrap;
	}
	.quick-controls button,
	.settings button,
	select {
		min-height: 34px;
		box-sizing: border-box;
		border: 1px solid #806359;
		border-radius: 6px;
		padding: 5px 9px;
		background: #3b2c27;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.quick-controls button:disabled,
	.settings button:disabled,
	select:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.quick-controls .primary {
		background: #e0b29d;
		border-color: #e0b29d;
		color: #2c1c17;
		font-weight: 700;
	}
	.lab-title {
		font-weight: 700;
	}
	.status {
		margin-left: auto;
		color: #bdb0ab;
	}
	.status.active {
		color: #f4ddd3;
	}
	.settings {
		max-height: calc(100svh - 80px);
		overflow: auto;
		padding: 0 12px 12px;
	}
	.settings > label {
		display: grid;
		gap: 4px;
		margin: 8px 0;
	}
	select {
		width: 100%;
	}
	.control-row {
		display: flex;
		align-items: flex-end;
		gap: 8px;
	}
	.control-row label {
		display: grid;
		flex: 1;
		gap: 4px;
	}
	.facts {
		display: flex;
		gap: 4px;
	}
	.facts > * {
		min-height: 32px;
		display: grid;
		place-items: center;
		padding: 0 7px;
		border-radius: 6px;
		background: #30231f;
		color: #cdbeb8;
		text-transform: capitalize;
	}
	.timeline-label {
		display: block;
		margin: 10px 0 2px;
		color: #cdbeb8;
	}
	.timeline {
		width: 100%;
		accent-color: #dda98f;
	}
	.expectation {
		margin: 10px 0;
		padding: 10px 12px;
		border-left: 3px solid #d9a88f;
		border-radius: 4px;
		background: #30231f;
	}
	.expectation > span {
		color: #d9a88f;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.expectation p {
		margin: 4px 0;
	}
	.error {
		padding: 8px;
		border-radius: 5px;
		background: #5a2924;
		color: #ffd8d0;
	}
	.review-controls {
		display: grid;
		gap: 7px;
	}
	.review-controls > span {
		color: #c7b8b2;
	}
	.review-controls > div {
		display: flex;
		gap: 7px;
	}
	.review-controls > div button {
		flex: 1;
	}
	.review-controls .chosen {
		border-color: #7ca57e;
		background: #315034;
	}
	.review-controls .chosen-issue {
		border-color: #d78f76;
		background: #613628;
	}
	.review-controls .next-pending {
		width: 100%;
	}
	.note {
		margin: 10px 0 0;
		color: #aa9b95;
		font-size: 11px;
	}
	@media (max-width: 1049px) {
		.product-stage {
			padding: 76px 16px 16px;
		}
		.device {
			max-width: calc(100vw - 32px);
			max-height: calc(100svh - 92px);
		}
		.lab-tools {
			top: 8px;
			left: 50%;
			right: auto;
			width: 560px;
			transform: translateX(-50%);
		}
		.settings {
			max-height: 55svh;
		}
	}
	@media (max-width: 620px) {
		.control-row {
			align-items: stretch;
			flex-direction: column;
		}
		.facts {
			flex-wrap: wrap;
		}
		.quick-controls .status {
			display: none;
		}
	}
</style>
