<script lang="ts">
	import IconButton from '@smui/icon-button';
	import MenuSurface from '@smui/menu-surface';
	import Textfield from '@smui/textfield';

	// Canonical value, kept as `YYYY-MM-DD` to match the previous native
	// `<input type="date">` so callers need no changes.
	export let value = '';
	export let disabled = false;
	export let label = 'Task due date';

	const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];

	let surface: MenuSurface;
	let anchorEl: HTMLElement;

	const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
	const toValue = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

	function parse(v: string) {
		const parts = v.split('-');
		if (parts.length !== 3) return null;
		const y = Number(parts[0]);
		const m = Number(parts[1]) - 1;
		const d = Number(parts[2]);
		if (!y || Number.isNaN(m) || !d) return null;
		return { y, m, d };
	}

	function todayParts() {
		const now = new Date();
		return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
	}

	$: selected = parse(value);
	$: displayValue = selected
		? new Date(selected.y, selected.m, selected.d).toLocaleDateString('en-US', {
				weekday: 'short',
				year: 'numeric',
				month: 'short',
				day: 'numeric'
			})
		: '';

	// The month currently shown in the calendar.
	let viewY = new Date().getFullYear();
	let viewM = new Date().getMonth();

	$: firstDow = new Date(viewY, viewM, 1).getDay();
	$: days = buildDays(viewY, viewM);
	function buildDays(y: number, m: number) {
		const daysInMonth = new Date(y, m + 1, 0).getDate();
		return Array.from({ length: daysInMonth }, (_, i) => i + 1);
	}

	function openCalendar() {
		if (disabled) return;
		const base = selected ?? todayParts();
		viewY = base.y;
		viewM = base.m;
		surface.setOpen(true);
	}

	function prevMonth() {
		if (viewM === 0) {
			viewM = 11;
			viewY -= 1;
		} else {
			viewM -= 1;
		}
	}

	function nextMonth() {
		if (viewM === 11) {
			viewM = 0;
			viewY += 1;
		} else {
			viewM += 1;
		}
	}

	function selectDay(d: number) {
		value = toValue(viewY, viewM, d);
		surface.setOpen(false);
	}

	const today = todayParts();
	// Derived reactively (not via a called function) so the highlighted day and
	// today marker repaint immediately when `value` or the viewed month changes.
	$: selectedDay = selected && selected.y === viewY && selected.m === viewM ? selected.d : null;
	$: todayDay = today.y === viewY && today.m === viewM ? today.d : null;
</script>

<div class="mdc-menu-surface--anchor date-anchor" bind:this={anchorEl}>
	<Textfield
		style="width: 100%;"
		value={displayValue}
		{label}
		{disabled}
		input$readonly
		input$style="cursor: pointer;"
		on:click={openCalendar}
	>
		<IconButton
			slot="trailingIcon"
			class="material-icons"
			{disabled}
			tabindex={0}
			on:click={openCalendar}>calendar_today</IconButton
		>
	</Textfield>

	<MenuSurface bind:this={surface} fixed anchorElement={anchorEl} anchorCorner="BOTTOM_LEFT">
		<div class="calendar">
			<div class="calendar-header">
				<IconButton class="material-icons" on:click={prevMonth}>chevron_left</IconButton>
				<span class="calendar-title">{MONTHS[viewM]} {viewY}</span>
				<IconButton class="material-icons" on:click={nextMonth}>chevron_right</IconButton>
			</div>
			<div class="calendar-grid calendar-weekdays">
				{#each WEEKDAYS as weekday}
					<span class="calendar-weekday" aria-hidden="true">{weekday}</span>
				{/each}
			</div>
			<div class="calendar-grid calendar-days">
				{#each days as day, i}
					<button
						type="button"
						class="calendar-day"
						style={i === 0 ? `grid-column-start: ${firstDow + 1}` : ''}
						class:selected={day === selectedDay}
						class:today={day === todayDay}
						on:click={() => selectDay(day)}>{day}</button
					>
				{/each}
			</div>
		</div>
	</MenuSurface>
</div>

<style>
	.date-anchor {
		width: 100%;
	}

	.calendar {
		padding: 0.5rem 0.75rem 0.75rem;
		box-sizing: border-box;
	}

	.calendar-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.25rem;
	}

	.calendar-title {
		font-weight: 500;
		font-size: 0.95rem;
		color: rgba(0, 0, 0, 0.87);
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, 2.25rem);
		justify-content: center;
		gap: 2px;
	}

	/* Always reserve six week rows so the calendar (and the dialog) keeps a
	   constant height across months, keeping the prev/next buttons fixed. */
	.calendar-days {
		grid-template-rows: repeat(6, 2.25rem);
	}

	.calendar-weekday {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 2rem;
		font-size: 0.75rem;
		color: rgba(0, 0, 0, 0.55);
	}

	.calendar-day {
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: 50%;
		background: transparent;
		font: inherit;
		color: rgba(0, 0, 0, 0.87);
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			color 0.15s ease;
	}

	.calendar-day:hover {
		background: rgba(0, 0, 0, 0.08);
	}

	.calendar-day.today {
		border-color: var(--mdc-theme-primary, #6200ee);
	}

	.calendar-day.selected {
		background: var(--mdc-theme-primary, #6200ee);
		color: var(--mdc-theme-on-primary, #fff);
		border-color: transparent;
	}
</style>
