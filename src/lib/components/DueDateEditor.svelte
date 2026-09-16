<script lang="ts">
	import { dateParts, dateValue, formatDate, localDate, parseDate } from './recurrence';
	import type { DueDate } from './items';
	export let value: DueDate;
	export let onChange: (value: DueDate | undefined) => void;
	let input = dateValue(value);
	let month = new Date(value.year, value.month - 1, 1);
	const locale = Intl.DateTimeFormat().resolvedOptions().locale;
	// Older WebViews lack Intl.Locale.weekInfo. US/Canada use Sunday; others default Monday.
	const info = new Intl.Locale(locale) as Intl.Locale & {
		weekInfo?: { firstDay: number };
		getWeekInfo?: () => { firstDay: number };
	};
	const weekStart =
		(info.weekInfo?.firstDay ??
			info.getWeekInfo?.().firstDay ??
			(/-(US|CA)$/.test(locale) ? 7 : 1)) % 7;
	const weekdays = Array.from({ length: 7 }, (_, i) =>
		new Date(2026, 8, 6 + ((i + weekStart) % 7)).toLocaleDateString(locale, { weekday: 'narrow' })
	);
	$: days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
	$: offset = (month.getDay() - weekStart + 7) % 7;
	$: selected = parseDate(input);
	function choose(date: Date) {
		value = dateParts(date);
		input = dateValue(value);
		month = new Date(value.year, value.month - 1, 1);
		onChange(value);
	}
	function typeDate() {
		const parsed = parseDate(input);
		if (parsed) month = new Date(parsed.year, parsed.month - 1, 1);
		onChange(parsed);
	}
	function shortcut(days: number) {
		const date = new Date();
		date.setDate(date.getDate() + days);
		return date;
	}
</script>

<div class="quick-dates">
	{#each [{ label: 'Today', days: 0 }, { label: 'Tomorrow', days: 1 }, { label: 'Next week', days: 7 }] as quick}
		<button type="button" on:click={() => choose(shortcut(quick.days))}
			><strong>{quick.label}</strong><span>{formatDate(dateParts(shortcut(quick.days)))}</span
			></button
		>
	{/each}
</div>
<label class="date-input"
	>Due date<input
		aria-label="Due date"
		type="date"
		min="0001-01-01"
		max="9999-12-31"
		bind:value={input}
		on:input={typeDate}
		aria-invalid={!selected}
		aria-describedby={!selected ? 'date-error' : undefined}
	/></label
>
{#if !selected}<p id="date-error" role="alert">Choose a valid date.</p>{/if}
<section class="calendar" aria-label="Calendar">
	<div class="month-heading">
		<button
			type="button"
			aria-label="Previous month"
			on:click={() => (month = new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button
		>
		<strong aria-live="polite"
			>{month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</strong
		>
		<button
			type="button"
			aria-label="Next month"
			on:click={() => (month = new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button
		>
	</div>
	<div class="days">
		{#each weekdays as weekday}<span aria-hidden="true">{weekday}</span>{/each}
		{#each Array(days) as _, index}
			{@const date = new Date(month.getFullYear(), month.getMonth(), index + 1)}
			<button
				type="button"
				class:selected={selected && dateValue(dateParts(date)) === dateValue(selected)}
				style:grid-column-start={index === 0 ? offset + 1 : undefined}
				aria-label={formatDate(dateParts(date))}
				aria-pressed={!!selected && dateValue(dateParts(date)) === dateValue(selected)}
				on:click={() => choose(date)}>{index + 1}</button
			>
		{/each}
	</div>
</section>

<style>
	.quick-dates {
		display: grid;
		gap: 8px;
	}
	button,
	input {
		font: inherit;
		color: inherit;
	}
	button {
		cursor: pointer;
		border: 0;
		background: var(--detail-card);
		min-height: 48px;
		border-radius: 12px;
	}
	.quick-dates button {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 4px 12px;
		text-align: left;
		padding: 12px;
	}
	.quick-dates span {
		color: var(--detail-muted);
		font-size: 0.85em;
	}
	.date-input {
		display: grid;
		gap: 8px;
		margin: 20px 0;
	}
	input {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
		padding: 12px;
		min-height: 48px;
		background: var(--detail-card);
		border: 1px solid var(--detail-border);
		border-radius: 10px;
	}
	.calendar {
		background: var(--detail-card);
		border-radius: 14px;
		padding: 4px 0 12px;
	}
	.month-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px;
	}
	.month-heading button {
		min-width: 48px;
		font-size: 1.5em;
	}
	.days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		text-align: center;
	}
	.days span {
		padding: 8px 0;
		color: var(--detail-muted);
	}
	.days button {
		min-width: 44px;
		min-height: 44px;
		border-radius: 50%;
		padding: 0;
	}
	.days .selected {
		background: var(--detail-accent);
		color: #fff;
	}
	p {
		color: var(--detail-error);
	}
	button:focus-visible,
	input:focus-visible {
		outline: 3px solid var(--detail-accent);
		outline-offset: 1px;
	}
</style>
