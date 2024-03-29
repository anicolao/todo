import { signed_in, signed_out, type AuthState } from '$lib/components/auth';
import { createReducer } from '$lib/redux';
import { store } from '$lib/store';
import { createAction } from '@reduxjs/toolkit';

export interface UsersState {
	users: AuthState[];
}

export const add_user = createAction<AuthState>('add_user');

const initialState = {
	users: []
} as UsersState;

export function emailToUid(state: UsersState, email: string): string {
	const otherUser = state.users.filter((x) => x.email === email);
	if (otherUser.length >= 1) {
		return otherUser[0].uid || '';
	}
	return '';
}
function shareType(type: string) {
	return type === 'accept_pending_share' || type === 'revoke_share';
}
function filterPendingShares(uid: string, listid?: string) {
	const listId = listid || store.getState().ui.listId;
	return (requestId: string) =>
		store.getState().requests.requestIdToUid[requestId] === uid &&
		shareType(store.getState().requests.requestIdToRequest[requestId].type) &&
		(store.getState().requests.requestIdToRequest[requestId].payload === listId ||
			store.getState().requests.requestIdToRequest[requestId].payload.id === listId);
}

export function sharePending(users: UsersState, email: string) {
	const uid = emailToUid(users, email);
	const outgoingRequests = store
		.getState()
		.requests.outgoingRequests.filter(filterPendingShares(uid));
	return outgoingRequests.length > 0;
}

export function getSharedUsers(listId?: string): AuthState[] {
	let otherUsers = store
		.getState()
		.users.users.filter((u: AuthState) => u.email !== store.getState().auth.email);
	return otherUsers.filter(
		(u: AuthState) => u.email && shareAccepted(store.getState().users, u.email, listId)
	);
}

export function shareAccepted(users: UsersState, email: string, listId?: string) {
	const uid = emailToUid(users, email);
	const completedRequests = store
		.getState()
		.requests.completedRequests.filter(filterPendingShares(uid, listId));
	if (completedRequests.length === 0) return false;
	const lastRequest = completedRequests[completedRequests.length - 1];
	const value = store.getState().requests.requestIdToAccepted[lastRequest];
	const isAccept =
		store.getState().requests.requestIdToRequest[lastRequest].type === 'accept_pending_share';
	return isAccept && value;
}

export const users = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(add_user, (state, action) => {
		state = { ...state };
		state.users = [...state.users, action.payload];
		return state;
	});
});
