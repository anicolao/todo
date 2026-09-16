import type { RequestsState } from './requests';

export type SharingStatus = 'available' | 'shared' | 'invitation' | 'removal' | 'rejected';
/** The current account's relationship history, not a global permissions roster. */
export function sharingStatus(requests: RequestsState, listId: string, uid: string): SharingStatus {
	const matches = (id: string) => {
		const action = requests.requestIdToRequest[id];
		return (
			requests.requestIdToUid[id] === uid &&
			(action?.type === 'accept_pending_share' || action?.type === 'revoke_share') &&
			(action.payload === listId || action.payload?.id === listId)
		);
	};
	const pending = requests.outgoingRequests.filter(matches).at(-1);
	if (pending)
		return requests.requestIdToRequest[pending].type === 'revoke_share' ? 'removal' : 'invitation';
	const last = requests.completedRequests.filter(matches).at(-1);
	if (!last) return 'available';
	if (requests.requestIdToRequest[last].type === 'accept_pending_share')
		return requests.requestIdToAccepted[last] ? 'shared' : 'rejected';
	return requests.requestIdToAccepted[last] ? 'available' : 'shared';
}

export function changedSelections(
	initial: Record<string, boolean>,
	selected: Record<string, boolean>
) {
	return Object.keys(selected).filter((id) => selected[id] !== (initial[id] ?? false));
}
