import firebase from '$lib/firebase';
import { handleDocChanges, logTime, store } from '$lib/store';
import type { AnyAction } from '@reduxjs/toolkit';
import {
	addDoc,
	collection,
	onSnapshot,
	orderBy,
	query,
	serverTimestamp,
	type DocumentChange,
	type DocumentData,
	Timestamp
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
export function watch(
	type: string,
	id: string,
	callback: (s: DocumentChange<DocumentData>[]) => void
) {
	// console.log({watch: type, id});
	const actions = collection(firebase.firestore, type, id, 'actions');
	const currentTime = store.getState()?.cache?.cacheLoadTime || 0;
	console.log(`watch from time ${currentTime} on ${id}`);
	// TODO: Look at the tradeoff between using where(timestamp) to speed up startup time,
	// TODO: which also slows down regular usage (especially on older phones).
	// TODO: and which might even break off-line usage.
	// const currentTimestamp = new Timestamp(currentTime, 0);
	return onSnapshot(
		query(actions, orderBy('timestamp')),
		{ includeMetadataChanges: true },
		(querySnapshot) => {
			let changes = querySnapshot.docChanges().filter((x) => {
				// Find the rename_list action every time (at timestamp 0), as
				// well as client-side actions that don't have a timestamp with
				//   !x.doc.data().timestamp
				return !x.doc.data().timestamp || x.doc.data().timestamp.seconds > currentTime;
			});
			callback(changes);
		},
		(error) => {
			console.log('actions query failing: ');
			console.error(error);
		}
	);
}
