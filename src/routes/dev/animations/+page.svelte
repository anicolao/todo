<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { MOBILE_SCREEN_DURATION } from '$lib/mobile-transitions';
	import AnimationStage from './AnimationStage.svelte';
	import { animationGroups, animationScenarios } from './scenarios';

	type Review = 'pending' | 'approved' | 'issue';
	type PlayerState = 'ready' | 'moving' | 'paused' | 'complete';
	const reviewKey = 'todo-animation-lab-reviews-v1';
	let subject = animationScenarios[0].id;
	let stage: AnimationStage;
	let speed = 1;
	let playerState: PlayerState = 'ready';
	let progress = 0;
	let toolsOpen = true;
	let reviews: Record<string, Review> = {};
	let mounted = false;

	$: scenario = animationScenarios.find((item) => item.id === subject) || animationScenarios[0];
	$: approved = animationScenarios.filter((item) => reviews[item.id] === 'approved').length;
	$: issues = animationScenarios.filter((item) => reviews[item.id] === 'issue').length;
	$: reviewed = approved + issues;

	function updateUrl() {
		if (!mounted) return;
		const url = new URL(location.href);
		url.searchParams.set('scenario', subject);
		url.searchParams.set('speed', String(speed));
		history.replaceState(null, '', url);
	}

	async function selectScenario(id = subject, autoplay = false) {
		subject = id;
		playerState = 'ready';
		progress = 0;
		updateUrl();
		await tick();
		stage?.reset();
		if (autoplay) stage?.play();
	}

	function trigger() {
		if (playerState === 'moving' || playerState === 'paused') return stage.togglePause();
		toolsOpen = false;
		stage.play();
	}

	function next() {
		const index = animationScenarios.findIndex((item) => item.id === subject);
		void selectScenario(animationScenarios[(index + 1) % animationScenarios.length].id, true);
	}

	function nextPending() {
		const index = animationScenarios.findIndex((item) => item.id === subject);
		const ordered = [
			...animationScenarios.slice(index + 1),
			...animationScenarios.slice(0, index + 1)
		];
		const pending = ordered.find((item) => !reviews[item.id] || reviews[item.id] === 'pending');
		void selectScenario((pending || ordered[0]).id, true);
	}

	function setReview(value: Review) {
		reviews = { ...reviews, [subject]: reviews[subject] === value ? 'pending' : value };
		localStorage.setItem(reviewKey, JSON.stringify(reviews));
	}

	function changeSpeed() {
		stage?.setSpeed(Number(speed));
		updateUrl();
	}

	function stateChanged(event: CustomEvent<{ state: PlayerState; progress: number }>) {
		playerState = event.detail.state;
		progress = event.detail.progress;
	}

	function seek(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		progress = value;
		stage.seek(value);
	}

	onMount(() => {
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
		mounted = true;
		void selectScenario(subject);
	});
</script>

<svelte:head>
	<title>Animation lab · Todo</title>
	<meta
		name="description"
		content="Review every mobile screen transition before integrating it into Todo."
	/>
</svelte:head>

<main class="lab">
	<section class="review-stage" aria-label={`${scenario.name} preview`}>
		<AnimationStage bind:this={stage} {scenario} {speed} on:state={stateChanged} />
	</section>

	<aside class:open={toolsOpen} class="lab-tools" aria-label="Animation lab controls">
		<div class="quick-controls">
			<button class="lab-title" on:click={() => (toolsOpen = !toolsOpen)} aria-expanded={toolsOpen}
				>Animation lab {toolsOpen ? '▾' : '▴'}</button
			>
			<button class="primary" on:click={trigger}>
				{playerState === 'moving'
					? 'Pause'
					: playerState === 'paused'
					? 'Resume'
					: playerState === 'complete'
					? 'Replay'
					: 'Trigger'}
			</button>
			<button on:click={() => stage.reset()}>Reset</button>
			<button on:click={next}>Next →</button>
			<span class:active={playerState === 'moving'} class="status" role="status">{playerState}</span
			>
		</div>

		{#if toolsOpen}
			<div class="settings">
				<label>
					Scenario
					<select
						bind:value={subject}
						on:change={() => selectScenario()}
						aria-label="Animation scenario"
					>
						{#each animationGroups as group}
							<optgroup label={group}>
								{#each animationScenarios.filter((item) => item.group === group) as item}
									<option value={item.id}>
										{reviews[item.id] === 'approved'
											? '✓ '
											: reviews[item.id] === 'issue'
											? '! '
											: ''}{item.name}
									</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</label>

				<div class="control-row">
					<label>
						Playback speed
						<select bind:value={speed} on:change={changeSpeed} aria-label="Playback speed">
							<option value={0.1}>¹⁄₁₀×</option>
							<option value={0.25}>¼×</option>
							<option value={0.5}>½×</option>
							<option value={1}>Normal</option>
							<option value={2}>2×</option>
						</select>
					</label>
					<div class="facts" aria-label="Animation facts">
						<strong>{scenario.viewport}</strong>
						<span>{scenario.movement}</span>
						<span>{scenario.motion === 'instant' ? '0' : MOBILE_SCREEN_DURATION} ms</span>
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
				/>

				<section class="expectation">
					<span>Expected</span>
					<p>{scenario.expected}</p>
					<small>{scenario.from} → {scenario.to}</small>
				</section>

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
						>
						<button
							class:chosen-issue={reviews[subject] === 'issue'}
							on:click={() => setReview('issue')}>! Needs changes</button
						>
					</div>
					<button class="next-pending" on:click={nextPending}>Next unreviewed →</button>
				</div>

				<p class="note">
					The preview uses Todo's shared direction offsets, {MOBILE_SCREEN_DURATION} ms timing, and cubic-out
					curve. Slow, pause, or scrub to compare both screens. Review choices stay only in this browser.
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
		background: radial-gradient(circle at 50% 35%, #4f3b33 0, #211916 48%, #130e0d 100%);
	}
	.review-stage {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		box-sizing: border-box;
		padding: 88px 16px 22px;
		overflow: auto;
	}
	.lab-tools {
		position: fixed;
		z-index: 100;
		top: 8px;
		left: 50%;
		width: 560px;
		max-width: calc(100vw - 16px);
		transform: translateX(-50%);
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
	.quick-controls button:hover,
	.settings button:hover {
		background: #49352e;
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
		padding: 3px 6px;
		border-radius: 20px;
		color: #bdb0ab;
		text-transform: capitalize;
	}
	.status.active {
		color: #d9c5bc;
		background: #50392f;
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
		gap: 10px;
	}
	.control-row label {
		display: grid;
		flex: 1;
		gap: 4px;
	}
	.facts {
		display: flex;
		gap: 5px;
		padding-bottom: 1px;
	}
	.facts > * {
		min-height: 32px;
		display: grid;
		place-items: center;
		padding: 0 8px;
		border-radius: 6px;
		background: #30231f;
		color: #cdbeb8;
		text-transform: capitalize;
	}
	.facts strong {
		color: #f4ddd3;
	}
	.timeline-label {
		display: block;
		margin: 10px 0 2px;
		color: #cdbeb8;
	}
	.timeline {
		width: 100%;
		accent-color: #dda98f;
		cursor: ew-resize;
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
	.expectation small {
		color: #a99a94;
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
	@media (max-width: 620px) {
		.review-stage {
			align-items: start;
			padding-top: 84px;
		}
		.lab-tools {
			top: 4px;
		}
		.settings {
			max-height: 55svh;
		}
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
	@media (min-width: 1050px) {
		.review-stage {
			padding-right: 424px;
		}
		.lab-tools {
			top: 50%;
			left: auto;
			right: 12px;
			width: 400px;
			transform: translateY(-50%);
		}
	}
</style>
