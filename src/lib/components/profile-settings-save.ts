import firebase from '$lib/firebase';
import { observeConfirmedActions, writeCacheNow } from '$lib/store';
import type { AnyAction } from '@reduxjs/toolkit';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';

/**
 * A profile child screen owns one save session. If the Firestore write succeeds
 * but confirmation/cache flushing fails, Retry completes that same write instead
 * of appending a duplicate action.
 */
export function profileSettingSession(scope: 'account' | { labelId: string }) {
	let committed: (() => Promise<void>) | undefined;

	return {
		get committed() {
			return !!committed;
		},
		async save(action: AnyAction) {
			if (committed) {
				await committed();
				committed = undefined;
				return;
			}

			const uid = firebase.auth.currentUser?.uid;
			if (!uid) throw new Error('Account unavailable');
			if (typeof scope !== 'string' && action.payload?.label_id !== scope.labelId)
				throw new Error('Label action path does not match its payload');

			const reference =
				typeof scope === 'string'
					? doc(collection(firebase.firestore, 'from', uid, 'to', uid, 'requests'))
					: doc(collection(firebase.firestore, 'lists', scope.labelId, 'actions'));
			const confirmation = observeConfirmedActions([reference.id]);

			try {
				await setDoc(reference, {
					...action,
					creator: uid,
					timestamp: serverTimestamp(),
					...(typeof scope === 'string' ? { target: uid } : {})
				});
			} catch (error) {
				confirmation.cancel();
				throw error;
			}

			committed = async () => {
				await confirmation.promise;
				await writeCacheNow();
			};
			await committed();
			committed = undefined;
		}
	};
}
