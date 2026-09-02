import type { AnyAction } from '@reduxjs/toolkit';
import {
	collection,
	collectionGroup,
	onSnapshot,
	orderBy,
	query,
	where,
	type DocumentData,
	type Query,
	type QueryDocumentSnapshot,
	type QuerySnapshot,
	type Unsubscribe
} from 'firebase/firestore';
import type { FirebaseRuntime } from './firebase';
import type { CursorState, StreamCursor } from './types';
import type { Projection } from './projection';
import { TodoServiceError } from './errors';

interface TimestampValue {
	seconds: number;
	nanoseconds: number;
}

function timestampOf(data: DocumentData): TimestampValue | undefined {
	const value = data.timestamp;
	if (value === 0) return { seconds: 0, nanoseconds: 0 };
	if (
		value &&
		typeof value === 'object' &&
		typeof value.seconds === 'number' &&
		typeof value.nanoseconds === 'number'
	) {
		return { seconds: value.seconds, nanoseconds: value.nanoseconds };
	}
	return undefined;
}

function compareTimestamp(left: TimestampValue, right: TimestampValue) {
	return left.seconds === right.seconds
		? left.nanoseconds - right.nanoseconds
		: left.seconds - right.seconds;
}

function shouldApply(cursor: StreamCursor | undefined, timestamp: TimestampValue, id: string) {
	if (!cursor) return true;
	const comparison = compareTimestamp(timestamp, cursor);
	return comparison > 0 || (comparison === 0 && !cursor.documentIds.includes(id));
}

function advanceCursor(
	cursor: StreamCursor | undefined,
	timestamp: TimestampValue,
	id: string
): StreamCursor {
	if (!cursor || compareTimestamp(timestamp, cursor) > 0) {
		return { ...timestamp, documentIds: [id] };
	}
	if (compareTimestamp(timestamp, cursor) === 0 && !cursor.documentIds.includes(id)) {
		return { ...cursor, documentIds: [...cursor.documentIds, id] };
	}
	return cursor;
}

function sortDocuments(documents: QueryDocumentSnapshot<DocumentData>[]) {
	return [...documents].sort((left, right) => {
		const leftTimestamp = timestampOf(left.data());
		const rightTimestamp = timestampOf(right.data());
		if (!leftTimestamp && !rightTimestamp) return left.id.localeCompare(right.id);
		if (!leftTimestamp) return 1;
		if (!rightTimestamp) return -1;
		return compareTimestamp(leftTimestamp, rightTimestamp) || left.id.localeCompare(right.id);
	});
}

export class FirestoreSynchronizer {
	#globalUnsubscribe?: Unsubscribe;
	#listUnsubscribes = new Map<string, Unsubscribe>();
	#listStarts = new Map<string, Promise<void>>();
	#queue = Promise.resolve();
	#stopped = false;
	#uid = '';
	#reconcilePromise?: Promise<void>;
	#reconcileRequested = false;
	#waiters = new Map<string, Set<() => void>>();

	constructor(
		readonly firebase: FirebaseRuntime,
		readonly projection: Projection,
		readonly cursors: CursorState,
		readonly changed: () => void,
		readonly failed: (error: unknown) => void
	) {}

	async start(uid: string) {
		this.#uid = uid;
		this.#stopped = false;
		const globalQuery = query(
			collectionGroup(this.firebase.firestore, 'requests'),
			where('target', '==', uid),
			orderBy('timestamp')
		);
		await this.subscribeGlobal(globalQuery);
		await this.reconcileLists();
	}

	private enqueue(task: () => void | Promise<void>) {
		const result = this.#queue.then(task);
		this.#queue = result.then(
			() => undefined,
			(error) => {
				this.failed(error);
			}
		);
		return result;
	}

	private subscribeGlobal(globalQuery: Query<DocumentData>) {
		return new Promise<void>((resolve, reject) => {
			let initial = true;
			this.#globalUnsubscribe = onSnapshot(
				globalQuery,
				(snapshot) => {
					const processed = this.enqueue(() => this.processGlobal(snapshot));
					processed.then(
						() => {
							if (initial) {
								initial = false;
								resolve();
							} else {
								void this.reconcileLists();
							}
						},
						(error) => {
							if (initial) reject(error);
						}
					);
				},
				(error) => {
					if (initial) reject(error);
					else this.failed(error);
				}
			);
		});
	}

	private processGlobal(snapshot: QuerySnapshot<DocumentData>) {
		const documents = snapshot.docChanges().map((change) => change.doc);
		for (const document of sortDocuments(documents)) {
			const data = document.data();
			const timestamp = timestampOf(data);
			if (!timestamp || !shouldApply(this.cursors.global, timestamp, document.id)) continue;
			this.projection.dispatchGlobal(data as AnyAction, this.#uid, document.id, timestamp.seconds);
			this.cursors.global = advanceCursor(this.cursors.global, timestamp, document.id);
			this.confirm(document.id);
			this.changed();
		}
	}

	private reconcileLists() {
		if (this.#reconcilePromise) {
			this.#reconcileRequested = true;
			return this.#reconcilePromise;
		}
		this.#reconcilePromise = this.runReconcileLists().finally(() => {
			this.#reconcilePromise = undefined;
		});
		return this.#reconcilePromise;
	}

	private async runReconcileLists() {
		do {
			this.#reconcileRequested = false;
			await this.doReconcileLists();
		} while (this.#reconcileRequested);
	}

	private async doReconcileLists() {
		if (this.#stopped) return;
		const visible = new Set(this.projection.visibleDocumentIds());
		for (const [id, unsubscribe] of this.#listUnsubscribes) {
			if (!visible.has(id)) {
				unsubscribe();
				this.#listUnsubscribes.delete(id);
			}
		}
		for (const id of visible) {
			if (!this.#listUnsubscribes.has(id)) await this.subscribeList(id);
		}
	}

	private subscribeList(id: string) {
		const existing = this.#listStarts.get(id);
		if (existing) return existing;
		const started = new Promise<void>((resolve, reject) => {
			let initial = true;
			const actionsQuery = query(
				collection(this.firebase.firestore, 'lists', id, 'actions'),
				orderBy('timestamp')
			);
			const unsubscribe = onSnapshot(
				actionsQuery,
				(snapshot) => {
					const processed = this.enqueue(() => this.processList(id, snapshot));
					processed.then(
						() => {
							if (initial) {
								initial = false;
								resolve();
							}
						},
						(error) => {
							if (initial) reject(error);
						}
					);
				},
				(error) => {
					if (initial) reject(error);
					else this.failed(error);
				}
			);
			this.#listUnsubscribes.set(id, unsubscribe);
		});
		this.#listStarts.set(id, started);
		return started.finally(() => this.#listStarts.delete(id));
	}

	private processList(id: string, snapshot: QuerySnapshot<DocumentData>) {
		const documents = snapshot.docChanges().map((change) => change.doc);
		for (const document of sortDocuments(documents)) {
			const data = document.data();
			const timestamp = timestampOf(data);
			const cursor = this.cursors.lists[id];
			if (!timestamp || !shouldApply(cursor, timestamp, document.id)) continue;
			const result = this.projection.dispatchList(
				data as AnyAction,
				document.id,
				timestamp.seconds
			);
			if (!result.applied) {
				console.warn(
					`Skipping ${data.type} (${document.id}) in list ${id}: item ${result.missingItemIds.join(
						', '
					)} has not been created`
				);
			}
			this.cursors.lists[id] = advanceCursor(cursor, timestamp, document.id);
			this.confirm(document.id);
			this.changed();
		}
	}

	waitForAction(documentId: string, timeoutMs = 10_000) {
		return new Promise<void>((resolve, reject) => {
			const callbacks = this.#waiters.get(documentId) || new Set<() => void>();
			let timeout: ReturnType<typeof setTimeout>;
			const callback = () => {
				clearTimeout(timeout);
				resolve();
			};
			callbacks.add(callback);
			this.#waiters.set(documentId, callbacks);
			timeout = setTimeout(() => {
				callbacks.delete(callback);
				if (callbacks.size === 0) this.#waiters.delete(documentId);
				reject(
					new TodoServiceError(
						'commit_status_unknown',
						`Write was acknowledged but action ${documentId} was not observed`
					)
				);
			}, timeoutMs);
		});
	}

	private confirm(documentId: string) {
		const callbacks = this.#waiters.get(documentId);
		if (!callbacks) return;
		this.#waiters.delete(documentId);
		for (const callback of callbacks) callback();
	}

	async stop() {
		this.#stopped = true;
		this.#globalUnsubscribe?.();
		this.#globalUnsubscribe = undefined;
		for (const unsubscribe of this.#listUnsubscribes.values()) unsubscribe();
		this.#listUnsubscribes.clear();
		this.#listStarts.clear();
		await this.#queue;
	}
}
