import type { ResolvedLabelEntry } from './labels';
import type { ListsState } from './lists';

export type LabelEntriesById = { [labelId: string]: ResolvedLabelEntry[] };

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
	routeExpandedLabelIds: Set<string>,
	unpinPreservedLabelIds: string[]
) {
	return new Set([...pinnedLabelIds, ...routeExpandedLabelIds, ...unpinPreservedLabelIds]);
}
