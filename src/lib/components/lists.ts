import { createAction, createReducer } from '@reduxjs/toolkit';
import { signed_in, signed_out } from './auth';
import { freeze, original } from 'immer';

export interface ListsState {
	visibleLists: string[];
	listIdToList: { [key: string]: string };
}

export const create_list = createAction<{ id: string; name: string }>('create_list');
export const rename_list = createAction<{ id: string; name: string }>('rename_list');
export const delete_list = createAction<string>('delete_list');
export const accept_pending_share = createAction<string>('accept_pending_share');
export const revoke_share = createAction<{ id: string }>('revoke_share');
export const reorder_list = createAction<{ id: string; goes_before?: string }>('reorder_list');

export const initialState = {
	visibleLists: [],
	listIdToList: {}
} as ListsState;

export const lists = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(create_list, (state, action) => {
		if (state.visibleLists.indexOf(action.payload.id) === -1) {
			state.visibleLists = [...state.visibleLists, action.payload.id];
		}
		state.listIdToList[action.payload.id] = action.payload.name;
		return state;
	});
	r.addCase(rename_list, (immerState, action) => {
		const state: any = { ...original(immerState) };
		state.listIdToList = { ...state.listIdToList };
		state.listIdToList[action.payload.id] = action.payload.name;
		return freeze(state);
	});
	r.addCase(delete_list, (state, action) => {
		state.visibleLists = state.visibleLists.filter((x) => x !== action.payload);
		delete state.listIdToList[action.payload];
		return state;
	});
	r.addCase(revoke_share, (state, action) => {
		state.visibleLists = state.visibleLists.filter((x) => x !== action.payload.id);
		delete state.listIdToList[action.payload.id];
		return state;
	});
	r.addCase(accept_pending_share, (state, action) => {
		state.visibleLists = [action.payload, ...state.visibleLists];
	});
	r.addCase(reorder_list, (state, action) => {
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
	});
});
