import { createAction, createReducer } from '@reduxjs/toolkit';
import { signed_in, signed_out } from './auth';

export interface ListsState {
	visibleLists: string[];
	listIdToList: { [key: string]: string };
}

export const create_list = createAction<{ id: string; name: string }>('create_list');
export const rename_list = createAction<{ id: string; name: string }>('rename_list');
export const delete_list = createAction<string>('delete_list');
export const accept_pending_share = createAction<string>('accept_pending_share');
export const revoke_share = createAction<{ id: string }>('revoke_share');

export const initialState = {
	visibleLists: [],
	listIdToList: {}
} as ListsState;

export const lists = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(create_list, (state, action) => {
		state.visibleLists = [...state.visibleLists, action.payload.id];
		state.listIdToList[action.payload.id] = action.payload.name;
		return state;
	});
	r.addCase(rename_list, (state, action) => {
		state.listIdToList[action.payload.id] = action.payload.name;
		return state;
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
});
