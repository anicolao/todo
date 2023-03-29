import { auth, type AuthState } from '$lib/components/auth';
import { lists } from '$lib/components/lists';
import { uiSettings } from '$lib/components/UiSettings';
import { users } from '$lib/components/users';
import { combineReducers, configureStore, createStore, type AnyAction } from '@reduxjs/toolkit';
import type { DocumentChange, DocumentData } from 'firebase/firestore';
import type { Writable } from 'svelte/store';
import { items } from './components/items';
import { incoming_request, requests } from './components/requests';
import { ui } from './components/ui';

const startTime = new Date().getTime();

export function logTime(message: string) {
	console.log((new Date().getTime() - startTime) + ' ms ' + message);
}

export function handleDocChanges(
	docChanges: DocumentChange<DocumentData>[],
	user: AuthState,
	isANormalAction: boolean
) {
	docChanges.forEach((change) => {
		if (change.type === 'added' || (change.type === 'modified' && change.doc)) {
			let doc = change.doc;
			let data = { ...doc.data(), firebase_doc_id: doc.id } as unknown as AnyAction;
			const requestShouldBeAutoExecuted = (data: any) =>
				data.creator === user.uid ||
				data.type === 'accept_request' ||
				data.type === 'reject_request';
			if (isANormalAction || requestShouldBeAutoExecuted(data)) {
				store.dispatch(data);
			} else {
				delete data.timestamp;
				store.dispatch(incoming_request({ id: doc.id, uid: data.creator, action: data }));
			}
		}
	});
}

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
const reduxStore = configureStore({
	reducer,
	enhancers: [svelteStoreEnhancer],
	devTools: { maxAge: 100000 }
});
export type ReduxStore = typeof reduxStore;
export type GlobalState = ReturnType<typeof reduxStore.getState>;
export type SvelteStore = Writable<GlobalState>;

let rebasedLocalActions: AnyAction[] = [];
const combinedReducers = combineReducers(reducer);
const serverSideStore = reduxStore as ReduxStore & SvelteStore;
const rebasingReducer = (state: ReduxStore, action: AnyAction) => {
	console.log('REBASING hook in place!', action);
	if (action.timestamp !== null) {
		if (action.timestamp !== undefined) {
			console.log('server side action: ', action);
		} else {
			console.log('UI action: ', action);
		}
		const timestamp = action.timestamp ? action.timestamp.seconds : 0;
		delete action.timestamp;
		if (rebasedLocalActions.length > 0) {
			const currentLocalAction = rebasedLocalActions[0].firebase_doc_id;
			if (action.firebase_doc_id === currentLocalAction) {
				rebasedLocalActions = rebasedLocalActions.slice(1);
			}
		}
		action.timestamp = timestamp;
		serverSideStore.dispatch(action);
	} else {
		console.log('client side action: ', action);
		delete action.timestamp;
		rebasedLocalActions.push(action as AnyAction);
	}
	let replayedState = serverSideStore.getState();
	rebasedLocalActions.forEach((action) => {
		replayedState = combinedReducers(replayedState, action);
	});
	return replayedState;
};

export let store = createStore(
	rebasingReducer,
	serverSideStore.getState(),
	svelteStoreEnhancer
) as ReduxStore & SvelteStore;
