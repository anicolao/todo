import type { DueDate, RepeatInfo } from './items';

export function localDate(value: Pick<DueDate, 'year' | 'month' | 'day'>): Date {
	const date = new Date(value.year, value.month - 1, value.day);
	date.setFullYear(value.year);
	return date;
}

export function dateParts(date: Date): DueDate {
	return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export function dateValue(date: DueDate): string {
	return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(
		date.day
	).padStart(2, '0')}`;
}

export function parseDate(value: string): DueDate | undefined {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
	const [year, month, day] = value.split('-').map(Number);
	const result = { year, month, day };
	if (year < 1 || year > 9999 || dateValue(dateParts(localDate(result))) !== value) return;
	return result;
}

export function validInterval(value: string | number): boolean {
	return /^\d+$/.test(String(value)) && Number(value) >= 1 && Number(value) <= 365;
}

// Deliberately preserve the existing overflow behavior for month-end/leap dates.
export function advanceDate(due: DueDate): DueDate {
	const repeat = due.repeats;
	if (!repeat || repeat.type === 'none') return { ...due };
	if (!validInterval(repeat.every)) throw new Error('Invalid repeat interval');
	const date = localDate(due);
	switch (repeat.type) {
		case 'daily':
			date.setDate(date.getDate() + repeat.every);
			break;
		case 'weekly':
			date.setDate(date.getDate() + 7 * repeat.every);
			break;
		case 'monthly':
			date.setMonth(date.getMonth() + repeat.every);
			break;
		case 'yearly':
			date.setFullYear(date.getFullYear() + repeat.every);
			break;
		case 'weekdays':
			date.setDate(date.getDate() + 1);
			while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
			break;
		default:
			throw new Error('Unknown repeat type');
	}
	return { ...dateParts(date), repeats: { ...repeat } };
}

export function nextDueDate(due: DueDate, completedTime: number): DueDate {
	if (!due.repeats || due.repeats.type === 'none') return { ...due };
	const boundary = Math.max(completedTime, localDate(due).getTime());
	let next = due;
	do {
		next = advanceDate(next);
	} while (localDate(next).getTime() <= boundary);
	return next;
}

export function upcomingDates(due: DueDate, count = 3): DueDate[] {
	const dates = [due];
	if (!due.repeats || due.repeats.type === 'none') return dates;
	for (let i = 1; i < count; i++) dates.push(advanceDate(dates[i - 1]));
	return dates;
}

export function formatDate(due: DueDate): string {
	return localDate(due).toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

export function repeatSummary(due?: DueDate): string {
	const rule = due?.repeats;
	if (!due || !rule || rule.type === 'none') return 'Does not repeat';
	if (rule.type === 'weekdays') return 'Every weekday (Mon–Fri)';
	const units: Partial<Record<RepeatInfo['type'], string>> = {
		daily: 'day',
		weekly: 'week',
		monthly: 'month',
		yearly: 'year'
	};
	let text = `Every ${rule.every === 1 ? '' : `${rule.every} `}${units[rule.type]}${
		rule.every === 1 ? '' : 's'
	}`;
	if (rule.type === 'weekly')
		text += ` on ${localDate(due).toLocaleDateString(undefined, { weekday: 'long' })}`;
	if (rule.type === 'monthly') text += ` on day ${due.day}`;
	if (rule.type === 'yearly')
		text += ` on ${localDate(due).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric'
		})}`;
	return text;
}
