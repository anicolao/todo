import { createAction, createReducer } from '@reduxjs/toolkit';
import { signed_in, signed_out } from './auth';

export interface ListsState {
	visibleLists: string[];
	listIdToList: { [key: string]: string };
	pendingShares: { id: string; name: string; sharerId: string }[];
}

export const create_list = createAction<{ id: string; name: string }>('create_list');
export const rename_list = createAction<{ id: string; name: string }>('rename_list');
export const delete_list = createAction<string>('delete_list');
export const register_pending_share = createAction<{ id: string; name: string }>('register_pending_share');
export const accept_pending_share = createAction<string>('accept_pending_share');
export const revoke_share = createAction<{ id: string }>('revoke_share');

export const initialState = {
	visibleLists: [],
	listIdToList: {},
	pendingShares: []
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
	r.addCase(register_pending_share, (state, action_basic) => {
		const action = action_basic as typeof action_basic & { creator: string };
		state.pendingShares = [
			{ ...action.payload, sharerId: action.creator },
			...state.pendingShares
		];
		return state;
	});
	r.addCase(revoke_share, (state, action) => {
		state.visibleLists = state.visibleLists.filter((x) => x !== action.payload.id);
		delete state.listIdToList[action.payload.id];
		return state;
	});
	r.addCase(accept_pending_share, (state, action) => {
		let listInfo = state.pendingShares.filter((x) => x.id === action.payload);
		state.pendingShares = state.pendingShares.filter((x) => x.id !== action.payload);
		state.visibleLists = [action.payload, ...state.visibleLists];
		state.listIdToList[action.payload] = listInfo[0].name;
		return state;
	});
});
