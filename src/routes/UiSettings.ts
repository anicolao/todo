import { createAction, createReducer } from '@reduxjs/toolkit';

export interface UiSettings {
  backgroundUrl?: string | null;
}

export const backgroundUrlAction = createAction<UiSettings>('backgroundUrl');

const initialUiState = {
  backgroundUrl: undefined
} as UiSettings;

export const uiSettings = createReducer(initialUiState, (r) => {
  r.addCase(backgroundUrlAction, (state, action) => {
    return { ...state, ...action.payload };
  })
});
