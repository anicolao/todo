import { createAction, createReducer } from '@reduxjs/toolkit';


export interface TodoItem {
  completed: boolean;
  starred: boolean;
  description: string;
}
export interface ItemsState {
  itemIds: string[];
  itemIdToItem: { [id: string]: TodoItem };
}

export const create_item = createAction<{ id: string, description: string }>('create_item');
export const describe_item = createAction<{ id: string, description: string }>('describe_item');
export const complete_item = createAction<{ id: string, completed: boolean }>('complete_item');
export const star_item = createAction<{ id: string, starred: boolean }>('star_item');
export const reorder_item = createAction<{ id: string, goes_before?: string }>('reorder_item');

export const initialState = {
  itemIds: [],
  itemIdToItem: {},
} as ItemsState;

export const items = createReducer(initialState, (r) => {
  r.addCase(create_item, (state, action) => {
    state.itemIds = [action.payload.id, ...state.itemIds];
    state.itemIdToItem[action.payload.id] = { completed: false, starred: false, description: action.payload.description };
  });
  r.addCase(describe_item, (state, action) => {
    let item = state.itemIdToItem[action.payload.id];
    item.description = action.payload.description;
  });
  r.addCase(complete_item, (state, action) => {
    let item = state.itemIdToItem[action.payload.id];
    item.completed = action.payload.completed;
  });
  r.addCase(star_item, (state, action) => {
    let item = state.itemIdToItem[action.payload.id];
    item.starred = action.payload.starred;
  });

  r.addCase(reorder_item, (state, action) => {
    const index = state.itemIds.indexOf(action.payload.id);
    if (index !== -1) {
        const removedItem = state.itemIds.splice(index, 1);
        const newIndex = action.payload.goes_before ? state.itemIds.indexOf(action.payload.goes_before) : state.itemIds.length;
        if (newIndex === -1) {
            throw `ERROR: itemid ${action.payload.goes_before} not found in items array`;
        }
        state.itemIds = [state.itemIds.slice(0, newIndex), removedItem[0], state.itemIds.slice(newIndex)].flat();
    } else {
        throw `ERROR: itemid ${action.payload.id} not found in items array`;
    }
  });
});