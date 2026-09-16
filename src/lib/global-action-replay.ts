export function shouldReplayGlobalAction(
	action: { type?: string; timestamp?: { seconds?: number } },
	cacheTimestamp: number,
	id?: string,
	boundaryIds?: readonly string[]
) {
	if (action.type === 'pin_label' || action.type === 'unpin_label') {
		return true;
	}
	const second = action.timestamp?.seconds || 0;
	return (
		second > cacheTimestamp ||
		(second === cacheTimestamp && !!id && !!boundaryIds && !boundaryIds.includes(id))
	);
}
