import { createAction, createReducer } from '@reduxjs/toolkit';

export interface TodoItem {
	completed: boolean;
	starred: boolean;
	description: string;
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
export const describe_item = createAction<{ list_id: string; id: string; description: string }>(
	'describe_item'
);
export const complete_item = createAction<{ list_id: string; id: string; completed: boolean }>(
	'complete_item'
);
export const star_item = createAction<{ list_id: string; id: string; starred: boolean }>(
	'star_item'
);
export const reorder_item = createAction<{ list_id: string; id: string; goes_before?: string }>(
	'reorder_item'
);

export const initialState = {
	listIdToListOfItems: {}
} as ItemsState;

export const items = createReducer(initialState, (r) => {
	r.addCase(create_item, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		list.itemIdToItem = { ...list.itemIdToItem };
		list.itemIds = [action.payload.id, ...list.itemIds];
		list.itemIdToItem[action.payload.id] = {
			completed: false,
			starred: false,
			description: action.payload.description
		};
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
	});
	r.addCase(describe_item, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		let item = list.itemIdToItem[action.payload.id];
		item.description = action.payload.description;
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
	});
	r.addCase(complete_item, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		let item = list.itemIdToItem[action.payload.id];
		item.completed = action.payload.completed;
		state.listIdToListOfItems[action.payload.list_id] = { ...list };
	});
	r.addCase(star_item, (state, action) => {
		const list = { ...emptyList, ...state.listIdToListOfItems[action.payload.list_id] };
		let item = list.itemIdToItem[action.payload.id];
		item.starred = action.payload.starred;
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
});
