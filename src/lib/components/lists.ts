import { createReducer } from '$lib/redux';
import { createAction } from '@reduxjs/toolkit';
import { signed_in, signed_out } from './auth';

export type ListDocumentType = 'list' | 'label';

export interface LastKnownListInfo {
	name?: string;
	ownerUid?: string;
	ownerEmail?: string;
}

export interface ListsState {
	visibleLists: string[];
	listIdToList: { [key: string]: string };
	listIdToType: { [key: string]: ListDocumentType };
	listIdToLastKnownInfo: { [key: string]: LastKnownListInfo };
	listIdToTimestamp: { [key: string]: number };
}

export const create_list = createAction<{ id: string; name: string }>('create_list');
export const create_label = createAction<{ id: string; name: string }>('create_label');
export const rename_list = createAction<{ id: string; name: string }>('rename_list');
export const delete_list = createAction<string>('delete_list');
export const accept_pending_share = createAction<string>('accept_pending_share');
export const revoke_share = createAction<{ id: string }>('revoke_share');
export const reorder_list = createAction<{ id: string; goes_before?: string }>('reorder_list');

export const initialState = {
	visibleLists: [],
	listIdToList: {},
	listIdToType: {},
	listIdToLastKnownInfo: {},
	listIdToTimestamp: {}
} as ListsState;

function rememberListInfo(
	state: ListsState,
	id: string,
	name?: string,
	ownerUid?: string,
	ownerEmail?: string
) {
	state.listIdToLastKnownInfo = { ...state.listIdToLastKnownInfo };
	state.listIdToLastKnownInfo[id] = {
		...state.listIdToLastKnownInfo[id],
		...(name ? { name } : {}),
		...(ownerUid ? { ownerUid } : {}),
		...(ownerEmail ? { ownerEmail } : {})
	};
}

function createVisibleDocument(
	state: ListsState,
	id: string,
	name: string,
	type: ListDocumentType,
	position: 'top' | 'bottom',
	ownerUid?: string,
	ownerEmail?: string
) {
	state = { ...state };
	if (state.visibleLists.indexOf(id) === -1) {
		state.visibleLists =
			position === 'top' ? [id, ...state.visibleLists] : [...state.visibleLists, id];
	}
	state.listIdToList = { ...state.listIdToList };
	state.listIdToList[id] = name;
	state.listIdToType = { ...state.listIdToType };
	state.listIdToType[id] = type;
	rememberListInfo(state, id, name, ownerUid, ownerEmail);
	return state;
}

export const lists = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(create_list, (state, action) => {
		const serverAction = action as typeof action & { creator?: string; creatorEmail?: string };
		return createVisibleDocument(
			state,
			action.payload.id,
			action.payload.name,
			'list',
			'bottom',
			serverAction.creator,
			serverAction.creatorEmail
		);
	});
	r.addCase(create_label, (state, action) => {
		const serverAction = action as typeof action & { creator?: string; creatorEmail?: string };
		return createVisibleDocument(
			state,
			action.payload.id,
			action.payload.name,
			'label',
			'top',
			serverAction.creator,
			serverAction.creatorEmail
		);
	});
	r.addCase(rename_list, (state, action) => {
		const serverAction = action as typeof action & { creator?: string; creatorEmail?: string };
		state = { ...state };
		state.listIdToList = { ...state.listIdToList };
		state.listIdToList[action.payload.id] = action.payload.name;
		rememberListInfo(
			state,
			action.payload.id,
			action.payload.name,
			serverAction.creator,
			serverAction.creatorEmail
		);
		return state;
	});
	r.addCase(delete_list, (state, action) => {
		state = { ...state };
		state.visibleLists = state.visibleLists.filter((x) => x !== action.payload);
		state.listIdToList = { ...state.listIdToList };
		delete state.listIdToList[action.payload];
		state.listIdToType = { ...state.listIdToType };
		delete state.listIdToType[action.payload];
		return state;
	});
	r.addCase(revoke_share, (state, action) => {
		state = { ...state };
		state.visibleLists = state.visibleLists.filter((x) => x !== action.payload.id);
		state.listIdToList = { ...state.listIdToList };
		delete state.listIdToList[action.payload.id];
		state.listIdToType = { ...state.listIdToType };
		delete state.listIdToType[action.payload.id];
		return state;
	});
	r.addCase(accept_pending_share, (state, action) => {
		state = { ...state };
		state.visibleLists =
			state.visibleLists.indexOf(action.payload) === -1
				? [action.payload, ...state.visibleLists]
				: state.visibleLists;
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
		const labelId = action.payload?.label_id;
		if (
			labelId &&
			(action.type === 'set_label_query' ||
				action.type === 'add_label_predicate' ||
				action.type === 'remove_label_predicate')
		) {
			state = { ...state };
			state.listIdToType = { ...state.listIdToType };
			state.listIdToType[labelId] = 'label';
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
