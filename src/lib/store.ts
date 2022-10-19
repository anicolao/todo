import { combineReducers, configureStore, createStore, type AnyAction, type EnhancedStore } from '@reduxjs/toolkit';
import type { ThunkMiddleware } from 'redux-thunk';
import type { Writable } from 'svelte/store';
import { auth, type AuthState } from '$lib/components/auth';
import { uiSettings, type UiSettings } from '$lib/components/UiSettings';
import { lists, type ListsState } from '$lib/components/lists';
import { users, type UsersState } from '$lib/components/users';
import { items } from './components/items';

function svelteStoreEnhancer(createStoreApi: (arg0: any, arg1: any) => any) {
	return function (reducer: any, initialState: any) {
		const reduxStore = createStoreApi(reducer, initialState);
		return {
			...reduxStore,
			subscribe(fn: (arg0: any) => void) {
				fn(reduxStore.getState());

				return reduxStore.subscribe(() => {
					fn(reduxStore.getState());
				});
			}
		};
	};
}

const reducer = {
	auth,
	uiSettings,
	lists,
	items,
	users
};
const reduxStore = configureStore({ reducer, enhancers: [svelteStoreEnhancer] });
export type ReduxStore = typeof reduxStore;
export type GlobalState = ReturnType<typeof reduxStore.getState>;
export type SvelteStore = Writable<GlobalState>;

export const store = reduxStore as ReduxStore & SvelteStore;
