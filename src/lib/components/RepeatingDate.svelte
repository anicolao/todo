<script lang="ts">
	import { RepeatType, type DueDate } from './items';

	export let dueDate: DueDate | undefined;

	let dueDateStr = '';
	let overdue = false;
	let repeatType = RepeatType.NONE;
	let repeatEvery = 0;
	let repeatChar = '\u21b6';
	// repeatChar = '\u27f2';
	// repeatChar = '\u21ba';

	$: if (dueDate) {
		const date = new Date(dueDate.year, dueDate.month - 1, dueDate.day);
		if (dueDate.repeats?.type) {
			repeatType = dueDate.repeats.type;
			repeatEvery = dueDate.repeats.every;
		}
		if (isToday(date)) {
			dueDateStr = 'Today';
		} else if (isTomorrow(date)) {
			dueDateStr = 'Tomorrow';
		} else if (isYesterday(date)) {
			dueDateStr = 'Yesterday';
		} else {
			let yearFormat: '2-digit' | undefined = '2-digit';
			const now = new Date();
			if(date.getFullYear() === now.getFullYear() && repeatType !== RepeatType.YEARLY) {
				yearFormat = undefined;
			}
			dueDateStr = date.toLocaleDateString('en-us', {
				weekday: 'short',
				year: yearFormat,
				month: 'short',
				day: 'numeric'
			});
			// dueDateStr is like: 'Mon, Jan 2, 2023'
			if(yearFormat) {
				dueDateStr = dueDateStr.replace(/ ([0-9]+)$/, ' \'$1');
			}
			switch (repeatType) {
				case RepeatType.DAILY:
					dueDateStr = dueDateStr.replace(/([0-9]+), ([0-9]+)/, '$1' + repeatChar + ', $2');
					break;
				case RepeatType.WEEKDAYS:
					dueDateStr = dueDateStr.replace(',', repeatChar + ',');
					break;
				case RepeatType.WEEKLY:
					dueDateStr = dueDateStr.replace(',', ',' + repeatChar);
					break;
				case RepeatType.MONTHLY:
					dueDateStr = dueDateStr.replace(/ ([1-9])/, repeatChar + ' $1');
					break;
				case RepeatType.YEARLY:
					dueDateStr = dueDateStr.replace(/ ('[0-9]+)$/, ' $1' + repeatChar);
					break;
				default:
					break;
			}
		}
		if (repeatType !== RepeatType.NONE && !dueDateStr.includes(',')) {
			// dueDateStr is one of the specials like "Today".
			dueDateStr += repeatChar + repeatEvery;
			switch (repeatType) {
				case RepeatType.DAILY:
					dueDateStr += 'd';
					break;
				case RepeatType.WEEKDAYS:
					dueDateStr += 'wd';
					break;
				case RepeatType.WEEKLY:
					dueDateStr += 'w';
					break;
				case RepeatType.MONTHLY:
					dueDateStr += 'm';
					break;
				case RepeatType.YEARLY:
					dueDateStr += 'y';
					break;
				default:
					break;
			}
		}
		dueDateStr = dueDateStr.replaceAll(' ', '\u00a0');
		overdue = isOverdue(date);
	} else {
		dueDateStr = '';
	}

	function isOverdue(date: Date) {
		const now = new Date();
		return date.getTime() < now.getTime() && !isToday(date);
	}

	function isSameDay(d1: Date, d2: Date) {
		return (
			d1.getFullYear() === d2.getFullYear() &&
			d1.getMonth() === d2.getMonth() &&
			d1.getDate() === d2.getDate()
		);
	}

	function isToday(d: Date) {
		return isSameDay(d, new Date());
	}

	function isTomorrow(d: Date) {
		const other = new Date();
		other.setDate(other.getDate() + 1);
		return isSameDay(d, other);
	}

	function isYesterday(d: Date) {
		const other = new Date();
		other.setDate(other.getDate() - 1);
		return isSameDay(d, other);
	}
</script>

<span class:overdue>{dueDateStr}</span>

<style>
	.overdue {
		color: rgb(255, 96, 96);
	}
</style>
