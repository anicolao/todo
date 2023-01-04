import { createAction, createReducer, type AnyAction } from '@reduxjs/toolkit';
import type { WritableDraft } from 'immer/dist/internal';

export interface RequestsState {
	outgoingRequests: string[];
	incomingRequests: string[];
	completedRequests: string[];
	requestIdToRequest: { [k: string]: AnyAction };
	requestIdToUid: { [k: string]: string };
	requestIdToAccepted: { [k: string]: boolean };
}

export const outgoing_request = createAction<{ id: string; uid: string; action: AnyAction }>(
	'outgoing_request'
);
export const incoming_request = createAction<{ id: string; uid: string; action: AnyAction }>(
	'incoming_request'
);
export const accept_request = createAction<{ id: string }>('accept_request');
export const reject_request = createAction<{ id: string }>('reject_request');

export const initialState = {
	outgoingRequests: [],
	incomingRequests: [],
	completedRequests: [],
	requestIdToAccepted: {},
	requestIdToRequest: {},
	requestIdToUid: {}
} as RequestsState;

export const requests = createReducer(initialState, (r) => {
	r.addCase(outgoing_request, (state, { payload }) => {
		state.requestIdToRequest[payload.id] = payload.action;
		state.requestIdToUid[payload.id] = payload.uid;
		if (payload.action.type === 'accept_request' || payload.action.type === 'reject_request') {
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
	function ack(state: WritableDraft<RequestsState>, payload: { id: string }, accepted: boolean) {
		state.outgoingRequests = state.outgoingRequests.filter((id: string) => id !== payload.id);
		state.incomingRequests = state.incomingRequests.filter((id: string) => id !== payload.id);
		state.completedRequests.push(payload.id);
		state.requestIdToAccepted[payload.id] = accepted;
	}
	r.addCase(accept_request, (state, { payload }) => {
		ack(state, payload, true);
	});
	r.addCase(reject_request, (state, { payload }) => {
		ack(state, payload, false);
	});
});
