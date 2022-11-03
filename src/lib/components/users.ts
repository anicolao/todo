import { createAction, createReducer } from '@reduxjs/toolkit';
import { signed_in, signed_out, type AuthState } from '$lib/components/auth';

export interface UsersState {
	users: AuthState[];
}

export const add_user = createAction<AuthState>('add_user');

const initialState = {
	users: []
} as UsersState;

export const users = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(add_user, (state, action) => {
		state.users.push(action.payload);
		return state;
	});
});
