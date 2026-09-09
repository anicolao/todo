import type { ResolvedLabelEntry } from './labels';
import type { ListsState } from './lists';

export type LabelEntriesById = { [labelId: string]: ResolvedLabelEntry[] };

export function orderDirectLabelEntries(
	entries: ResolvedLabelEntry[],
	directMemberIds: string[]
): ResolvedLabelEntry[] {
	if (directMemberIds.length < 2) {
		return entries;
	}
	const directMemberIdSet = new Set(directMemberIds);
	const directEntriesById = new Map(
		entries.filter((entry) => directMemberIdSet.has(entry.id)).map((entry) => [entry.id, entry])
	);
	if (
		directEntriesById.size !== directMemberIds.length ||
		new Set(directMemberIds).size !== directMemberIds.length
	) {
		return entries;
	}
	let nextDirectMember = 0;
	return entries.map((entry) =>
		directMemberIdSet.has(entry.id)
			? directEntriesById.get(directMemberIds[nextDirectMember++]) || entry
			: entry
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
