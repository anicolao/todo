export function shouldReplayGlobalAction(
	action: { type?: string; timestamp?: { seconds?: number } },
	cacheTimestamp: number
) {
	if (action.type === 'pin_label' || action.type === 'unpin_label') {
		return true;
	}
	return (action.timestamp?.seconds || 0) > cacheTimestamp;
}
