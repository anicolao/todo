import { createAction, createReducer } from '@reduxjs/toolkit';

export interface UiState {
	listId: string;
	itemId: string;
	title: string;
	icon: string;
	showEditDialog: boolean;
	showItemDetailsDialog: boolean;
}

export const set_current_listid = createAction<string>('set_current_listid');
export const set_current_item = createAction<string>('set_current_item');
export const set_title = createAction<string>('set_title');
export const set_icon = createAction<string>('set_icon');
export const show_edit_dialog = createAction<boolean>('show_edit_dialog');
export const show_item_detail_dialog = createAction<boolean>('show_item_detail_dialog');

const initialUiState = {
	listId: '',
	itemId: '',
	title: 'Todo',
	icon: 'list',
	showEditDialog: false,
	showItemDetailsDialog: false
} as UiState;

export const ui = createReducer(initialUiState, (r) => {
	r.addCase(set_current_listid, (state, action) => {
		state.listId = action.payload;
	});
	r.addCase(set_current_item, (state, action) => {
		state.itemId = action.payload;
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
	r.addCase(show_item_detail_dialog, (state, action) => {
		state.showItemDetailsDialog = action.payload;
	});
});
