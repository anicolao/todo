import type { ItemsState } from '$lib/components/items';
import type { LabelsState } from '$lib/components/labels';
import type { ListsState } from '$lib/components/lists';
import type { RequestsState } from '$lib/components/requests';

export const PROTOCOL_VERSION = 1;
export const SERVICE_VERSION = 2;
export const SNAPSHOT_VERSION = 2;

export type ServicePhase = 'starting' | 'needs-auth' | 'hydrating' | 'ready' | 'offline' | 'error';

export interface RpcRequest {
	protocol: number;
	id: string;
	method: string;
	params?: unknown;
}

export interface RpcErrorValue {
	code: string;
	message: string;
	details?: unknown;
}

export type RpcResponse =
	| { protocol: number; id: string; result: unknown }
	| { protocol: number; id: string; error: RpcErrorValue };

export interface ProjectionState {
	lists: ListsState;
	items: ItemsState;
	labels: LabelsState;
	requests: RequestsState;
}

export interface StreamCursor {
	seconds: number;
	nanoseconds: number;
	documentIds: string[];
}

export interface CursorState {
	global?: StreamCursor;
	lists: Record<string, StreamCursor>;
}

export interface SnapshotData {
	version: number;
	projectId: string;
	uid: string;
	createdAt: string;
	projection: ProjectionState;
	cursors: CursorState;
}

export interface ServiceStatus {
	serviceVersion: number;
	phase: ServicePhase;
	projectId: string;
	uid?: string;
	email?: string;
	listCount: number;
	itemCount: number;
	message?: string;
}

export interface ListView {
	id: string;
	name: string;
	type: 'list' | 'label';
}

export interface ItemView {
	id: string;
	listId: string;
	listName: string;
	description: string;
	completed: boolean;
	starred: boolean;
	starTimestamp: number;
	dueDate?: {
		year: number;
		month: number;
		day: number;
	};
}
