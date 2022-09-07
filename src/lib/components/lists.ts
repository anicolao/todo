import { createAction, createReducer } from '@reduxjs/toolkit';

export interface ListsState {
  visibleLists: string[];
  listIdToList: { [key: string]: string};
}

export const create_list = createAction<{ id: string, name: string}>('create_list');
export const rename_list = createAction<{ id: string, name: string}>('rename_list');
export const delete_list = createAction<string>('delete_list');

export const initialState = {
    visibleLists: [],
    listIdToList: {}
} as ListsState;

export const lists = createReducer(initialState, (r) => {
  r.addCase(create_list, (state, action) => {
    state.visibleLists = [action.payload.id, ...state.visibleLists];
    state.listIdToList[action.payload.id] = action.payload.name;
    return state;
  })
  r.addCase(rename_list, (state, action) => {
    state.visibleLists = state.visibleLists.filter(x => x !== action.payload.id);
    state.visibleLists = [action.payload.id, ...state.visibleLists];
    state.listIdToList[action.payload.id] = action.payload.name;
    return state;
  })
  .addCase(delete_list, (state, action) => {
    state.visibleLists = state.visibleLists.filter(x => x !== action.payload);
    delete state.listIdToList[action.payload];
    return state;
  })
});