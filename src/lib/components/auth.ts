import { createReducer } from '$lib/redux';
import { createAction } from '@reduxjs/toolkit';

export interface AuthState {
	uid?: string | null;
	name?: string | null;
	email?: string | null;
	photo?: string | null;
	signedIn?: boolean;
	authMessage?: string;
}

export const waiting = createAction('waiting');
export const unknown = createAction('unknown');
export const error = createAction<string>('error');
export const signed_in = createAction<AuthState>('signed_in');
export const signed_out = createAction('signed_out');

const initialAuthState = {
	uid: undefined,
	name: undefined,
	email: undefined,
	photo: undefined,
	signedIn: undefined,
	authMessage: undefined
} as AuthState;

export const auth = createReducer(initialAuthState, (r) => {
	r.addCase(waiting, (state, action) => {
		return { authMessage: 'Waiting...', signedIn: false };
	});
	r.addCase(unknown, (state, action) => {
		return { authMessage: 'Unknown sign in state', signedIn: false };
	});
	r.addCase(error, (state, action) => {
		return { authMessage: action.payload, signedIn: false };
	});
	r.addCase(signed_in, (state, action) => {
		return { ...state, ...action.payload, signedIn: true };
	});
	r.addCase(signed_out, (state, action) => {
		return { authMessage: 'Signed out.', signedIn: false };
	});
});
