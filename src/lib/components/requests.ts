import { createAction, createReducer, type AnyAction } from '@reduxjs/toolkit';

export interface RequestsState {
	pendingRequests: string[];
	completedRequests: string[];
	requestIdToRequest: { [k: string]: AnyAction };
	requestIdToUid: { [k: string]: string };
}

export const pending_request = createAction<{ id: string; uid: string; action: AnyAction }>(
	'pending_request'
);
export const accept_request = createAction<{ id: string }>('accept_request');
export const accept_request_by_payload_id = createAction<{ id: string }>('accept_request_by_payload_id');

export const initialState = {
	pendingRequests: [],
	completedRequests: [],
	requestIdToRequest: {},
	requestIdToUid: {}
} as RequestsState;

export const requests = createReducer(initialState, (r) => {
	r.addCase(pending_request, (state, { payload }) => {
		state.requestIdToRequest[payload.id] = payload.action;
		state.requestIdToUid[payload.id] = payload.uid;
		state.pendingRequests.push(payload.id);
	});
	r.addCase(accept_request, (state, { payload }) => {
		state.pendingRequests = state.pendingRequests.filter((id) => id !== payload.id);
		state.completedRequests.push(payload.id);
	});
	r.addCase(accept_request_by_payload_id, (state, { payload }) => {
		const requests = Object.entries(state.requestIdToRequest);
		for (const [key, value] of requests) {
			if (value.payload.id === payload.id) {
				state.pendingRequests = state.pendingRequests.filter((id) => id !== key);
				state.completedRequests.push(key);
			}
		}
	});
});
