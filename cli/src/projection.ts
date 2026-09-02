import {
	initialState as initialItemsState,
	items,
	type ItemsState,
	type TodoItem
} from '$lib/components/items';
import { initialState as initialLabelsState, labels } from '$lib/components/labels';
import { initialState as initialListsState, lists } from '$lib/components/lists';
import {
	incoming_request,
	initialState as initialRequestsState,
	requests
} from '$lib/components/requests';
import type { AnyAction } from '@reduxjs/toolkit';
import type { ItemView, ListView, ProjectionState } from './types';
import { TodoServiceError } from './errors';

export interface ListDispatchResult {
	applied: boolean;
	missingItemIds: string[];
}

const ITEM_ACTIONS = new Set([
	'describe_item',
	'complete_item',
	'uncomplete_item',
	'complete_forever',
	'star_item',
	'reorder_item',
	'set_due_date',
	'remove_due_date'
]);

function clone<T>(value: T): T {
	return structuredClone(value);
}

function freshState(): ProjectionState {
	return {
		lists: clone(initialListsState),
		items: clone(initialItemsState),
		labels: clone(initialLabelsState),
		requests: clone(initialRequestsState)
	};
}

export class Projection {
	#state: ProjectionState;

	constructor(state?: ProjectionState) {
		this.#state = state ? clone(state) : freshState();
	}

	reset(state?: ProjectionState) {
		this.#state = state ? clone(state) : freshState();
	}

	snapshot(): ProjectionState {
		return clone(this.#state);
	}

	dispatch(action: AnyAction) {
		this.#state = {
			lists: lists(this.#state.lists, action),
			items: items(this.#state.items, action),
			labels: labels(this.#state.labels, action),
			requests: requests(this.#state.requests, action)
		};
	}

	dispatchGlobal(action: AnyAction, uid: string, documentId: string, timestamp: number) {
		const serverAction: AnyAction & Record<string, unknown> = {
			...action,
			firebase_doc_id: documentId,
			isANormalAction: false,
			timestamp
		};
		if (
			serverAction.creator === uid ||
			serverAction.type === 'accept_request' ||
			serverAction.type === 'reject_request'
		) {
			this.dispatch(serverAction);
			return;
		}
		const { timestamp: _timestamp, ...pendingAction } = serverAction;
		this.dispatch(
			incoming_request({
				id: documentId,
				uid: String(serverAction.creator || ''),
				action: pendingAction
			})
		);
	}

	dispatchList(action: AnyAction, documentId: string, timestamp: number) {
		const missingItemIds = this.missingItemDependencies(action);
		if (missingItemIds.length > 0) return { applied: false, missingItemIds };
		this.dispatch({
			...action,
			firebase_doc_id: documentId,
			isANormalAction: true,
			timestamp
		});
		return { applied: true, missingItemIds: [] };
	}

	private missingItemDependencies(action: AnyAction) {
		if (!ITEM_ACTIONS.has(action.type)) return [];
		const payload = action.payload;
		if (!payload || typeof payload !== 'object') return [];
		const listId = typeof payload.list_id === 'string' ? payload.list_id : undefined;
		if (!listId) return [];
		const dependencies = [
			payload.id,
			action.type === 'reorder_item' ? payload.goes_before : undefined
		].filter((value): value is string => typeof value === 'string' && value.length > 0);
		return dependencies.filter((itemId) => !this.hasItem(listId, itemId));
	}

	private hasItem(listId: string, itemId: string) {
		return this.#state.items.listIdToListOfItems[listId]?.itemIdToItem[itemId] !== undefined;
	}

	visibleDocumentIds() {
		return [...this.#state.lists.visibleLists];
	}

	listViews(): ListView[] {
		return this.#state.lists.visibleLists.map((id) => ({
			id,
			name: this.#state.lists.listIdToList[id] || 'Untitled List',
			type: this.#state.lists.listIdToType[id] || 'list'
		}));
	}

	resolveList(value: string): ListView {
		const documents = this.listViews();
		const byId = documents.find((list) => list.id === value);
		if (byId) return byId;
		const byName = documents.filter((list) => list.name === value);
		if (byName.length === 1) return byName[0];
		if (byName.length > 1) {
			throw new TodoServiceError(
				'ambiguous',
				`More than one list is named “${value}”`,
				byName.map(({ id, name }) => ({ id, name }))
			);
		}
		throw new TodoServiceError('not_found', `List not found: ${value}`);
	}

	itemViews(list?: ListView): ItemView[] {
		const listsToRead = list
			? [list]
			: this.listViews().filter((candidate) => candidate.type === 'list');
		return listsToRead.flatMap((candidate) => {
			const value = this.#state.items.listIdToListOfItems[candidate.id];
			if (!value) return [];
			return value.itemIds.flatMap((id) => {
				const item = value.itemIdToItem[id];
				return item ? [this.toItemView(candidate, id, item)] : [];
			});
		});
	}

	resolveItem(list: ListView, value: string): ItemView {
		const matches = this.itemViews(list).filter(
			(item) => item.id === value || item.id.startsWith(value)
		);
		if (matches.length === 1) return matches[0];
		if (matches.length > 1) {
			throw new TodoServiceError(
				'ambiguous',
				`Item ID prefix is ambiguous: ${value}`,
				matches.map(({ id, description }) => ({ id, description }))
			);
		}
		throw new TodoServiceError('not_found', `Item not found: ${value}`);
	}

	itemCount() {
		return Object.values(this.#state.items.listIdToListOfItems).reduce(
			(total, list) => total + list.itemIds.length,
			0
		);
	}

	private toItemView(list: ListView, id: string, item: TodoItem): ItemView {
		return {
			id,
			listId: list.id,
			listName: list.name,
			description: item.description,
			completed: item.completed,
			starred: item.starred,
			starTimestamp: item.starTimestamp,
			...(item.dueDate
				? {
						dueDate: {
							year: item.dueDate.year,
							month: item.dueDate.month,
							day: item.dueDate.day
						}
				  }
				: {})
		};
	}
}

export function itemStateForList(state: ItemsState, listId: string) {
	return state.listIdToListOfItems[listId];
}
