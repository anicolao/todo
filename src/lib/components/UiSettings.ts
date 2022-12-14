import { createAction, createReducer } from '@reduxjs/toolkit';

export interface UiSettings {
	backgroundUrl?: string | null;
}

export const set_background_url = createAction<string>('set_background_url');

const initialUiState = {
	backgroundUrl: undefined
} as UiSettings;

export const uiSettings = createReducer(initialUiState, (r) => {
	r.addCase(set_background_url, (state, action) => {
		state.backgroundUrl = action.payload;
		return state;
	});
});
