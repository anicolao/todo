import { watch } from '$lib/components/ActionLog';
import { signed_in, signed_out, type AuthState } from '$lib/components/auth';
import { rename_list } from '$lib/components/lists';
import { add_user } from '$lib/components/users';
import firebase from '$lib/firebase';
import { handleDocChanges, logTime, store } from '$lib/store';
import { onAuthStateChanged } from 'firebase/auth';
import {
	collection,
	collectionGroup,
	doc,
	getDoc,
	onSnapshot,
	orderBy,
	query,
	setDoc,
	where,
	type Unsubscribe,
	getDocs
} from 'firebase/firestore';
import { openDB } from 'idb';
import { set_loading_status } from './components/ui';

const sleep = <T extends any>(delay: number, resolveValue: T): Promise<T> =>
	new Promise((resolve) => {
		console.log('starting promise');
		setTimeout(() => {
			console.log('promise finished');
			resolve(resolveValue);
		}, delay);
	});

const createFirebaseListActions = async function (id: string, user: AuthState, name?: string) {
	if (user.uid) {
		logTime('Create new list for ' + id);
		const editorDoc = doc(firebase.firestore, 'editors', id, user.uid, 'editor');
		const alreadySetup = await getDoc(editorDoc);
		logTime('checking alreadySetup');
		if (!alreadySetup.exists()) {
			try {
				await setDoc(doc(firebase.firestore, 'editors', id, user.uid, 'editor'), {
					email: user.email
				});
				logTime('Create new actions for ' + id);
				if (name === undefined) {
					// this one isn't our own list.-
					console.log(`No need to create actions for ${id}`);
				} else {
					await setDoc(doc(firebase.firestore, 'lists', id, 'actions', 'name'), {
						...rename_list({ id, name }),
						timestamp: 0
					});
				}
			} catch (message) {
				console.error(message);
			}
		}
		// unsub = watch('lists', id);
	}
};

let authCount = 0;

function loadAuth() {
	console.log('src/lib/database.ts: loadAuth', authCount++);
	const auth = firebase.auth;
	console.log('src/lib/database.ts: loadAuth set up auth state callback');
	/*const unsubAuth =*/ onAuthStateChanged(auth, (user) => {
		if (user) {
			console.log('src/lib/database.ts: auth callback for user ', { user });
			const uid = user.uid;
			console.log('src/lib/database.ts: onAuthStateChanged   sign in ');
			store.dispatch(
				signed_in({
					uid: uid,
					name: user.displayName,
					email: user.email,
					photo: user.photoURL,
					signedIn: true,
					authMessage: ''
				})
			);
			if (user.email) {
				// always true
				setDoc(doc(firebase.firestore, 'users', user.email), {
					uid: user.uid,
					name: user.displayName,
					email: user.email,
					photo: user.photoURL,
					activity_timestamp: new Date().getTime()
				}).catch((message) => {
					// TODO: Surface this error state in the UI.
					console.error(message);
				});
			}
		} else {
			console.log('src/lib/database.ts: onAuthStateChanged   sign out ');
			store.dispatch(signed_out());
		}
	});
	// onDestroy(unsubAuth);
}

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
	loadAuth();
	logTime('done loadAuth');

	let unsubscribeActions: Unsubscribe | undefined = undefined;
	let unsubscribeUsers: Unsubscribe | undefined = undefined;
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
		function loadListActionsAtStartup(user: AuthState) {
			console.log('src/lib/database.ts: First "requests" snaphot being resolved now.');
			let lastVisibleLists: string[] | undefined = undefined;
			let initialListsLoading: string[] | undefined | null = undefined;
			const listListeners: { [id: string]: Unsubscribe } = {};
			// TODO: unsubscribe to all listListeners

			// Get notified when state.lists.visibleLists changes.
			store.subscribe((state: any) => {
				if (state.lists.visibleLists !== lastVisibleLists) {
					lastVisibleLists = state.lists.visibleLists;

					if (lastVisibleLists) {
						console.log('newly visible lists length: ' + lastVisibleLists.length);
						if (initialListsLoading === undefined) {
							// our first time; note that we need to load these lists
							initialListsLoading = lastVisibleLists.slice();

							/*
							// Filter initialListsLoading for the lists that have changed since we last loaded.
							const lastCacheTime = state.cache.timestamp;
							const activity = collection(firebase.firestore, 'activity');
							const q = query(activity, where('seconds', '>=', lastCacheTime));
							const updatedListIds = (await getDocs(q)).docChanges().map(d => d.doc.id);

							initialListsLoading = initialListsLoading.filter(id => updatedListIds.indexOf(id) !== -1);
							console.log("filtered initialListsLoading", initialListsLoading);
							*/

							if (initialListsLoading.length === 0) {
								// We have loaded the lists of lists, and there are 0 lists.
								if (!isResolved) {
									isResolved = true;
									resolve(true);
								}
								initialListsLoading = null;
							}
						}

						// Get actions for each list.
						const numberOfLists = initialListsLoading?.length || 1;
						store.dispatch(
							set_loading_status({ loadingPercentage: 0, loadingStatus: 'Loading lists' })
						);
						/*
						let listsToLoad: string[] = [];
						if (initialListsLoading?.length) {
							listsToLoad = listsToLoad.concat(initialListsLoading);
						}
						listsToLoad = listsToLoad.concat(lastVisibleLists);
						listsToLoad.forEach(async (id: string) => {
						*/
						lastVisibleLists.forEach(async (id: string) => {
							if (listListeners[id] === undefined) {
								const name = state.lists.listIdToList[id];
								await createFirebaseListActions(id, user, name);
								listListeners[id] = watch('lists', id, (snapshot) => {
									logTime('watch: calling handleDocChanges for ' + name);
									handleDocChanges(snapshot, store.getState().auth, true);
									if (initialListsLoading) {
										let idIndex = initialListsLoading.indexOf(id);
										if (idIndex >= 0) {
											initialListsLoading.splice(idIndex, 1);
										}
										logTime('loading initial list data ' + initialListsLoading.length);
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
											logTime('initialDatabaseLoadComplete');
											store.dispatch(
												set_loading_status({ loadingPercentage: 100, loadingStatus: 'Done' })
											);
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
									}
								});
							}
						});
					}
				}

				// Get actions for lists that are pending shares (to show the list name).
				state.requests.incomingRequests.forEach(async (requestId: string) => {
					if (
						state.requests.completedRequests.indexOf(requestId) === -1 &&
						state.requests.requestIdToRequest[requestId].type === 'accept_pending_share'
					) {
						const shareAction = state.requests.requestIdToRequest[requestId];
						const id = shareAction.payload;
						if (listListeners[id] === undefined) {
							await createFirebaseListActions(id, user);
							listListeners[id] = watch('lists', id, (snapshot) => {
								handleDocChanges(snapshot, store.getState().auth, true);
							});
						}
					}
				});
			});
		}

		let lastSignInState: any = undefined;

		store.subscribe(async (state: any) => {
			if (state.auth.signedIn !== lastSignInState) {
				if (state.auth.signedIn) {
					console.log('src/lib/database.ts: signed in changed to TRUE!');
					if (unsubscribeUsers === undefined) {
						const user = state.auth;
						if (user.uid) {
							subscribeToUsersCollection();
							logTime(`uid ready ${store.getState().auth.uid} for ${store.getState().auth.email}`);
							await loadCachedState(store.getState().auth);
							logTime(`timestamp after ${store.getState()?.cache?.timestamp || 0}`);
							const startTime = store.getState()?.cache?.timestamp || 0;
							if (!isResolved && startTime > 0) {
								isResolved = true;
								resolve(true);
							}

							logTime('Start of "requests"...');
							const actions = collectionGroup(firebase.firestore, 'requests');
							const q = query(actions, where('target', '==', user.uid), orderBy('timestamp'));
							console.log('src/lib/database.ts: Subscribing to actions for you', {
								'prev unsub': unsubscribeActions
							});
							let isFirstRequestsSnapshot = true;
							unsubscribeActions = onSnapshot(q, (querySnapshot) => {
								let changes = querySnapshot.docChanges();
								if (isFirstRequestsSnapshot) {
									logTime('First "requests" snaphot.');
									changes = changes.filter((x: any) => {
										return x.doc.data().timestamp?.seconds > startTime;
									});
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
			lastSignInState = state.auth.signedIn;
		});
	});

	let loaded = Promise.all([actionsPromise, sleep(100, 0)]);

	return {
		loaded: { loaded },
		cleanupSubscriptions
	};
}
