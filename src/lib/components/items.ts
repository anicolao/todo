import { createAction, createReducer } from '@reduxjs/toolkit';
import { signed_in, signed_out } from './auth';

export interface TodoItem {
	completed: boolean;
	completedTimestamp: number;
	starred: boolean;
	starTimestamp: number;
	description: string;
	dueDate?: DueDate;
}

export interface DueDate {
	year: number; // 4-digit year, eg: 2022.
	month: number; // Month [1..12].
	day: number; // Day of month [1..31].
	repeats?: RepeatInfo;
}

export interface RepeatInfo {
	type: RepeatType;
	every: number;
}

export enum RepeatType {
	NONE = 'none',
	DAILY = 'daily', // every N day(s)
	WEEKLY = 'weekly', // on dayOfWeek (from 'due') AND every N weeks
	MONTHLY = 'monthly', // on day N (from 'due')    AND every N months
	YEARLY = 'yearly', // on Month Day (Jan 1 .. Jan 31, Dec 1 .. Dec 31)
	WEEKDAYS = 'weekdays'
}

export interface ListOfItems {
	itemIds: string[];
	itemIdToItem: { [id: string]: TodoItem };
}

const emptyList: ListOfItems = {
	itemIds: [],
	itemIdToItem: {}
};
export interface ItemsState {
	listIdToListOfItems: { [id: string]: ListOfItems };
}

export const create_item = createAction<{ list_id: string; id: string; description: string }>(
	'create_item'
);
export const describe_item = createAction<{
	list_id: string;
	id: string;
	orig_description: string;
	description: string;
}>('describe_item');
export const complete_item = createAction<{
	list_id: string;
	id: string;
	completed: boolean;
	completed_time: number;
}>('complete_item');
export const star_item = createAction<{
	list_id: string;
	id: string;
	starred: boolean;
	star_timestamp: number;
}>('star_item');
export const reorder_item = createAction<{ list_id: string; id: string; goes_before?: string }>(
	'reorder_item'
);
export const set_due_date = createAction<{
	list_id: string;
	id: string;
	due_date: DueDate;
}>('set_due_date');
export const remove_due_date = createAction<{ list_id: string; id: string }>('remove_due_date');

function strikethrough(s: string) {
	const strike = '̶';
	return s.split('').join(strike) + strike;
}

function matchCharacters(
	s1: string,
	s2: string,
	start1: number,
	start2: number,
	offset: number
): number {
	let ret = 0;
	while (
		start1 + offset * ret < s1.length &&
		start1 + offset * ret >= 0 &&
		start2 + offset * ret < s2.length &&
		start2 + offset * ret >= 0
	) {
		if (s1[start1 + offset * ret] === s2[start2 + offset * ret]) ret++;
		else break;
	}
	return ret;
}

function merge({ orig, first, second }: { orig: string; first: string; second: string }): string {
	if (orig === first) {
		return second;
	}
	if (first === second) {
		return second;
	}
	let prefixF = matchCharacters(orig, first, 0, 0, 1);
	let prefixS = matchCharacters(orig, second, 0, 0, 1);
	let suffixF = matchCharacters(orig, first, orig.length - 1, first.length - 1, -1);
	let suffixS = matchCharacters(orig, second, orig.length - 1, second.length - 1, -1);
	suffixF = first.length - suffixF;
	suffixS = second.length - suffixS;

	if (suffixF < prefixS) {
		//non overlapping and F is before S
		console.log('calling ourselves with', orig, '1:', first, '2:', second);
		return merge({ first: second, second: first, orig });
	} else if (suffixS < prefixF) {
		//non overlapping and S is before F
		let fChars: (string | string[])[] = first.split('');
		let sChars = second.split('');
		const inserted = sChars.slice(prefixS, suffixS);
		// subtract off the parts that are not deleted to figure out
		// how much was deleted (the length of the suffix and prefix)
		const delSize = orig.length - (second.length - suffixS) - prefixS;
		fChars.splice(prefixS, delSize, inserted);
		return fChars.flat().join('');
	}
	return strikethrough(first) + ' ' + second;
}

export const initialState = {
	listIdToListOfItems: {}
} as ItemsState;

export const items = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(create_item, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		list.itemIdToItem = { ...list.itemIdToItem };
		if (list.itemIds.indexOf(action.payload.id) === -1) {
			list.itemIds = [action.payload.id, ...list.itemIds];
		}
		list.itemIdToItem[action.payload.id] = {
			completed: false,
			completedTimestamp: 0,
			starred: false,
			starTimestamp: 0,
			description: action.payload.description
		};
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
	});
	r.addCase(describe_item, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		let item = list.itemIdToItem[action.payload.id];
		const orig = action.payload.orig_description;
		const first = item.description;
		const second = action.payload.description;
		item.description = merge({ orig, first, second });
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
	});
	r.addCase(complete_item, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		let item = list.itemIdToItem[action.payload.id];
		item.completed = action.payload.completed;
		item.completedTimestamp = Math.max(
			item.completedTimestamp,
			action.payload?.completed_time || 0
		);

		if (item.dueDate && item.dueDate.repeats && item.dueDate.repeats.type !== RepeatType.NONE) {
			let y = item.dueDate.year;
			let m = item.dueDate.month;
			let d = item.dueDate.day;

			item.completed = false;
			let today = new Date(action.payload.completed_time);
			let nextDate = new Date(y, m - 1, d);
			if (nextDate > today) {
				today = new Date(nextDate);
			}
			while (nextDate <= today) {
				switch (item.dueDate.repeats.type) {
					case RepeatType.DAILY:
						nextDate.setDate(nextDate.getDate() + item.dueDate.repeats.every);
						break;
					case RepeatType.WEEKLY:
						nextDate.setDate(nextDate.getDate() + 7 * item.dueDate.repeats.every);
						break;
					case RepeatType.MONTHLY:
						nextDate = new Date(
							nextDate.getFullYear(),
							nextDate.getMonth() + item.dueDate.repeats.every,
							nextDate.getDate()
						);
						break;
					case RepeatType.YEARLY:
						nextDate = new Date(
							nextDate.getFullYear() + item.dueDate.repeats.every,
							nextDate.getMonth(),
							nextDate.getDate()
						);
						break;
					case RepeatType.WEEKDAYS:
						nextDate.setDate(nextDate.getDate() + 1);
						while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
							nextDate.setDate(nextDate.getDate() + 1);
						}
						break;
					default: // Error.
						break;
				}
			}
			y = nextDate.getFullYear();
			m = nextDate.getMonth() + 1;
			d = nextDate.getDate();

			const due_date = {
				year: y,
				month: m,
				day: d,
				repeats: { ...item.dueDate.repeats }
			};
			state = setDueDate(state, set_due_date({ ...action.payload, due_date }));
		}
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
	});
	r.addCase(star_item, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		let item = list.itemIdToItem[action.payload.id];
		item.starred = action.payload.starred;
		item.starTimestamp = Math.max(item.starTimestamp, action.payload?.star_timestamp || 0);
		if (action.payload.starred) {
			list.itemIds = [action.payload.id, ...list.itemIds.filter((x) => x !== action.payload.id)];
		}
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
	});

	r.addCase(reorder_item, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		const index = list.itemIds.indexOf(action.payload.id);
		if (index !== -1) {
			const removedItem = list.itemIds.splice(index, 1);
			const newIndex = action.payload.goes_before
				? list.itemIds.indexOf(action.payload.goes_before)
				: list.itemIds.length;
			if (newIndex === -1) {
				throw `ERROR: itemid ${action.payload.goes_before} not found in items array`;
			}
			list.itemIds = [
				list.itemIds.slice(0, newIndex),
				removedItem[0],
				list.itemIds.slice(newIndex)
			].flat();
		} else {
			throw `ERROR: itemid ${action.payload.id} not found in items array`;
		}
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
	});

	function setDueDate(
		state: ItemsState,
		action: { payload: { list_id: string; id: string; due_date: DueDate }; type?: string }
	) {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		let item = list.itemIdToItem[action.payload.id];
		item.dueDate = { ...action.payload.due_date };
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
		return state;
	}

	r.addCase(set_due_date, setDueDate);

	r.addCase(remove_due_date, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		let item = list.itemIdToItem[action.payload.id];
		delete item.dueDate;
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
	});
});
