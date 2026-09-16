import { describe, it, expect } from 'vitest';
import {
	advanceDate,
	nextDueDate,
	upcomingDates,
	parseDate,
	validInterval,
	repeatSummary
} from '../src/lib/components/recurrence';
import { RepeatType, type DueDate } from '../src/lib/components/items';
const due = (type: RepeatType, every = 1, year = 2026, month = 9, day = 18): DueDate => ({
	year,
	month,
	day,
	repeats: { type, every }
});
describe('shared recurrence and schedule preview', () => {
	it('previews the same weekly dates used on completion, including early and late completion', () => {
		const schedule = due(RepeatType.WEEKLY, 2);
		expect(upcomingDates(schedule).map((d) => [d.month, d.day])).toEqual([
			[9, 18],
			[10, 2],
			[10, 16]
		]);
		expect(nextDueDate(schedule, new Date(2026, 8, 17).getTime())).toEqual(advanceDate(schedule));
		expect(nextDueDate(schedule, new Date(2026, 9, 3).getTime())).toEqual(
			upcomingDates(schedule)[2]
		);
		expect(repeatSummary(schedule)).toBe('Every 2 weeks on Friday');
	});
	it('preserves month-end overflow and leap-year behavior', () => {
		expect(advanceDate(due(RepeatType.MONTHLY, 1, 2026, 1, 31))).toMatchObject({
			month: 3,
			day: 3
		});
		expect(advanceDate(due(RepeatType.YEARLY, 1, 2024, 2, 29))).toMatchObject({
			year: 2025,
			month: 3,
			day: 1
		});
	});
	it('skips weekends and advances daily and yearly schedules', () => {
		expect(advanceDate(due(RepeatType.WEEKDAYS))).toMatchObject({ month: 9, day: 21 });
		expect(advanceDate(due(RepeatType.WEEKDAYS, 1, 2026, 9, 19))).toMatchObject({ day: 21 });
		expect(advanceDate(due(RepeatType.DAILY, 3, 2026, 12, 30))).toMatchObject({
			year: 2027,
			month: 1,
			day: 2
		});
		expect(advanceDate(due(RepeatType.YEARLY, 2))).toMatchObject({ year: 2028, month: 9, day: 18 });
		expect(upcomingDates(due(RepeatType.NONE))).toHaveLength(1);
	});
	it('keeps calendar days across a daylight-saving boundary', () => {
		expect(advanceDate(due(RepeatType.DAILY, 1, 2026, 3, 8))).toMatchObject({
			year: 2026,
			month: 3,
			day: 9
		});
	});
	it('rejects invalid dates and intervals without normalizing them', () => {
		for (const value of ['', '0', '-1', '1.5', '366', 'hello'])
			expect(validInterval(value)).toBe(false);
		for (const value of ['1', '365']) expect(validInterval(value)).toBe(true);
		expect(parseDate('2026-02-29')).toBeUndefined();
		expect(parseDate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
		expect(parseDate('2026-13-01')).toBeUndefined();
	});
});
