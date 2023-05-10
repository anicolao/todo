import { createReducer } from '$lib/redux';
import { createAction, type AnyAction } from '@reduxjs/toolkit';

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
		state = { ...state };
		state.requestIdToRequest = { ...state.requestIdToRequest };
		state.requestIdToRequest[payload.id] = payload.action;
		state.requestIdToUid = { ...state.requestIdToUid };
		state.requestIdToUid[payload.id] = payload.uid;
		if (payload.action.type === 'accept_request' || payload.action.type === 'reject_request') {
			// don't wait for an ack of an ack
			state.completedRequests = [...state.completedRequests, payload.id];
		} else {
			state.outgoingRequests = [...state.outgoingRequests, payload.id];
		}
		return state;
	});

	r.addCase(incoming_request, (state, { payload }) => {
		state = { ...state };
		state.requestIdToRequest = { ...state.requestIdToRequest };
		state.requestIdToRequest[payload.id] = payload.action;
		state.requestIdToUid = { ...state.requestIdToUid };
		state.requestIdToUid[payload.id] = payload.uid;
		state.incomingRequests = [...state.incomingRequests];
		state.incomingRequests.push(payload.id);
		return state;
	});
	function ack(state: RequestsState, payload: { id: string }, accepted: boolean) {
		state = { ...state };
		state.outgoingRequests = state.outgoingRequests.filter((id: string) => id !== payload.id);
		state.incomingRequests = state.incomingRequests.filter((id: string) => id !== payload.id);
		state.completedRequests = [...state.completedRequests, payload.id];
		state.requestIdToAccepted = { ...state.requestIdToAccepted };
		state.requestIdToAccepted[payload.id] = accepted;
		return state;
	}
	r.addCase(accept_request, (state, { payload }) => {
		return ack(state, payload, true);
	});
	r.addCase(reject_request, (state, { payload }) => {
		return ack(state, payload, false);
	});
});
