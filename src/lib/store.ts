import { auth } from '$lib/components/auth';
import { lists } from '$lib/components/lists';
import { uiSettings } from '$lib/components/UiSettings';
import { users } from '$lib/components/users';
import { configureStore } from '@reduxjs/toolkit';
import type { Writable } from 'svelte/store';
import { items } from './components/items';
import { requests } from './components/requests';
import { ui } from './components/ui';

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
	ui,
	lists,
	items,
	requests,
	users
};
const reduxStore = configureStore({ reducer, enhancers: [svelteStoreEnhancer], devTools:{maxAge: 100000} });
export type ReduxStore = typeof reduxStore;
export type GlobalState = ReturnType<typeof reduxStore.getState>;
export type SvelteStore = Writable<GlobalState>;

export const store = reduxStore as ReduxStore & SvelteStore;
