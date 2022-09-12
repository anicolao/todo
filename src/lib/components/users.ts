import { createAction, createReducer } from '@reduxjs/toolkit';
import type { AuthState } from '$lib/components/auth';

export interface UsersState {
  users: AuthState[];
}

export const add_user = createAction<AuthState>('add_user');

const initialAuthState = {
  users: [],
} as UsersState;

export const users = createReducer(initialAuthState, (r) => {
  r.addCase(add_user, (state, action) => {
    state.users.push(action.payload);
    return state;
  });
});
