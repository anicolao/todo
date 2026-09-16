<script lang="ts">
	import { RepeatType, type DueDate } from './items';
	import { formatDate, localDate, repeatSummary, validInterval } from './recurrence';
	export let date: DueDate;
	export let type: RepeatType;
	export let every: string;
	$: hasInterval = type !== RepeatType.NONE && type !== RepeatType.WEEKDAYS;
	$: valid = !hasInterval || validInterval(every);
	$: preview = { ...date, repeats: { type, every: hasInterval ? Number(every) : 1 } };
	const options = [
		{ type: RepeatType.NONE, label: 'Does not repeat' },
		{ type: RepeatType.DAILY, label: 'Daily' },
		{ type: RepeatType.WEEKLY, label: 'Weekly' },
		{ type: RepeatType.MONTHLY, label: 'Monthly' },
		{ type: RepeatType.YEARLY, label: 'Yearly' },
		{ type: RepeatType.WEEKDAYS, label: 'Weekdays' }
	];
	const units = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year',
		none: '',
		weekdays: ''
	};
	function step(delta: number) {
		every = String(Math.min(365, Math.max(1, (validInterval(every) ? Number(every) : 1) + delta)));
	}
</script>

<fieldset class="choices">
	<legend class="sr-only">Repeat schedule</legend>
	{#each options as option}
		<label class:chosen={type === option.type}>
			<input type="radio" name="repeat-rule" bind:group={type} value={option.type} />
			<span
				><strong>{option.label}</strong>
				{#if option.type === RepeatType.WEEKLY}<small
						>On {localDate(date).toLocaleDateString(undefined, { weekday: 'long' })}</small
					>{/if}
				{#if option.type === RepeatType.MONTHLY}<small>On day {date.day}</small>{/if}
				{#if option.type === RepeatType.YEARLY}<small
						>On {localDate(date).toLocaleDateString(undefined, {
							month: 'short',
							day: 'numeric'
						})}</small
					>{/if}
				{#if option.type === RepeatType.WEEKDAYS}<small>Monday–Friday</small>{/if}
			</span>
		</label>
	{/each}
</fieldset>
{#if hasInterval}
	<label class="interval-label" for="repeat-every">Every</label>
	<div class="interval">
		<button
			aria-label="Decrease interval"
			disabled={valid && Number(every) <= 1}
			on:click={() => step(-1)}>−</button
		>
		<input
			id="repeat-every"
			type="text"
			inputmode="numeric"
			bind:value={every}
			aria-invalid={!valid}
			aria-describedby={!valid ? 'interval-error' : undefined}
		/>
		<button
			aria-label="Increase interval"
			disabled={valid && Number(every) >= 365}
			on:click={() => step(1)}>+</button
		>
		<span>{units[type]}{Number(every) === 1 ? '' : 's'}</span>
	</div>
{/if}
{#if valid}
	<div class="summary" aria-live="polite">
		<strong>{repeatSummary(preview)}</strong>{#if type !== RepeatType.NONE}<p>
				Starting {formatDate(date)}
			</p>{/if}
	</div>
	{#if type === RepeatType.WEEKDAYS && [0, 6].includes(localDate(date).getDay())}<p>
			First due {localDate(date).toLocaleDateString(undefined, { weekday: 'long' })}; then
			Monday–Friday.
		</p>{/if}
{:else}
	<p class="error" id="interval-error" role="alert">Enter a whole number from 1 to 365.</p>
	<p>Your saved schedule has not changed.</p>
{/if}

<style>
	.choices {
		padding: 0;
		margin: 0;
		border: 0;
		border-radius: 14px;
		background: var(--detail-card);
		overflow: hidden;
	}
	.choices label {
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: 48px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--detail-border);
		cursor: pointer;
	}
	.choices label:last-child {
		border: 0;
	}
	.chosen,
	.summary {
		background: var(--detail-tint);
	}
	input[type='radio'] {
		width: 24px;
		height: 24px;
		flex-shrink: 0;
		accent-color: var(--detail-accent);
	}
	small {
		display: block;
		margin-top: 4px;
		font-size: 0.88em;
		color: var(--detail-muted);
	}
	.interval-label {
		display: block;
		margin: 20px 0 8px;
		font-weight: 600;
	}
	.interval {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		padding: 8px;
		background: var(--detail-card);
		border-radius: 12px;
	}
	.interval button,
	.interval input {
		font: inherit;
		min-height: 48px;
		color: inherit;
		border: 1px solid var(--detail-border);
		border-radius: 8px;
		background: var(--detail-bg);
	}
	.interval button {
		min-width: 48px;
		font-size: 1.4em;
		cursor: pointer;
	}
	.interval input {
		width: 4em;
		min-width: 0;
		text-align: center;
	}
	.interval input[aria-invalid='true'] {
		border-color: var(--detail-error);
	}
	button:disabled {
		opacity: 0.45;
	}
	.summary {
		border-radius: 12px;
		padding: 16px;
		margin-top: 20px;
	}
	.summary p {
		margin: 8px 0 0;
		color: var(--detail-muted);
	}
	.error {
		color: var(--detail-error);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	input:focus-visible,
	button:focus-visible {
		outline: 3px solid var(--detail-accent);
		outline-offset: 1px;
	}
</style>
