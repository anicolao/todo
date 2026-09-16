import {
	collection,
	doc,
	getDocs,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	writeBatch,
	type DocumentReference
} from 'firebase/firestore';
import type { AnyAction } from '@reduxjs/toolkit';
import firebase from '$lib/firebase';
import {
	discardLocalAction,
	handleDocChanges,
	observeConfirmedActions,
	store,
	writeCacheNow
} from '$lib/store';
import { shouldReplayListAction } from '$lib/list-action-replay';
import {
	accept_pending_share,
	create_label,
	delete_list,
	rename_list,
	revoke_share
} from './lists';
import { add_label_predicate, remove_label_predicate, set_label_query } from './labels';
import { outgoing_request } from './requests';
import { sharingStatus } from './list-details-state';

// A setting is one atomic batch, including outgoing-request bookkeeping. There
// can be no half-sent sharing selection or half-applied membership selection.
export function listSettingsSession(listId: string) {
	let committed: (() => Promise<void>) | undefined;
	let labelId: string | undefined;
	async function run(
		build: (
			add: (ref: DocumentReference, action: AnyAction, target?: string) => void,
			uid: string
		) => Promise<void> | void
	) {
		if (committed) {
			await committed();
			committed = undefined;
			return;
		}
		const state = store.getState();
		const uid = state.auth.uid;
		if (!uid || state.lists.listIdToList[listId] === undefined) throw new Error('List unavailable');
		const batch = writeBatch(firebase.firestore);
		const ownIds: string[] = [];
		const allIds: string[] = [];
		const listIds = new Set<string>();
		const add = (ref: DocumentReference, action: AnyAction, target?: string) => {
			batch.set(ref, {
				...action,
				creator: uid,
				timestamp: serverTimestamp(),
				...(target ? { target } : {})
			});
			allIds.push(ref.id);
			if (target === uid) ownIds.push(ref.id);
			if (ref.parent.parent?.parent.id === 'lists') listIds.add(ref.parent.parent.id);
		};
		await build(add, uid);
		const confirmed = observeConfirmedActions(ownIds);
		try {
			await batch.commit();
		} catch (error) {
			confirmed.cancel();
			allIds.forEach(discardLocalAction);
			throw error;
		}
		// Retain this completion stage on failure: retry must never submit a second
		// invitation or create another label after the batch has already committed.
		committed = async () => {
			await confirmed.promise;
			for (const id of listIds) {
				const snapshot = await getDocs(
					query(collection(firebase.firestore, 'lists', id, 'actions'), orderBy('timestamp'))
				);
				const current = store.getState().lists;
				const changes = snapshot.docChanges().filter((change) => {
					const time = change.doc.data().timestamp;
					return (
						time &&
						shouldReplayListAction(
							change.doc.id,
							time,
							current.listIdToTimestamp[id] || 0,
							current.listIdToBoundaryActionIds?.[id]
						)
					);
				});
				handleDocChanges(changes, store.getState().auth, true);
			}
			await writeCacheNow();
		};
		await committed();
		committed = undefined;
	}
	const listAction = (id: string) => doc(collection(firebase.firestore, 'lists', id, 'actions'));
	const request = (uid: string, target: string) =>
		doc(collection(firebase.firestore, 'from', uid, 'to', target, 'requests'));
	return {
		get committed() {
			return !!committed;
		},
		rename: (name: string) =>
			run((add) => {
				if (!name.trim()) throw new Error('Name required');
				add(listAction(listId), rename_list({ id: listId, name: name.trim() }));
			}),
		remove: () => run((add) => add(listAction(listId), delete_list(listId))),
		share: (changes: Record<string, boolean>) =>
			run((add, uid) => {
				for (const [target, selected] of Object.entries(changes)) {
					const status = sharingStatus(store.getState().requests, listId, target);
					if (status === 'invitation' || status === 'removal')
						throw new Error('Sharing changed elsewhere');
					const action = selected ? accept_pending_share(listId) : revoke_share({ id: listId });
					const ref = request(uid, target);
					add(ref, action, target);
					add(request(uid, uid), outgoing_request({ id: ref.id, uid: target, action }), uid);
				}
			}),
		labels: (changes: Record<string, boolean>, newName?: string) =>
			run(async (add, uid) => {
				for (const [id, selected] of Object.entries(changes)) {
					const action = (selected ? add_label_predicate : remove_label_predicate)({
						label_id: id,
						predicate: { type: 'id', id: listId }
					});
					add(listAction(id), action);
				}
				if (newName?.trim()) {
					labelId ??= crypto.randomUUID();
					// Security rules require an editor document before the batch. This empty
					// prerequisite grants only this user access and creates no visible label.
					await setDoc(doc(firebase.firestore, 'editors', labelId, uid, 'editor'), {
						email: store.getState().auth.email
					});
					add(request(uid, uid), create_label({ id: labelId, name: newName.trim() }), uid);
					add(listAction(labelId), rename_list({ id: labelId, name: newName.trim() }));
					add(
						listAction(labelId),
						set_label_query({
							label_id: labelId,
							query: { type: 'or', predicates: [{ type: 'id', id: listId }] }
						})
					);
				}
			})
	};
}
