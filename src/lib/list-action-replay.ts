/** A seconds-only cursor cannot distinguish multiple edits in the same second. */
export function shouldReplayListAction(
	id: string,
	timestamp: { seconds: number } | null | undefined | 0,
	cachedSecond: number,
	boundaryIds: readonly string[] = []
) {
	if (!timestamp) return true;
	return (
		timestamp.seconds > cachedSecond ||
		(timestamp.seconds === cachedSecond && !boundaryIds.includes(id))
	);
}
