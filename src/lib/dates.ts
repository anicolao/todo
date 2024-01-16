export function isOverdue(date: Date) {
	const now = new Date();
	return date.getTime() < now.getTime() && !isToday(date);
}

export function isDueToday(date: Date) {
	const now = new Date();
	return date.getTime() < now.getTime();
}

export function isSameDay(d1: Date, d2: Date) {
	return (
		d1.getFullYear() === d2.getFullYear() &&
		d1.getMonth() === d2.getMonth() &&
		d1.getDate() === d2.getDate()
	);
}

export function isToday(d: Date) {
	return isSameDay(d, new Date());
}

export function isTomorrow(d: Date) {
	const other = new Date();
	other.setDate(other.getDate() + 1);
	return isSameDay(d, other);
}

export function isYesterday(d: Date) {
	const other = new Date();
	other.setDate(other.getDate() - 1);
	return isSameDay(d, other);
}
