import { createReducer } from '$lib/redux';
import { createAction } from '@reduxjs/toolkit';
import { signed_in, signed_out } from './auth';

export interface ListsState {
	visibleLists: string[];
	listIdToList: { [key: string]: string };
	listIdToTimestamp: { [key: string]: number };
}

export const create_list = createAction<{ id: string; name: string }>('create_list');
export const rename_list = createAction<{ id: string; name: string }>('rename_list');
export const delete_list = createAction<string>('delete_list');
export const accept_pending_share = createAction<string>('accept_pending_share');
export const revoke_share = createAction<{ id: string }>('revoke_share');
export const reorder_list = createAction<{ id: string; goes_before?: string }>('reorder_list');

export const initialState = {
	visibleLists: [],
	listIdToList: {},
	listIdToTimestamp: {}
} as ListsState;

export const lists = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(create_list, (state, action) => {
		state = { ...state };
		if (state.visibleLists.indexOf(action.payload.id) === -1) {
			state.visibleLists = [...state.visibleLists, action.payload.id];
		}
		state.listIdToList = { ...state.listIdToList };
		state.listIdToList[action.payload.id] = action.payload.name;
		return state;
	});
	r.addCase(rename_list, (state, action) => {
		state = { ...state };
		state.listIdToList = { ...state.listIdToList };
		state.listIdToList[action.payload.id] = action.payload.name;
		return state;
	});
	r.addCase(delete_list, (state, action) => {
		state = { ...state };
		state.visibleLists = state.visibleLists.filter((x) => x !== action.payload);
		state.listIdToList = { ...state.listIdToList };
		delete state.listIdToList[action.payload];
		return state;
	});
	r.addCase(revoke_share, (state, action) => {
		state = { ...state };
		state.visibleLists = state.visibleLists.filter((x) => x !== action.payload.id);
		state.listIdToList = { ...state.listIdToList };
		delete state.listIdToList[action.payload.id];
		return state;
	});
	r.addCase(accept_pending_share, (state, action) => {
		state = { ...state };
		state.visibleLists = [action.payload, ...state.visibleLists];
		return state;
	});
	r.addCase(reorder_list, (state, action) => {
		state = { ...state };
		const lists = [...state.visibleLists];
		const index = lists.indexOf(action.payload.id);
		if (index !== -1) {
			const removedItem = lists.splice(index, 1);
			const newIndex = action.payload.goes_before
				? lists.indexOf(action.payload.goes_before)
				: lists.length;
			if (newIndex === -1) {
				throw `ERROR: goes_before ${action.payload.goes_before} not found in visible lists`;
			}
			state.visibleLists = [lists.slice(0, newIndex), removedItem[0], lists.slice(newIndex)].flat();
		} else {
			throw `ERROR: list_id ${action.payload.id} not found in visible lists`;
		}
		return state;
	});
	r.addDefault((state, action) => {
		if (action.timestamp) {
			// action came from server
			const candidateId = action.payload.list_id || action.payload.id || action.payload;
			if (state.visibleLists.indexOf(candidateId) !== -1) {
				if (action.isANormalAction) {
					console.log(`Update timestamp for list ${candidateId}`);
					state = { ...state };
					state.listIdToTimestamp = { ...state.listIdToTimestamp };
					state.listIdToTimestamp[candidateId] = action.timestamp;
				}
			}
		}
		return state;
	});
	r.addDefault((state, action) => {
		if (action.type === 'CACHE_LOADED@INIT') {
			return action.payload.lists;
		}
		return state;
	});
});
