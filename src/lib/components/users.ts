import { createAction, createReducer } from '@reduxjs/toolkit';
import { signed_in, signed_out, type AuthState } from '$lib/components/auth';
import { store } from '$lib/store';

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

export function sharePending(users: UsersState, email: string) {
	const uid = emailToUid(users, email);
	const pendingRequests = store.getState().requests.pendingRequests.filter(
		(id: string) =>
			store.getState().requests.requestIdToUid[id] === uid &&
			store.getState().requests.requestIdToRequest[id].type === 'register_pending_share' &&
			store.getState().requests.requestIdToRequest[id].payload.id === store.getState().ui.listId
	);
	return pendingRequests.length > 0;
}

export function getSharedUsers() {
	let otherUsers = store.getState().users.users.filter((u: AuthState) => u.email !== store.getState().auth.email);
	return otherUsers.filter((u: AuthState) => u.email && shareAccepted(store.getState().users, u.email));
}

export function shareAccepted(users: UsersState, email: string) {
	const uid = emailToUid(users, email);
	const completedRequests = store.getState().requests.completedRequests.filter((id: string) => {
		const ret =
			store.getState().requests.requestIdToUid[id] === uid &&
			store.getState().requests.requestIdToRequest[id].type === 'register_pending_share' &&
			store.getState().requests.requestIdToRequest[id].payload.id === store.getState().ui.listId;
		return ret;
	});
	return completedRequests.length > 0;
}


export const users = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(add_user, (state, action) => {
		state.users.push(action.payload);
		return state;
	});
});
