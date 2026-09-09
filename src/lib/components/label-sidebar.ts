import {
	resolveLabelQuery,
	type LabelQuery,
	type LabelsState,
	type ResolvedLabelEntry
} from './labels';
import type { ListsState } from './lists';

export type LabelEntriesById = { [labelId: string]: ResolvedLabelEntry[] };

export interface LabelPredicateGroup {
	predicate: LabelQuery;
	entries: ResolvedLabelEntry[];
}

export function buildLabelPredicateGroups(
	labelId: string,
	predicates: LabelQuery[],
	lists: ListsState,
	labels: LabelsState
): LabelPredicateGroup[] {
	const includedIds = new Set<string>();
	return predicates
		.map((predicate) => {
			const entries = resolveLabelQuery(predicate, lists, labels, [labelId]).filter((entry) => {
				if (entry.inaccessible || includedIds.has(entry.id)) return false;
				includedIds.add(entry.id);
				return true;
			});
			return { predicate, entries };
		})
		.filter((group) => group.entries.length > 0);
}

export function mergeVisiblePredicateOrder(
	predicates: LabelQuery[],
	orderedVisiblePredicates: LabelQuery[]
): LabelQuery[] {
	const visiblePredicateSet = new Set(orderedVisiblePredicates);
	if (
		visiblePredicateSet.size !== orderedVisiblePredicates.length ||
		orderedVisiblePredicates.some((predicate) => !predicates.includes(predicate))
	) {
		return predicates;
	}
	let nextVisiblePredicate = 0;
	return predicates.map((predicate) =>
		visiblePredicateSet.has(predicate)
			? orderedVisiblePredicates[nextVisiblePredicate++]
			: predicate
	);
}

export function findContainingLabelIds(
	listId: string,
	lists: ListsState,
	labelEntriesById: LabelEntriesById
) {
	return lists.visibleLists.filter(
		(candidateId) =>
			lists.listIdToType[candidateId] === 'label' &&
			labelEntriesById[candidateId]?.some((entry) => entry.id === listId)
	);
}

export function buildRouteExpandedLabelIds(
	pathname: string,
	pageLabelId: string,
	pageListId: string,
	viaLabelId: string,
	lists: ListsState,
	labelEntriesById: LabelEntriesById
) {
	if (
		pathname === '/labels' &&
		pageLabelId &&
		lists.visibleLists.includes(pageLabelId) &&
		lists.listIdToType[pageLabelId] === 'label'
	) {
		return new Set([pageLabelId]);
	}

	if (pathname !== '/lists' || !pageListId) {
		return new Set<string>();
	}

	const containingLabelIds = findContainingLabelIds(pageListId, lists, labelEntriesById);
	if (viaLabelId && containingLabelIds.includes(viaLabelId)) {
		return new Set([viaLabelId]);
	}
	return new Set(containingLabelIds);
}

export function buildExpandedLabelIds(
	pinnedLabelIds: string[],
	routeExpandedLabelIds: Set<string>
) {
	return new Set([...pinnedLabelIds, ...routeExpandedLabelIds]);
}
