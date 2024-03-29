import { watch } from '$lib/components/ActionLog';
import type { AuthState } from '$lib/components/auth';
import { rename_list } from '$lib/components/lists';
import { add_user } from '$lib/components/users';
import firebase from '$lib/firebase';
import { handleDocChanges, logTime, store, type GlobalState, enableCaching } from '$lib/store';
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

let promiseId = 1000;
const sleep = <T extends any>(delay: number, resolveValue: T): Promise<T> =>
	new Promise((resolve) => {
		const myId = promiseId++;
		//console.log(`starting promise ${myId} at ${new Date()}`);
		setTimeout(() => {
			//console.log(`promise ${myId} finished at ${new Date()}`);
			resolve(resolveValue);
		}, delay);
	});

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
	let loadingSubscription: Unsubscribe | undefined = undefined;
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
		 * Load and replay the actions for all lists, at startup.
		 *
		 * When the application starts, get the inital list of lists.
		 * For each list, load and replay all of its actions.
		 *
		 * @param user  the authenticated user
		 */
		async function loadListActionsAtStartup(user: AuthState) {
			console.log('src/lib/database.ts: load list data.');
			let lastVisibleLists: string[] | undefined = undefined;
			let initialListsLoading: string[] | undefined | null = undefined;
			const listListeners: { [id: string]: Unsubscribe | null } = {};
			// TODO: unsubscribe to all listListeners

			let earliestCacheTime = Infinity;
			const existingState = store.getState();
			let latestCacheTime = existingState.cache.timestamp; // The last global cache time.
			for (const listId in existingState.lists.listIdToTimestamp) {
				earliestCacheTime = Math.min(
					earliestCacheTime,
					existingState.lists.listIdToTimestamp[listId]
				);
				latestCacheTime = Math.max(latestCacheTime, existingState.lists.listIdToTimestamp[listId]);
			}
			if (earliestCacheTime === Infinity) {
				earliestCacheTime = -1;
			}
			console.log(`Looking for activity from server since earliestCacheTime ${earliestCacheTime}`);

			const activity = collection(firebase.firestore, 'activity');
			const q = query(activity, where('seconds', '>=', earliestCacheTime));
			const docs = await getDocs(q);
			console.log('query came from local cache?', docs.metadata.fromCache);
			const updatedListIds = docs
				.docChanges()
				.filter((d) => existingState.lists.visibleLists.includes(d.doc.id))
				.filter((d) => {
					console.log('  listId ' + d.doc.id + '  ' + existingState.lists.listIdToList[d.doc.id]);
					console.log('    cached seconds ' + existingState.lists.listIdToTimestamp[d.doc.id]);
					console.log('    server seconds ' + d.doc.get('seconds'));
					const serverTime = d.doc.get('seconds');
					const hasNew =
						serverTime > existingState.lists.listIdToTimestamp[d.doc.id] ||
						serverTime >= latestCacheTime;
					console.log('    server has new items? ' + hasNew);
					return hasNew;
				})
				.map((d) => d.doc.id);
			console.log(
				'  New updatedListIds ' +
					updatedListIds.length +
					' ' +
					JSON.stringify(updatedListIds.map((id) => existingState.lists.listIdToList[id]))
			);

			// Get notified when state.lists.visibleLists changes.
			store.subscribe((state: GlobalState) => {
				if (state.lists.visibleLists !== lastVisibleLists) {
					const newlyVisibleLists: string[] = state.lists.visibleLists.filter(
						(id: string) => lastVisibleLists === undefined || lastVisibleLists.indexOf(id) === -1
					);
					lastVisibleLists = state.lists.visibleLists as string[];
					function loadComplete() {
						logTime('initialDatabaseLoadComplete');
						store.dispatch(set_loading_status({ loadingPercentage: 100, loadingStatus: 'Done' }));
						window.setTimeout(
							() => store.dispatch(set_loading_status({ loadingStatus: '' })),
							2000
						);
						initialListsLoading = null;
						if (!isResolved) {
							isResolved = true;
							resolve(true);
						}
					}

					if (newlyVisibleLists.length > 0) {
						console.log('newly visible lists length: ' + newlyVisibleLists.length);
						if (initialListsLoading === undefined) {
							// our first time; note that we need to load these lists
							initialListsLoading = lastVisibleLists.slice();

							// Filter initialListsLoading for the lists that have changed since we last loaded.
							initialListsLoading = initialListsLoading.filter(
								(id) => updatedListIds.indexOf(id) !== -1
							);
							logTime('filtered initialListsLoading');
							console.log(initialListsLoading);

							if (initialListsLoading.length === 0) {
								// We have loaded the lists of lists, and there are 0 lists.
								if (!isResolved) {
									isResolved = true;
									resolve(true);
								}
								logTime('Initial data load for UI complete.');
								initialListsLoading = null;
								store.dispatch(
									set_loading_status({ loadingPercentage: 100, loadingStatus: 'Ready' })
								);
								window.setTimeout(
									() => store.dispatch(set_loading_status({ loadingStatus: '' })),
									2000
								);
							}
						}

						const throttleLoading = async (id: string) => {
							const searchParams = new URLSearchParams(window.location.search);
							const currentListId = searchParams.get('listId');
							if (currentListId !== null && id !== currentListId) {
								// Delay loading unfocused lists to improve startup responsiveness.
								console.log('Delay loading for ' + id);
								await sleep(50, 0);
								console.log('Done delay for ' + id);
							}
						};

						// Get actions for each list.
						const numberOfLists = initialListsLoading?.length || 1;
						let listsToLoad: string[] = [];
						const searchParams = new URLSearchParams(window.location.search);
						const currentListId = searchParams.get('listId');
						if (currentListId !== null) {
							listsToLoad.push(currentListId);
						}
						if (initialListsLoading?.length) {
							store.dispatch(
								set_loading_status({ loadingPercentage: 0, loadingStatus: 'Loading lists' })
							);
							listsToLoad = listsToLoad.concat(
								initialListsLoading.filter((id) => id !== currentListId)
							);
						}
						listsToLoad = listsToLoad.concat(
							newlyVisibleLists.filter((id) => listsToLoad.indexOf(id) === -1)
						);
						const loadList = async (id: string) => {
							if (listListeners[id] === undefined) {
								listListeners[id] = null;
								const name = state.lists.listIdToList[id];
								await throttleLoading(id);
								console.log('Loading for ' + id + ' ' + name);
								await createFirebaseListActions(id, user, name);
								listListeners[id] = watch('lists', id, (snapshot) => {
									logTime('Calling handleDocChanges for ' + id + ' ' + name);
									handleDocChanges(snapshot, store.getState().auth, true);
									if (initialListsLoading) {
										let idIndex = initialListsLoading.indexOf(id);
										if (idIndex >= 0) {
											initialListsLoading.splice(idIndex, 1);
										}
										logTime('loading initial list data --> ' + initialListsLoading.length);
										store.dispatch(
											set_loading_status({
												loadingPercentage: Math.floor(
													((numberOfLists - initialListsLoading.length) / numberOfLists) * 100
												),
												loadingStatus: name
											})
										);
										if (initialListsLoading.length === 0) {
											// initial load complete
											loadComplete();
										}
									}
								});
							}
						};
						//listsToLoad.forEach(loadList);
						const loadListsRecursively = async (lists: string[], index: number) => {
							if (index < lists.length) {
								// do the work
								await loadList(lists[index]);
								loadListsRecursively(lists, index + 1);
							} else {
								// Get actions for lists that are pending shares (to show the list name).
								state.requests.incomingRequests.forEach(async (requestId: string) => {
									if (
										state.requests.completedRequests.indexOf(requestId) === -1 &&
										state.requests.requestIdToRequest[requestId].type === 'accept_pending_share'
									) {
										const shareAction = state.requests.requestIdToRequest[requestId];
										const id = shareAction.payload;
										if (listListeners[id] === undefined) {
											listListeners[id] = null;
											await createFirebaseListActions(id, user);
											listListeners[id] = watch('lists', id, (snapshot) => {
												handleDocChanges(snapshot, store.getState().auth, true);
											});
										}
									}
								});
								enableCaching();
							}
						};
						loadListsRecursively(listsToLoad, 0);
					} else {
						if (!isResolved) {
							loadComplete();
						}
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

	let loaded = Promise.all([actionsPromise, sleep(100, 0)]);

	return {
		loaded: { loaded },
		cleanupSubscriptions
	};
}
