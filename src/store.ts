import { combineReducers, configureStore, createStore } from '@reduxjs/toolkit';
import { auth } from './components/auth';
import { uiSettings } from './routes/UiSettings';

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
	uiSettings
};
export const store = configureStore({ reducer, enhancers: [svelteStoreEnhancer] });
