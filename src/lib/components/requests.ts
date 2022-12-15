import { createAction, createReducer, type AnyAction } from '@reduxjs/toolkit';

export interface RequestsState {
	outgoingRequests: string[];
	incomingRequests: string[];
	completedRequests: string[];
	requestIdToRequest: { [k: string]: AnyAction };
	requestIdToUid: { [k: string]: string };
}

export const outgoing_request = createAction<{ id: string; uid: string; action: AnyAction }>(
	'outgoing_request'
);
export const incoming_request = createAction<{ id: string; uid: string; action: AnyAction }>(
	'incoming_request'
);
export const accept_request = createAction<{ id: string }>('accept_request');

export const initialState = {
	outgoingRequests: [],
	incomingRequests: [],
	completedRequests: [],
	requestIdToRequest: {},
	requestIdToUid: {}
} as RequestsState;

export const requests = createReducer(initialState, (r) => {
	r.addCase(outgoing_request, (state, { payload }) => {
		state.requestIdToRequest[payload.id] = payload.action;
		state.requestIdToUid[payload.id] = payload.uid;
		if (payload.action.type === 'accept_request') {
			// don't wait for an ack of an ack
			state.completedRequests.push(payload.id);
		} else {
			state.outgoingRequests.push(payload.id);
		}
	});
	r.addCase(incoming_request, (state, { payload }) => {
		state.requestIdToRequest[payload.id] = payload.action;
		state.requestIdToUid[payload.id] = payload.uid;
		state.incomingRequests.push(payload.id);
	});
	r.addCase(accept_request, (state, { payload }) => {
		state.outgoingRequests = state.outgoingRequests.filter((id) => id !== payload.id);
		state.incomingRequests = state.incomingRequests.filter((id) => id !== payload.id);
		state.completedRequests.push(payload.id);
	});
});
