import { watch } from '$lib/components/ActionLog';
import type { AuthState } from '$lib/components/auth';
import { rename_list } from '$lib/components/lists';
import { add_user } from '$lib/components/users';
import firebase from '$lib/firebase';
import { handleDocChanges, logTime, store, enableCaching } from '$lib/store';
import {
	collection,
	collectionGroup,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	orderBy,
	query,
	setDoc,
	where,
	type Unsubscribe
} from 'firebase/firestore';
import { openDB } from 'idb';
import { set_loading_status } from './components/ui';

const createFirebaseListActions = async function (id: string, user: AuthState, name?: string) {
	if (user.uid) {
		const listDesc = id + (name ? ' ' + name : '');
		logTime('Firebase: Setting up list ' + listDesc);
		const editorDoc = doc(firebase.firestore, 'editors', id, user.uid, 'editor');
		const alreadySetup = await getDoc(editorDoc);
		logTime('Firebase: ...done checking alreadySetup ' + listDesc);
		if (!alreadySetup.exists()) {
			try {
				logTime('Firebase: adding user to "editors" ' + listDesc);
				await setDoc(doc(firebase.firestore, 'editors', id, user.uid, 'editor'), {
					email: user.email
				});
				logTime('Firebase: ...done adding user to "editors" ' + listDesc);
				logTime('Firebase: Create inital action for ' + listDesc);
				if (name === undefined) {
					// this one isn't our own list.-
					console.log(`Firebase: No need to create initial action for ${id}`);
				} else {
					await setDoc(doc(firebase.firestore, 'lists', id, 'actions', 'name'), {
						...rename_list({ id, name }),
						timestamp: 0
					});
					logTime('Firebase: ...done create initial action for ' + listDesc);
				}
			} catch (message) {
				console.error(message);
			}
		}
		// unsub = watch('lists', id);
		logTime('Firebase: ...done setting up list ' + listDesc);
	}
};

async function loadCachedState(user: AuthState) {
	const db = await openDB('TODOS', 1, {
		upgrade(db) {
			const store = db.createObjectStore('state');
		}
	});
	if (user.email) {
		const cachedState = await db.get('state', user.email);
		if (cachedState) {
			console.log('Read cached state for ' + cachedState.cache.timestamp);
			const newState = { ...cachedState };
			newState.users = store.getState().users;
			store.dispatch({ type: 'CACHE_LOADED@INIT', payload: newState });
		}
	}
}

let loadCount = 0;

export function load() {
	console.log('src/lib/database.ts: load', loadCount++);
	logTime('Beginning of time');
	store.dispatch(set_loading_status({ loadingPercentage: 0, loadingStatus: 'Initializing' }));

	let unsubscribeActions: Unsubscribe | undefined = undefined;
	let unsubscribeUsers: Unsubscribe | undefined | null = undefined;
	let unsubscribeActivity: Unsubscribe | undefined = undefined;
	let loadingSubscription: Unsubscribe | undefined = undefined;
	let unsubscribeOnline: (() => void) | undefined = undefined;
	let listListeners: { [id: string]: Unsubscribe | null } = {};
	let listLoadAttempts: { [id: string]: number } = {};
	function cleanupSubscriptions() {
		console.log('src/lib/database.ts: CLEANING UP');
		if (unsubscribeUsers) {
			unsubscribeUsers();
			console.log('src/lib/database.ts: UN SUBSCRIBED to users');
			unsubscribeUsers = undefined;
		}
		if (unsubscribeActions) {
			unsubscribeActions();
			console.log('src/lib/database.ts: UN SUBSCRIBED to actions');
			unsubscribeActions = undefined;
		}
		if (unsubscribeActivity) {
			unsubscribeActivity();
			console.log('src/lib/database.ts: UN SUBSCRIBED to activity');
			unsubscribeActivity = undefined;
		}
		if (unsubscribeOnline) {
			unsubscribeOnline();
			console.log('src/lib/database.ts: UN SUBSCRIBED to online listener');
			unsubscribeOnline = undefined;
		}
		Object.keys(listListeners).forEach((id) => {
			const unsubscribe = listListeners[id];
			if (unsubscribe) {
				unsubscribe();
			}
		});
		listListeners = {};
		listLoadAttempts = {};
		if (loadingSubscription) {
			loadingSubscription();
			console.log('src/lib/database.ts: UN SUBSCRIBED to loadingSubscription');
			loadingSubscription = undefined;
		}
	}

	function subscribeToUsersCollection() {
		const users = collection(firebase.firestore, 'users');
		unsubscribeUsers = onSnapshot(query(users), (querySnapshot) => {
			querySnapshot.docChanges().forEach((change) => {
				if (change.type === 'added') {
					let doc = change.doc;
					console.log(doc.data());
					store.dispatch(add_user(doc.data()));
				}
			});
		});
	}

	let actionsPromise = new Promise((resolve) => {
		let isResolved = false;
		/**
		 * Load the active list at startup, then add list listeners on demand.
		 *
		 * We avoid eagerly watching every list. A list gets watched when the
		 * local user opens it, when it is needed to display a pending share, or
		 * when the activity collection tells us that a visible list changed.
		 * On reconnect, we refresh from activity again so a list opened offline
		 * or updated while we were offline gets a listener.
		 */
		async function loadListActionsAtStartup(user: AuthState) {
			console.log('src/lib/database.ts: load list data.');
			let lastVisibleLists: string[] | undefined = undefined;
			let lastCurrentListId: string | null = null;
			let initialListLoading: string | null | undefined = undefined;
			const activityStartTime = Math.floor(Date.now() / 1000);
			const activity = collection(firebase.firestore, 'activity');
			console.log(`Watching for activity from server since ${activityStartTime}`);

			const getCurrentListId = () =>
				store.getState().ui.listId || new URLSearchParams(window.location.search).get('listId');
			const isVisibleList = (id: string) => store.getState().lists.visibleLists.indexOf(id) !== -1;
			const getEarliestCachedListTime = () => {
				let earliestCacheTime = Infinity;
				const state = store.getState();
				state.lists.visibleLists.forEach((id) => {
					const timestamp = state.lists.listIdToTimestamp[id];
					if (timestamp > 0) {
						earliestCacheTime = Math.min(earliestCacheTime, timestamp);
					}
				});
				return earliestCacheTime === Infinity ? -1 : earliestCacheTime;
			};
			function loadComplete() {
				logTime('initialDatabaseLoadComplete');
				enableCaching();
				store.dispatch(set_loading_status({ loadingPercentage: 100, loadingStatus: 'Done' }));
				window.setTimeout(() => store.dispatch(set_loading_status({ loadingStatus: '' })), 2000);
				initialListLoading = null;
				if (!isResolved) {
					isResolved = true;
					resolve(true);
				}
			}

			const loadList = async (id: string, nameOverride?: string, retryLoading = false) => {
				if (retryLoading && listListeners[id] === null) {
					delete listListeners[id];
				}
				if (listListeners[id] === undefined) {
					listListeners[id] = null;
					const attempt = (listLoadAttempts[id] || 0) + 1;
					listLoadAttempts[id] = attempt;
					const name = nameOverride || store.getState().lists.listIdToList[id];
					console.log('Loading for ' + id + ' ' + name);
					try {
						await createFirebaseListActions(id, user, name);
						if (listLoadAttempts[id] !== attempt) {
							return;
						}
						listListeners[id] = watch('lists', id, (snapshot) => {
							logTime('Calling handleDocChanges for ' + id + ' ' + name);
							handleDocChanges(snapshot, store.getState().auth, true);
							if (initialListLoading === id) {
								loadComplete();
							}
						});
					} catch (error) {
						if (listLoadAttempts[id] === attempt) {
							delete listListeners[id];
							delete listLoadAttempts[id];
						}
						console.error(error);
					}
				}
			};

			const refreshListSubscriptions = async (reason: string) => {
				const state = store.getState();
				const retryLoading = reason === 'online';
				const currentListId = getCurrentListId();
				console.log(`Refresh list subscriptions: ${reason}`);
				if (currentListId && state.lists.visibleLists.indexOf(currentListId) !== -1) {
					loadList(currentListId, undefined, retryLoading);
				}

				const activityRefreshStartTime = getEarliestCachedListTime();
				try {
					const docs = await getDocs(
						query(activity, where('seconds', '>=', activityRefreshStartTime))
					);
					docs.forEach((doc) => {
						const seconds = doc.get('seconds');
						const cachedSeconds = store.getState().lists.listIdToTimestamp[doc.id] || 0;
						if (typeof seconds === 'number' && seconds > cachedSeconds && isVisibleList(doc.id)) {
							loadList(doc.id, undefined, retryLoading);
						}
					});
				} catch (error) {
					console.error(error);
				}
			};

			const watchPendingShareLists = (state: any) => {
				state.requests.incomingRequests.forEach(async (requestId: string) => {
					if (
						state.requests.completedRequests.indexOf(requestId) === -1 &&
						state.requests.requestIdToRequest[requestId].type === 'accept_pending_share'
					) {
						const shareAction = state.requests.requestIdToRequest[requestId];
						await loadList(shareAction.payload);
					}
				});
			};

			if (unsubscribeActivity === undefined) {
				const changedActivity = query(activity, where('seconds', '>=', activityStartTime));
				unsubscribeActivity = onSnapshot(changedActivity, (querySnapshot) => {
					querySnapshot.docChanges().forEach((change) => {
						if (change.type === 'removed') {
							return;
						}
						if (isVisibleList(change.doc.id)) {
							loadList(change.doc.id);
						}
					});
				});
			}

			if (unsubscribeOnline === undefined) {
				const onOnline = () => {
					refreshListSubscriptions('online');
				};
				window.addEventListener('online', onOnline);
				unsubscribeOnline = () => window.removeEventListener('online', onOnline);
			}

			store.subscribe((state: any) => {
				if (state.lists.visibleLists !== lastVisibleLists) {
					lastVisibleLists = state.lists.visibleLists;
					const currentListId = getCurrentListId();
					if (initialListLoading === undefined) {
						initialListLoading =
							currentListId && state.lists.visibleLists.indexOf(currentListId) !== -1
								? currentListId
								: null;
						if (initialListLoading) {
							store.dispatch(
								set_loading_status({ loadingPercentage: 0, loadingStatus: 'Loading list' })
							);
							refreshListSubscriptions('startup');
						} else {
							logTime('Initial data load for UI complete.');
							loadComplete();
						}
					}
					watchPendingShareLists(state);
				}

				const currentListId = getCurrentListId();
				if (currentListId !== lastCurrentListId) {
					lastCurrentListId = currentListId;
					if (currentListId && state.lists.visibleLists.indexOf(currentListId) !== -1) {
						loadList(currentListId);
					}
				}
			});
		}

		let lastSignInState: any = undefined;

		loadingSubscription = store.subscribe(async (state: any) => {
			if (state.auth.signedIn !== lastSignInState) {
				lastSignInState = state.auth.signedIn;
				if (state.auth.signedIn) {
					console.log('src/lib/database.ts: signed in changed to TRUE!');
					if (unsubscribeUsers === undefined) {
						unsubscribeUsers = null;
						const user = state.auth;
						if (user.uid) {
							subscribeToUsersCollection();
							logTime(`uid ready ${store.getState().auth.uid} for ${store.getState().auth.email}`);
							await loadCachedState(store.getState().auth);
							logTime(`timestamp after ${store.getState()?.cache?.timestamp || 0}`);
							const startTime = store.getState()?.cache?.timestamp || 0;
							if (!isResolved && startTime > 0) {
								logTime(`database.ts: Display cached state in ui.`);
								isResolved = true;
								resolve(true);
							}

							logTime('Subscribe to global "requests" actions.');
							const actions = collectionGroup(firebase.firestore, 'requests');
							const q = query(actions, where('target', '==', user.uid), orderBy('timestamp'));
							let isFirstRequestsSnapshot = true;
							unsubscribeActions = onSnapshot(q, (querySnapshot) => {
								let changes = querySnapshot.docChanges();
								if (isFirstRequestsSnapshot) {
									logTime(
										`Filtering ${changes.length} global requests on first call from time ${startTime}`
									);
									changes = changes.filter((x: any) => {
										return x.doc.data().timestamp?.seconds > startTime;
									});
									logTime(`... ${changes.length} global requests remaining.`);
								}
								handleDocChanges(changes, user, false);
								if (isFirstRequestsSnapshot) {
									loadListActionsAtStartup(user);
								}
								isFirstRequestsSnapshot = false;
							});
						}
					}
				} else {
					cleanupSubscriptions();
				}
			}
		});
	});

	let loaded = Promise.all([actionsPromise, new Promise((resolve) => setTimeout(resolve, 100))]);

	return {
		loaded: { loaded },
		cleanupSubscriptions
	};
}
