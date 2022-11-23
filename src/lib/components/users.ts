import { createAction, createReducer } from '@reduxjs/toolkit';
import { signed_in, signed_out, type AuthState } from '$lib/components/auth';

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

export const users = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(add_user, (state, action) => {
		state.users.push(action.payload);
		return state;
	});
});
