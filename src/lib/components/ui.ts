import { createAction, createReducer } from '@reduxjs/toolkit';

export interface UiState {
  title: string;
  icon: string;
}

export const set_title = createAction<string>('set_title');
export const set_icon = createAction<string>('set_icon');

const initialUiState = {
  title: 'Todo',
  icon: 'list',
} as UiState;

export const ui = createReducer(initialUiState, (r) => {
	r.addCase(set_title, (state, action) => {
		state.title = action.payload;
	});
	r.addCase(set_icon, (state, action) => {
		state.icon = action.payload;
	});
});
