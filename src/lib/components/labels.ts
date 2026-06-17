import { createReducer } from '$lib/redux';
import { createAction } from '@reduxjs/toolkit';
import { signed_in, signed_out } from './auth';
import type { ListsState } from './lists';

export type LabelQuery = OrQuery | IdPredicate;

export interface OrQuery {
	type: 'or';
	predicates: LabelQuery[];
}

export interface IdPredicate {
	type: 'id';
	id: string;
}

export interface LabelState {
	query: LabelQuery;
}

export interface LabelsState {
	labelIdToLabel: { [labelId: string]: LabelState };
}

export interface ResolvedLabelEntry {
	id: string;
	name: string;
	inaccessible: boolean;
}

export const emptyLabelQuery: OrQuery = {
	type: 'or',
	predicates: []
};

export const set_label_query = createAction<{ label_id: string; query: LabelQuery }>(
	'set_label_query'
);
export const add_label_predicate = createAction<{ label_id: string; predicate: LabelQuery }>(
	'add_label_predicate'
);
export const remove_label_predicate = createAction<{ label_id: string; predicate: LabelQuery }>(
	'remove_label_predicate'
);

export const initialState = {
	labelIdToLabel: {}
} as LabelsState;

function sameQuery(a: LabelQuery, b: LabelQuery): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

function queryWithoutPredicate(query: LabelQuery, predicate: LabelQuery): LabelQuery {
	if (query.type === 'or') {
		return {
			type: 'or',
			predicates: query.predicates.filter((p) => !sameQuery(p, predicate))
		};
	}
	return sameQuery(query, predicate) ? { ...emptyLabelQuery } : query;
}

function queryWithPredicate(query: LabelQuery, predicate: LabelQuery): LabelQuery {
	const orQuery = query.type === 'or' ? query : ({ type: 'or', predicates: [query] } as OrQuery);
	if (orQuery.predicates.some((p) => sameQuery(p, predicate))) {
		return orQuery;
	}
	return {
		type: 'or',
		predicates: [...orQuery.predicates, predicate]
	};
}

export function setQueryIdMembership(
	query: LabelQuery | undefined,
	id: string,
	selected: boolean
): LabelQuery {
	const predicate = { type: 'id' as const, id };
	return selected
		? queryWithPredicate(query || emptyLabelQuery, predicate)
		: queryWithoutPredicate(query || emptyLabelQuery, predicate);
}

export function queryHasId(query: LabelQuery | undefined, id: string): boolean {
	if (!query) {
		return false;
	}
	if (query.type === 'id') {
		return query.id === id;
	}
	return query.predicates.some((predicate) => queryHasId(predicate, id));
}

function inaccessibleEntry(id: string, lists: ListsState): ResolvedLabelEntry {
	const lastKnownInfo = lists.listIdToLastKnownInfo[id];
	const suffix = lastKnownInfo?.name
		? ` - ${lastKnownInfo.name}${lastKnownInfo.ownerEmail ? ` (${lastKnownInfo.ownerEmail})` : ''}`
		: '';
	return {
		id,
		name: `Inaccessible List${suffix}`,
		inaccessible: true
	};
}

export function resolveLabelQuery(
	query: LabelQuery | undefined,
	lists: ListsState,
	labels: LabelsState,
	seen: string[] = []
): ResolvedLabelEntry[] {
	if (!query) {
		return [];
	}
	if (query.type === 'or') {
		const resolved: ResolvedLabelEntry[] = [];
		query.predicates.forEach((predicate) => {
			resolveLabelQuery(predicate, lists, labels, seen).forEach((entry) => {
				if (!resolved.some((existing) => existing.id === entry.id)) {
					resolved.push(entry);
				}
			});
		});
		return resolved;
	}
	const id = query.id;
	if (seen.indexOf(id) !== -1) {
		return [
			{
				id,
				name: 'Label cycle',
				inaccessible: true
			}
		];
	}
	if (lists.visibleLists.indexOf(id) === -1) {
		return [inaccessibleEntry(id, lists)];
	}
	if (lists.listIdToType[id] === 'label') {
		return resolveLabelQuery(labels.labelIdToLabel[id]?.query, lists, labels, [...seen, id]);
	}
	return [
		{
			id,
			name: lists.listIdToList[id] || lists.listIdToLastKnownInfo[id]?.name || 'Untitled List',
			inaccessible: false
		}
	];
}

export const labels = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(set_label_query, (state, action) => {
		state = { ...state };
		state.labelIdToLabel = { ...state.labelIdToLabel };
		state.labelIdToLabel[action.payload.label_id] = {
			query: action.payload.query
		};
		return state;
	});
	r.addCase(add_label_predicate, (state, action) => {
		state = { ...state };
		const label = state.labelIdToLabel[action.payload.label_id] || { query: emptyLabelQuery };
		state.labelIdToLabel = { ...state.labelIdToLabel };
		state.labelIdToLabel[action.payload.label_id] = {
			query: queryWithPredicate(label.query, action.payload.predicate)
		};
		return state;
	});
	r.addCase(remove_label_predicate, (state, action) => {
		state = { ...state };
		const label = state.labelIdToLabel[action.payload.label_id] || { query: emptyLabelQuery };
		state.labelIdToLabel = { ...state.labelIdToLabel };
		state.labelIdToLabel[action.payload.label_id] = {
			query: queryWithoutPredicate(label.query, action.payload.predicate)
		};
		return state;
	});
	r.addDefault((state, action) => {
		if (action.type === 'CACHE_LOADED@INIT') {
			return action.payload.labels;
		}
		return state;
	});
});
