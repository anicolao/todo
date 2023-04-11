import { auth, type AuthState } from '$lib/components/auth';
import { lists } from '$lib/components/lists';
import { uiSettings } from '$lib/components/UiSettings';
import { users } from '$lib/components/users';
import { combineReducers, configureStore, createStore, type AnyAction, type Reducer, type Action } from '@reduxjs/toolkit';
import type { DocumentChange, DocumentData } from 'firebase/firestore';
import type { Writable } from 'svelte/store';
import { items } from './components/items';
import { incoming_request, requests } from './components/requests';
import { ui } from './components/ui';

const startTime = new Date().getTime();

export function logTime(message: string) {
	console.log(new Date().getTime() - startTime + ' ms ' + message);
}

export function handleDocChanges(
	docChanges: DocumentChange<DocumentData>[],
	user: AuthState,
	isANormalAction: boolean
) {
	// console.log('handleDocChanges start', docChanges);
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
	logTime('handleDocChanges done');
}

function svelteStoreEnhancer(createStoreApi: (arg0: any, arg1: any) => any) {
	return function (reducer: any, initialState: any) {
		const reduxStore = createStoreApi(reducer, initialState);
		let subscriberCount = 0;
		let callbackCount = 0;
		let prevKeysCallbackCount: { [k: string]: number } = {};
		let keysCallbackCount: { [k: string]: number } = {};
		let lastItems: any = null;
		let lastKey: { [k: string]: any } = {};
		return {
			...reduxStore,
			subscribe(fn: (arg0: any) => void) {
				fn(reduxStore.getState());
				subscriberCount++;

				const unsub = reduxStore.subscribe(() => {
					callbackCount++;
					Object.keys(reduxStore.getState()).forEach((k) => {
						if (reduxStore.getState()[k] !== lastKey[k]) {
							lastKey[k] = reduxStore.getState()[k];
							keysCallbackCount[k] = keysCallbackCount[k] + 1 || 1;
						}
					});
					if (callbackCount % 10000 === 0) {
						Object.keys(reduxStore.getState()).forEach((k) => {
							const newCalls = keysCallbackCount[k] - (prevKeysCallbackCount[k] || 0);
							if (newCalls > 0) {
								logTime(`$store callback #${callbackCount} [of ${subscriberCount}] (${k}: ${newCalls}/${keysCallbackCount[k]})`);
							}
						});
						prevKeysCallbackCount = { ...keysCallbackCount };
					}
					fn(reduxStore.getState());
				});
				return () => { subscriberCount--; unsub(); }
			}
		};
	};
}

/*
export const s_items = {
	subscribe(fn: (arg0: any) => void) {
		fn(reduxStore.getState().items);
		const unsub =  reduxStore.subscribe(() => {
			fn(reduxStore.getState().items);
		});
		return unsub;
	}
}
*/
// $s_items.foo

// const $foo = 5;
// const $$$ = 10;kkkk
// if ($store.auth.uid) {
// }

/*
const itemWrapperWrapper = {
	outerReducer: (state: any, action: AnyAction) => {
		let callback = () => {};
		let reducer = (state: any, action: AnyAction) => {
			const ret = items(state, action);
			//console.log(`Executing ${action.type} on items`)
			if (ret !== state) {
				console.log(`CHANGED items while executing ${action.type} on items`)
				callback();
			}
			return ret;
		};
		return reducer(state, action);
	},
}

const itemWrapper = {
	callback: undefined,
	reducer: (state: any, action: AnyAction) => {
		const ret = items(state, action);
		//console.log(`Executing ${action.type} on items`)
		if (ret !== state) {
			console.log(`CHANGED items while executing ${action.type} on items`)
		}
		return ret;
	},
}
*/

export class SvelteReducerWrapper<S = any, A extends Action = AnyAction> {
	wrappedReducer: Reducer<S, A>;
	callbacks: any[] = [];
	reducer(state: any, action: AnyAction) {
		const ret = this.wrappedReducer(state, action);
		//console.log(`Executing ${action.type} on items`)
		if (ret !== state) {
			console.log(`CHANGED items while executing ${action.type} on items`)
			this.callbacks.forEach(c => {
				c(ret);
			})
		}
		return ret;
	};
	constructor(reducer: any) {
		this.wrappedReducer = reducer;
	}
	subscribe(fn: (arg0: any) => void) {
		this.callbacks.push(fn);
		return () => {}
	}
}
export const itemWrapper = new SvelteReducerWrapper(items);
const reducer = {
	auth,
	uiSettings,
	ui,
	lists,
	items: (state: any, action: any) => { 
		let reduced = state?.reduced || items(state?.reduced, action);
		if (action.type === 'create_item') {
			console.log(`items executing ${action.type} on reduced`)
			reduced = items(state?.reduced, action);
		}
		return {...state, timestamp: new Date().getTime(), listIdToListOfItems: {}, reduced} || items(state, action)
	},
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
	// console.log('REBASING hook in place!', action);
	if (action.timestamp !== null) {
		if (action.timestamp !== undefined) {
			// console.log('server side action: ', action);
		} else {
			// console.log('UI action: ', action);
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
