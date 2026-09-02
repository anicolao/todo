import {
	complete_item,
	create_item,
	describe_item,
	remove_due_date,
	set_due_date,
	star_item
} from '$lib/components/items';
import type { AnyAction } from '@reduxjs/toolkit';
import { ConfigStore } from './config';
import { TodoServiceError, optionalString, requiredString, requireObject } from './errors';
import { FirebaseRuntime, type LoginParams } from './firebase';
import type { RuntimePaths } from './paths';
import { Projection } from './projection';
import { SnapshotStore } from './snapshot';
import { FirestoreSynchronizer } from './subscriptions';
import {
	SNAPSHOT_VERSION,
	type CursorState,
	type ItemView,
	type RpcRequest,
	type ServicePhase,
	type ServiceStatus,
	type SnapshotData
} from './types';

function firebaseError(error: unknown): never {
	const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
	if (code.includes('permission-denied')) {
		throw new TodoServiceError('permission', 'Firestore denied access to this Todo data');
	}
	if (code.includes('unauthenticated') || code.includes('auth/')) {
		throw new TodoServiceError('authentication', (error as Error).message);
	}
	throw error;
}

function boolean(value: unknown, name: string, fallback: boolean) {
	if (value === undefined) return fallback;
	if (typeof value !== 'boolean') throw new TodoServiceError('usage', `${name} must be a boolean`);
	return value;
}

export class TodoApplication {
	readonly firebase: FirebaseRuntime;
	readonly snapshots: SnapshotStore;
	readonly config: ConfigStore;
	#projection = new Projection();
	#cursors: CursorState = { lists: {} };
	#synchronizer?: FirestoreSynchronizer;
	#phase: ServicePhase = 'starting';
	#message?: string;
	#requests = new Map<string, Promise<unknown>>();
	#initialization?: Promise<void>;
	readonly #snapshotEnabled = process.env.TODO_CLI_DISABLE_SNAPSHOT !== 'true';

	constructor(
		readonly paths: RuntimePaths,
		firebase = new FirebaseRuntime()
	) {
		this.firebase = firebase;
		this.snapshots = new SnapshotStore(paths);
		this.config = new ConfigStore(paths);
	}

	initialize() {
		this.#initialization ||= this.initializeOnce();
		return this.#initialization;
	}

	private async initializeOnce() {
		this.#phase = 'starting';
		let user;
		try {
			user = await this.firebase.restore();
		} catch (error) {
			this.#phase = 'needs-auth';
			this.#message = `Saved login could not be restored: ${(error as Error).message}`;
			return;
		}
		if (!user) {
			this.#phase = 'needs-auth';
			return;
		}
		await this.startSynchronization().catch(() => undefined);
	}

	handle(request: RpcRequest) {
		const existing = this.#requests.get(request.id);
		if (existing) return existing;
		const ready = request.method === 'service.status' ? Promise.resolve() : this.initialize();
		const result = ready
			.then(() => this.dispatch(request.method, request.params))
			.finally(() => {
				setTimeout(() => this.#requests.delete(request.id), 30_000);
			});
		this.#requests.set(request.id, result);
		return result;
	}

	private async dispatch(method: string, rawParams: unknown): Promise<unknown> {
		switch (method) {
			case 'service.status':
				return this.status();
			case 'auth.status':
				return this.status();
			case 'auth.login': {
				const params = rawParams === undefined ? {} : requireObject(rawParams);
				try {
					await this.firebase.login({
						email: optionalString(params.email, 'email') || process.env.TODO_AUTH_EMAIL,
						password: optionalString(params.password, 'password') || process.env.TODO_AUTH_PASSWORD
					} satisfies LoginParams);
				} catch (error) {
					firebaseError(error);
				}
				await this.startSynchronization();
				return this.status();
			}
			case 'auth.logout':
				return this.logout();
			case 'lists.query':
				this.requireReady();
				return this.#projection.listViews();
			case 'items.query':
				return this.queryItems(rawParams);
			case 'items.create':
				return this.createItem(rawParams);
			case 'items.complete':
				return this.completeItem(rawParams);
			case 'items.edit':
				return this.editItem(rawParams);
			case 'items.star':
				return this.starItem(rawParams);
			case 'items.due':
				return this.dueItem(rawParams);
			case 'config.setDefaultList': {
				this.requireReady();
				const params = requireObject(rawParams);
				const list = this.resolveWritableList(requiredString(params.list, 'list'));
				const user = this.firebase.user!;
				await this.config.setDefaultList(this.firebase.projectId, user.uid, list.id);
				return list;
			}
			default:
				throw new TodoServiceError('method_not_found', `Unknown service method: ${method}`);
		}
	}

	status(): ServiceStatus {
		const user = this.firebase.user;
		return {
			phase: this.#phase,
			projectId: this.firebase.projectId,
			...(user ? { uid: user.uid, email: user.email || undefined } : {}),
			listCount: this.#projection.listViews().length,
			itemCount: this.#projection.itemCount(),
			...(this.#message ? { message: this.#message } : {})
		};
	}

	private async startSynchronization() {
		const user = this.firebase.user;
		if (!user) throw new TodoServiceError('authentication', 'Sign in with `todo auth login`');
		await this.#synchronizer?.stop();
		this.#phase = 'hydrating';
		this.#message = undefined;
		const snapshot = this.#snapshotEnabled
			? await this.snapshots.load(this.firebase.projectId, user.uid)
			: undefined;
		this.#projection.reset(snapshot?.projection);
		this.#cursors = snapshot?.cursors || { lists: {} };
		this.#synchronizer = new FirestoreSynchronizer(
			this.firebase,
			this.#projection,
			this.#cursors,
			() => this.scheduleSnapshot(),
			(error) => this.synchronizationFailed(error)
		);
		try {
			await this.#synchronizer.start(user.uid);
			this.#phase = 'ready';
			if (this.#snapshotEnabled) await this.snapshots.flush(this.snapshotData());
		} catch (error) {
			this.#phase = 'error';
			this.#message = (error as Error).message;
			await this.#synchronizer.stop().catch(() => undefined);
			firebaseError(error);
		}
	}

	private synchronizationFailed(error: unknown) {
		const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
		this.#phase = code.includes('unavailable') ? 'offline' : 'error';
		this.#message = (error as Error).message;
	}

	private snapshotData(): SnapshotData {
		const user = this.firebase.user;
		if (!user) throw new TodoServiceError('authentication', 'Cannot snapshot signed-out state');
		return {
			version: SNAPSHOT_VERSION,
			projectId: this.firebase.projectId,
			uid: user.uid,
			createdAt: new Date().toISOString(),
			projection: this.#projection.snapshot(),
			cursors: structuredClone(this.#cursors)
		};
	}

	private scheduleSnapshot() {
		if (this.#snapshotEnabled && this.firebase.user && this.#phase === 'ready') {
			this.snapshots.schedule(() => this.snapshotData());
		}
	}

	private requireReady() {
		if (this.#phase === 'needs-auth') {
			throw new TodoServiceError('authentication', 'Sign in with `todo auth login`');
		}
		if (this.#phase === 'offline') {
			throw new TodoServiceError('offline', this.#message || 'Todo service is offline');
		}
		if (this.#phase === 'error') {
			throw new TodoServiceError('runtime_error', this.#message || 'Todo service failed');
		}
		if (this.#phase !== 'ready') {
			throw new TodoServiceError('not_ready', `Todo service is ${this.#phase}`);
		}
	}

	private async listReference(params: Record<string, unknown>) {
		const requested = optionalString(params.list, 'list');
		if (requested) return requested;
		const user = this.firebase.user!;
		const defaultList = await this.config.defaultList(this.firebase.projectId, user.uid);
		if (defaultList) return defaultList;
		throw new TodoServiceError('usage', '--list is required until a default list is configured');
	}

	private resolveWritableList(reference: string) {
		const list = this.#projection.resolveList(reference);
		if (list.type !== 'list') {
			throw new TodoServiceError(
				'usage',
				`Items cannot be written directly to label “${list.name}”`
			);
		}
		return list;
	}

	private async queryItems(rawParams: unknown) {
		this.requireReady();
		const params = rawParams === undefined ? {} : requireObject(rawParams);
		const reference = optionalString(params.list, 'list');
		const list = reference ? this.#projection.resolveList(reference) : undefined;
		if (list?.type === 'label') {
			throw new TodoServiceError('usage', 'Direct label queries are not implemented yet');
		}
		const completed = optionalString(params.state, 'state') || 'active';
		if (!['active', 'completed', 'all'].includes(completed)) {
			throw new TodoServiceError('usage', 'state must be active, completed, or all');
		}
		return this.#projection
			.itemViews(list)
			.filter((item) => completed === 'all' || item.completed === (completed === 'completed'));
	}

	private async createItem(rawParams: unknown) {
		this.requireReady();
		const params = requireObject(rawParams);
		const list = this.resolveWritableList(await this.listReference(params));
		const description = requiredString(params.description, 'description');
		const itemId = crypto.randomUUID();
		await this.writeAction(list.id, create_item({ list_id: list.id, id: itemId, description }));
		return this.#projection.resolveItem(list, itemId);
	}

	private async completeItem(rawParams: unknown) {
		this.requireReady();
		const params = requireObject(rawParams);
		const list = this.resolveWritableList(await this.listReference(params));
		const item = this.#projection.resolveItem(list, requiredString(params.item, 'item'));
		const completed = boolean(params.completed, 'completed', true);
		await this.writeAction(
			list.id,
			complete_item({
				list_id: list.id,
				id: item.id,
				completed,
				completed_time: Date.now(),
				description: item.description
			})
		);
		return this.#projection.resolveItem(list, item.id);
	}

	private async editItem(rawParams: unknown) {
		this.requireReady();
		const params = requireObject(rawParams);
		const list = this.resolveWritableList(await this.listReference(params));
		const item = this.#projection.resolveItem(list, requiredString(params.item, 'item'));
		const description = requiredString(params.description, 'description');
		await this.writeAction(
			list.id,
			describe_item({
				list_id: list.id,
				id: item.id,
				orig_description: item.description,
				description
			})
		);
		return this.#projection.resolveItem(list, item.id);
	}

	private async starItem(rawParams: unknown) {
		this.requireReady();
		const params = requireObject(rawParams);
		const list = this.resolveWritableList(await this.listReference(params));
		const item = this.#projection.resolveItem(list, requiredString(params.item, 'item'));
		const starred = boolean(params.starred, 'starred', true);
		await this.writeAction(
			list.id,
			star_item({
				list_id: list.id,
				id: item.id,
				starred,
				star_timestamp: Date.now()
			})
		);
		return this.#projection.resolveItem(list, item.id);
	}

	private async dueItem(rawParams: unknown) {
		this.requireReady();
		const params = requireObject(rawParams);
		const list = this.resolveWritableList(await this.listReference(params));
		const item = this.#projection.resolveItem(list, requiredString(params.item, 'item'));
		const date = optionalString(params.date, 'date');
		let action: AnyAction;
		if (!date) {
			action = remove_due_date({ list_id: list.id, id: item.id });
		} else {
			const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
			if (!match) throw new TodoServiceError('usage', 'date must use YYYY-MM-DD');
			const year = Number(match[1]);
			const month = Number(match[2]);
			const day = Number(match[3]);
			const parsed = new Date(year, month - 1, day);
			if (
				parsed.getFullYear() !== year ||
				parsed.getMonth() !== month - 1 ||
				parsed.getDate() !== day
			) {
				throw new TodoServiceError('usage', 'date is not a valid calendar date');
			}
			action = set_due_date({ list_id: list.id, id: item.id, due_date: { year, month, day } });
		}
		await this.writeAction(list.id, action);
		return this.#projection.resolveItem(list, item.id);
	}

	private async writeAction(listId: string, action: AnyAction) {
		const synchronizer = this.#synchronizer;
		if (!synchronizer) throw new TodoServiceError('not_ready', 'Todo service is not synchronized');
		const actionId = crypto.randomUUID();
		const observed = synchronizer.waitForAction(actionId);
		try {
			await this.firebase.appendListAction(listId, actionId, action);
			await observed;
		} catch (error) {
			void observed.catch(() => undefined);
			firebaseError(error);
		}
	}

	private async logout() {
		const user = this.firebase.user;
		await this.#synchronizer?.stop();
		this.#synchronizer = undefined;
		if (user) await this.snapshots.remove(this.firebase.projectId, user.uid);
		await this.firebase.logout();
		this.#projection.reset();
		this.#cursors = { lists: {} };
		this.#phase = 'needs-auth';
		this.#message = undefined;
		return { signedOut: true };
	}

	async stop() {
		await this.#synchronizer?.stop();
		if (
			this.#snapshotEnabled &&
			this.#synchronizer &&
			this.firebase.user &&
			this.#phase === 'ready'
		) {
			await this.snapshots.flush(this.snapshotData());
		}
	}
}
