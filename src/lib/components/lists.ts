import { createAction, createReducer } from '@reduxjs/toolkit';

export interface ListsState {
	visibleLists: string[];
	listIdToList: { [key: string]: string };
	pendingShares: { id: string; name: string; sharerId: string }[];
}

export const create_list = createAction<{ id: string; name: string }>('create_list');
export const rename_list = createAction<{ id: string; name: string }>('rename_list');
export const delete_list = createAction<string>('delete_list');
export const register_pending_share = createAction<{ id: string; name: string }>('accept_share');
export const accept_pending_share = createAction<string>('accept_pending_share');

export const initialState = {
	visibleLists: [],
	listIdToList: {},
	pendingShares: []
} as ListsState;

export const lists = createReducer(initialState, (r) => {
	r.addCase(create_list, (state, action) => {
		state.visibleLists = [action.payload.id, ...state.visibleLists];
		state.listIdToList[action.payload.id] = action.payload.name;
		return state;
	});
	r.addCase(rename_list, (state, action) => {
		state.listIdToList[action.payload.id] = action.payload.name;
		return state;
	})
		.addCase(delete_list, (state, action) => {
			state.visibleLists = state.visibleLists.filter((x) => x !== action.payload);
			delete state.listIdToList[action.payload];
			return state;
		})
		.addCase(register_pending_share, (state, action_basic) => {
			const action = action_basic as typeof action_basic & { creator: string };
			state.pendingShares = [
				{ ...action.payload, sharerId: action.creator },
				...state.pendingShares
			];
			return state;
		})
		.addCase(accept_pending_share, (state, action) => {
			let listInfo = state.pendingShares.filter((x) => x.id === action.payload);
			state.pendingShares = state.pendingShares.filter((x) => x.id !== action.payload);
			state.visibleLists = [action.payload, ...state.visibleLists];
			state.listIdToList[action.payload] = listInfo[0].name;
			return state;
		});
});
