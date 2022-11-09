import { createAction, createReducer } from '@reduxjs/toolkit';

export interface UiState {
	listId: string;
	title: string;
	icon: string;
	showEditDialog: boolean;
}

export const set_current_listid = createAction<string>('set_current_listid');
export const set_title = createAction<string>('set_title');
export const set_icon = createAction<string>('set_icon');
export const show_edit_dialog = createAction<boolean>('show_edit_dialog');

const initialUiState = {
	listId: '',
	title: 'Todo',
	icon: 'list',
	showEditDialog: false,
} as UiState;

export const ui = createReducer(initialUiState, (r) => {
	r.addCase(set_current_listid, (state, action) => {
		state.listId = action.payload;
	});
	r.addCase(set_title, (state, action) => {
		state.title = action.payload;
	});
	r.addCase(set_icon, (state, action) => {
		state.icon = action.payload;
	});
	r.addCase(show_edit_dialog, (state, action) => {
		state.showEditDialog = action.payload;
	});
});
