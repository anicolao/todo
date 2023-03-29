import firebase from '$lib/firebase';
import { handleDocChanges, logTime, store } from '$lib/store';
import type { AnyAction } from '@reduxjs/toolkit';
import {
	addDoc,
	collection,
	onSnapshot,
	orderBy,
	query,
	serverTimestamp
} from 'firebase/firestore';

/*
export async function create(type: string, uid: string) {
	const c = collection(firebase.firestore, type);
	return addDoc(c, { creator: uid });
}
*/

export async function dispatch(type: string, id: string, uid: string, action: AnyAction) {
	const actions = collection(firebase.firestore, type, id, 'actions');
	console.log('DISPATCH DISPATCH ', { action });
	return addDoc(actions, { ...action, timestamp: serverTimestamp(), creator: uid }).catch(
		(message) => {
			console.error(message);
		}
	);
}

/*
const watching: { [k: string]: Unsubscribe } = {};
export async function watchAll(type: string) {
	const documents = collection(firebase.firestore, type);
	return onSnapshot(
		query(documents),
		(querySnapshot) => {
			querySnapshot.docChanges().forEach(async (change) => {
				if (change.type === 'added' || (change.type === 'modified' && change.doc)) {
					let docId = change.doc.id;
					if (watching[docId]) {
						watching[docId]();
					}
					watching[docId] = await watch(type, docId);
				}
			});
		},
		(error) => {
			console.log('watch all query failing: ');
			console.error(error);
		}
	);
}

*/
export function watch(type: string, id: string) {
	// console.log({watch: type, id});
	const actions = collection(firebase.firestore, type, id, 'actions');
	return onSnapshot(
		query(actions, orderBy('timestamp')),
		{ includeMetadataChanges: true },
		(querySnapshot) => {
			logTime('calling handleDocChanges');
			handleDocChanges(querySnapshot.docChanges(), store.getState().auth, true);
		},
		(error) => {
			console.log('actions query failing: ');
			console.error(error);
		}
	);
}
