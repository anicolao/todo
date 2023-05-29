import { createReducer } from '$lib/redux';
import { createAction } from '@reduxjs/toolkit';

export interface UiSettings {
	backgroundUrl?: string | null;
	currentUrl: string;
}

export const set_background_url = createAction<string>('set_background_url');
export const set_current_url = createAction<string>('set_current_url');

const initialUiState = {
	backgroundUrl: undefined,
	currentUrl: '/profile'
} as UiSettings;

export const uiSettings = createReducer(initialUiState, (r) => {
	r.addCase(set_background_url, (state, action) => {
		state = { ...state };
		state.backgroundUrl = action.payload;
		return state;
	});
	r.addCase(set_current_url, (state, action) => {
		state = { ...state };
		state.currentUrl = action.payload;
		return state;
	});
	r.addDefault((state, action) => {
		if (action.type === 'CACHE_LOADED@INIT') {
			return action.payload.uiSettings;
		}
		return state;
	});
});
