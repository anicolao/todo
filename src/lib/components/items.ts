import { createReducer } from '$lib/redux';
import { createAction, type AnyAction } from '@reduxjs/toolkit';
import { signed_in, signed_out } from './auth';

export interface TodoItem {
	completed: boolean;
	completedTimestamp: number;
	starred: boolean;
	starTimestamp: number;
	description: string;
	dueDate?: DueDate;
	prevDueDate: (DueDate | null)[];
	prevCompletedTimestamp: number[];
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

// const diff = { 'abacdeadasdf': { itemIdToItem: { 'item_id': { completed: true }}}}
// const diff = {};
// diff[list_id] = {};
// diff[list_id].itemIdToItem = {};
// diff[list_id].itemIdToItem[item_id] = {completed: true};
// state = patch(state, diff);

// export declare function createAction<P = void, T extends string = string>(type: T): PayloadActionCreator<P, T>;
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
export const uncomplete_item = createAction<{
	list_id: string;
	id: string;
}>('uncomplete_item');
export const complete_forever = createAction<{
	list_id: string;
	id: string;
}>('complete_forever');
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

export function strikethrough(s: string) {
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
	let secondStringOffset = second.length - suffixS;
	suffixF = Math.max(orig.length - suffixF, prefixF);
	suffixS = Math.max(orig.length - suffixS, prefixS);

	if (suffixF < prefixS) {
		//non overlapping and F is before S
		return merge({ first: second, second: first, orig });
	} else if (suffixS < prefixF) {
		//non overlapping and S is before F
		let fChars: (string | string[])[] = first.split('');
		let sChars = second.split('');
		const inserted = sChars.slice(prefixS, secondStringOffset);
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
		state = { ...state };
		let list: ListOfItems = {
			itemIds: [],
			itemIdToItem: {}
		};

		if (state.listIdToListOfItems[action.payload.list_id] !== undefined) {
			const orig = state.listIdToListOfItems[action.payload.list_id];
			list = { ...orig } as ListOfItems;
			list.itemIdToItem = { ...list.itemIdToItem };
		}

		if (list.itemIdToItem[action.payload.id] === undefined) {
			list.itemIds = [action.payload.id, ...list.itemIds];
		}
		list.itemIdToItem[action.payload.id] = {
			completed: false,
			completedTimestamp: 0,
			starred: false,
			starTimestamp: 0,
			description: action.payload.description,
			prevDueDate: [],
			prevCompletedTimestamp: []
		};
		state.listIdToListOfItems = { ...state.listIdToListOfItems };
		state.listIdToListOfItems[action.payload.list_id] = list;
		return state;
	});
	r.addCase(describe_item, (state, action) => {
		state = { ...state };
		const list = { ...state.listIdToListOfItems[action.payload.list_id] };
		let item = { ...list.itemIdToItem[action.payload.id] };

		const orig = action.payload.orig_description;
		const first = item.description;
		const second = action.payload.description;
		item.description = merge({ orig, first, second });
		list.itemIdToItem = { ...list.itemIdToItem };
		list.itemIdToItem[action.payload.id] = item;

		state.listIdToListOfItems = { ...state.listIdToListOfItems };
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
		return state;
	});
	r.addCase(complete_item, (state, action) => {
		state = { ...state };
		const list = { ...state.listIdToListOfItems[action.payload.list_id] };
		let item = { ...list.itemIdToItem[action.payload.id] };
		if (item.completedTimestamp >= action.payload.completed_time) {
			return state;
		}
		item.completed = action.payload.completed;
		if (item.prevCompletedTimestamp) {
			item.prevCompletedTimestamp = [...item.prevCompletedTimestamp, item.completedTimestamp];
		} else {
			item.prevCompletedTimestamp = [item.completedTimestamp];
		}
		item.completedTimestamp = Math.max(
			item.completedTimestamp,
			action.payload?.completed_time || 0
		);

		if (item.dueDate) {
			item.dueDate = { ...item.dueDate };
			let y = item.dueDate.year;
			let m = item.dueDate.month;
			let d = item.dueDate.day;

			const prev_due: DueDate = {
				year: y,
				month: m,
				day: d
			};
			if (item.dueDate.repeats) {
				prev_due.repeats = { ...item.dueDate.repeats };
			}
			item.prevDueDate = [...item.prevDueDate, prev_due];

			if (item.dueDate.repeats && item.dueDate.repeats.type !== RepeatType.NONE && item.completed) {
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
				item.dueDate = due_date;
			}
		} else {
			if (item.prevDueDate) {
				item.prevDueDate = [...item.prevDueDate, null];
			} else {
				item.prevDueDate = [null];
			}
		}
		list.itemIdToItem = { ...list.itemIdToItem };
		list.itemIdToItem[action.payload.id] = item;
		state.listIdToListOfItems = { ...state.listIdToListOfItems };
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
		return state;
	});
	r.addCase(complete_forever, (state, action) => {
		state = { ...state };
		const list = { ...state.listIdToListOfItems[action.payload.list_id] };
		let item = { ...list.itemIdToItem[action.payload.id] };
		item.completed = true;

		list.itemIdToItem = { ...list.itemIdToItem };
		list.itemIdToItem[action.payload.id] = item;
		state.listIdToListOfItems = { ...state.listIdToListOfItems };
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
		return state;
	});
	r.addCase(uncomplete_item, (state, action) => {
		state = { ...state };
		const list = { ...state.listIdToListOfItems[action.payload.list_id] };
		let item = { ...list.itemIdToItem[action.payload.id] };

		item.completed = false;

		item.prevCompletedTimestamp = [...item.prevCompletedTimestamp];
		const oldCompletion = item.prevCompletedTimestamp.splice(-1, 1)[0];
		item.completedTimestamp = oldCompletion;

		item.prevDueDate = [...item.prevDueDate];
		const oldDueDate = item.prevDueDate.splice(-1, 1)[0];
		if (oldDueDate !== null) {
			item.dueDate = oldDueDate;
		} else {
			item.dueDate = undefined;
		}

		list.itemIdToItem = { ...list.itemIdToItem };
		list.itemIdToItem[action.payload.id] = item;
		state.listIdToListOfItems = { ...state.listIdToListOfItems };
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
		return state;
	});
	r.addCase(star_item, (state, action) => {
		state = { ...state };
		const list = { ...state.listIdToListOfItems[action.payload.list_id] };
		let item = { ...list.itemIdToItem[action.payload.id] };
		item.starred = action.payload.starred;
		item.starTimestamp = Math.max(item.starTimestamp, action.payload?.star_timestamp || 0);
		if (action.payload.starred) {
			list.itemIds = [
				action.payload.id,
				...list.itemIds.filter((x: string) => x !== action.payload.id)
			];
		}
		list.itemIdToItem = { ...list.itemIdToItem };
		list.itemIdToItem[action.payload.id] = item;
		state.listIdToListOfItems = { ...state.listIdToListOfItems };
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
		return state;
	});

	r.addCase(reorder_item, (state, action) => {
		state = { ...state };
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		const index = list.itemIds.indexOf(action.payload.id);
		if (index !== -1) {
			list.itemIds = [...list.itemIds];
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
		state.listIdToListOfItems = { ...state.listIdToListOfItems };
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
		return state;
	});

	function setDueDate(state: ItemsState, action: AnyAction) {
		state = { ...state };
		const list = { ...state.listIdToListOfItems[action.payload.list_id] };
		if (!list || !list.itemIdToItem) {
			return state;
		}
		let item = { ...list.itemIdToItem[action.payload.id] };
		item.dueDate = { ...action.payload.due_date };
		list.itemIdToItem = { ...list.itemIdToItem };
		list.itemIdToItem[action.payload.id] = item;
		state.listIdToListOfItems = { ...state.listIdToListOfItems };
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
		return state;
	}

	r.addCase(set_due_date, setDueDate);

	r.addCase(remove_due_date, (state, action) => {
		state = { ...state };
		const list = { ...state.listIdToListOfItems[action.payload.list_id] };
		let item = { ...list.itemIdToItem[action.payload.id] };
		delete item.dueDate;
		list.itemIdToItem = { ...list.itemIdToItem };
		list.itemIdToItem[action.payload.id] = item;
		state.listIdToListOfItems = { ...state.listIdToListOfItems };
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
		return state;
	});
	r.addDefault((state, action) => {
		if (action.type === 'CACHE_LOADED@INIT') {
			return action.payload.items;
		}
		return state;
	});
});
