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
import { cache } from './components/cache';
import { openDB } from 'idb';

const startTime = new Date().getTime();
let lastTime = startTime;

export function logTime(message: string) {
	const now = new Date().getTime();
	console.log(now - startTime + ' ms Δ' + (now - lastTime) + ' ms ' + message);
	lastTime = now;
}

export function handleDocChanges(
	docChanges: DocumentChange<DocumentData>[],
	user: AuthState,
	isANormalAction: boolean
) {
	// console.log('handleDocChanges start', docChanges);
	const requestShouldBeAutoExecuted = (data: any) =>
		data.creator === user.uid || data.type === 'accept_request' || data.type === 'reject_request';
	let count = 0;
	docChanges.forEach((change) => {
		if (change.type === 'added' || (change.type === 'modified' && change.doc)) {
			let doc = change.doc;
			let data = { ...doc.data(), firebase_doc_id: doc.id } as unknown as AnyAction;
			if (isANormalAction || requestShouldBeAutoExecuted(data)) {
				store.dispatch(data);
				++count;
			} else {
				delete data.timestamp;
				store.dispatch(incoming_request({ id: doc.id, uid: data.creator, action: data }));
				++count;
			}
		}
	});
	const skipped =
		count >= docChanges.length ? '' : ' skipped ' + (docChanges.length - count) + ' actions';
	logTime('...handleDocChanges did ' + count + ' action' + (count !== 1 ? 's' : '') + skipped);
}

function svelteStoreEnhancer(createStoreApi: (arg0: any, arg1: any) => any) {
	return function (reducer: any, initialState: any) {
		const reduxStore = createStoreApi(reducer, initialState);
		let callbackCount = 0;
		let keysCallbackCount: { [k: string]: number } = {};
		let lastItems: any = null;
		let lastKey: { [k: string]: any } = {};
		return {
			...reduxStore,
			subscribe(fn: (arg0: any) => void) {
				fn(reduxStore.getState());

				return reduxStore.subscribe(() => {
					callbackCount++;
					Object.keys(reduxStore.getState()).forEach((k) => {
						if (reduxStore.getState()[k] !== lastKey[k]) {
							lastKey[k] = reduxStore.getState()[k];
							keysCallbackCount[k] = keysCallbackCount[k] + 1 || 1;
						}
					});
					if (callbackCount % 10000 === 0) {
						Object.keys(reduxStore.getState()).forEach((k) => {
							logTime(`$store callback #${callbackCount} (${k}: ${keysCallbackCount[k]})`);
						});
					}
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
	cache,
	users
};
const reduxStore = configureStore({
	reducer,
	enhancers: [svelteStoreEnhancer],
	middleware: [],
	devTools: { maxAge: 100000 }
});
export type ReduxStore = typeof reduxStore;
export type GlobalState = ReturnType<typeof reduxStore.getState>;
export type SvelteStore = Writable<GlobalState>;

let rebasedLocalActions: AnyAction[] = [];
const CACHE_INTERVAL = 1000;
let cachePending = false;
function cacheState(stateToCache: ReduxStore, timestamp: number) {
	cachePending = true;
	return async () => {
		const currentTime = stateToCache.getState().cache.timestamp;
		if (currentTime !== timestamp) {
			window.setTimeout(cacheState(stateToCache, currentTime), CACHE_INTERVAL);
			return;
		}
		console.log(`Write the database! @ ${new Date().getTime()} for time ${timestamp}`);
		const db = await openDB('TODOS', 1, {
			upgrade(db) {
				const store = db.createObjectStore('state');
			}
		});
		const me = stateToCache.getState().auth.email;
		if (me) {
			await db.put('state', stateToCache.getState(), me);
		}
		cachePending = false;
	};
}
const combinedReducers = combineReducers(reducer);
const serverSideStore = reduxStore as ReduxStore & SvelteStore;
const rebasingReducer = (state: GlobalState, action: AnyAction) => {
	// console.log('REBASING hook in place!', action);
	if (action.timestamp !== null) {
		if (action.timestamp !== undefined) {
			// console.log('server side action: ', action);
			if (action.timestamp.seconds > state.cache.timestamp && !cachePending) {
				// persist this state. Now we know there is an action after it, there is
				// no chance of overlap.
				// assert serverSideStore.getState().cache.timestamp === state.cache.timestamp
				window.setTimeout(cacheState(serverSideStore, state.cache.timestamp), CACHE_INTERVAL);
			}
		} else {
			// console.log('UI or Cache action: ', action);
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
		// console.log('client side action: ', action);
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
