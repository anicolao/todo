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

export type LabelVisibility = 'visible' | 'hidden' | 'fully_hidden';

export interface LabelState {
	query: LabelQuery;
	visibility: LabelVisibility;
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
export const set_label_visibility = createAction<{
	label_id: string;
	visibility: LabelVisibility;
}>('set_label_visibility');

export const initialState = {
	labelIdToLabel: {}
} as LabelsState;

function sameQuery(a: LabelQuery, b: LabelQuery): boolean {
	if (a.type !== b.type) {
		return false;
	}
	if (a.type === 'id' && b.type === 'id') {
		return a.id === b.id;
	}
	if (a.type === 'or' && b.type === 'or') {
		if (a.predicates.length !== b.predicates.length) {
			return false;
		}
		const remaining = [...b.predicates];
		return a.predicates.every((predicate) => {
			const index = remaining.findIndex((candidate) => sameQuery(predicate, candidate));
			if (index === -1) {
				return false;
			}
			remaining.splice(index, 1);
			return true;
		});
	}
	return false;
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

export function queryHasId(query: LabelQuery | undefined, id: string): boolean {
	if (!query) {
		return false;
	}
	if (query.type === 'id') {
		return query.id === id;
	}
	return query.predicates.some((predicate) => queryHasId(predicate, id));
}

export function getLabelVisibility(label: LabelState | undefined): LabelVisibility {
	return label?.visibility || 'visible';
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

export function selectExcludedSearchListIds(
	lists: ListsState,
	labels: LabelsState,
	bypassLabelId?: string
): Set<string> {
	const excluded = new Set<string>();
	lists.visibleLists.forEach((labelId) => {
		if (
			labelId === bypassLabelId ||
			lists.listIdToType[labelId] !== 'label' ||
			getLabelVisibility(labels.labelIdToLabel[labelId]) === 'visible'
		) {
			return;
		}
		resolveLabelQuery(labels.labelIdToLabel[labelId]?.query, lists, labels, [labelId]).forEach(
			(entry) => {
				if (!entry.inaccessible && lists.listIdToType[entry.id] === 'list') {
					excluded.add(entry.id);
				}
			}
		);
	});
	return excluded;
}

export function selectSearchableListIds(
	lists: ListsState,
	labels: LabelsState,
	bypassLabelId?: string
): string[] {
	const excluded = selectExcludedSearchListIds(lists, labels, bypassLabelId);
	return lists.visibleLists.filter((id) => lists.listIdToType[id] === 'list' && !excluded.has(id));
}

export function resolveSearchableLabelQuery(
	labelId: string,
	lists: ListsState,
	labels: LabelsState
): ResolvedLabelEntry[] {
	const excluded = selectExcludedSearchListIds(lists, labels, labelId);
	return resolveLabelQuery(labels.labelIdToLabel[labelId]?.query, lists, labels, [labelId]).filter(
		(entry) => entry.inaccessible || !excluded.has(entry.id)
	);
}

export const labels = createReducer(initialState, (r) => {
	r.addCase(signed_in, () => initialState);
	r.addCase(signed_out, () => initialState);
	r.addCase(set_label_query, (state, action) => {
		state = { ...state };
		const label = state.labelIdToLabel[action.payload.label_id];
		state.labelIdToLabel = { ...state.labelIdToLabel };
		state.labelIdToLabel[action.payload.label_id] = {
			query: action.payload.query,
			visibility: getLabelVisibility(label)
		};
		return state;
	});
	r.addCase(add_label_predicate, (state, action) => {
		state = { ...state };
		const label = state.labelIdToLabel[action.payload.label_id];
		state.labelIdToLabel = { ...state.labelIdToLabel };
		state.labelIdToLabel[action.payload.label_id] = {
			query: queryWithPredicate(label?.query || emptyLabelQuery, action.payload.predicate),
			visibility: getLabelVisibility(label)
		};
		return state;
	});
	r.addCase(remove_label_predicate, (state, action) => {
		state = { ...state };
		const label = state.labelIdToLabel[action.payload.label_id];
		state.labelIdToLabel = { ...state.labelIdToLabel };
		state.labelIdToLabel[action.payload.label_id] = {
			query: queryWithoutPredicate(label?.query || emptyLabelQuery, action.payload.predicate),
			visibility: getLabelVisibility(label)
		};
		return state;
	});
	r.addCase(set_label_visibility, (state, action) => {
		if (
			!action.payload.label_id ||
			!(['visible', 'hidden', 'fully_hidden'] as unknown[]).includes(action.payload.visibility)
		) {
			return state;
		}
		const label = state.labelIdToLabel[action.payload.label_id];
		if (label?.visibility === action.payload.visibility) {
			return state;
		}
		return {
			...state,
			labelIdToLabel: {
				...state.labelIdToLabel,
				[action.payload.label_id]: {
					query: label?.query || emptyLabelQuery,
					visibility: action.payload.visibility
				}
			}
		};
	});
	r.addDefault((state, action) => {
		if (action.type === 'CACHE_LOADED@INIT') {
			return action.payload.labels;
		}
		return state;
	});
});
