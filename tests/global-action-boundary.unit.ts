import { expect, it } from 'vitest';
import { cache, initialCacheState } from '$lib/components/cache';
import { shouldReplayGlobalAction } from '$lib/global-action-replay';
it('replays new requests in the same second without replaying already cached requests', () => {
	const state = cache(initialCacheState, {
		type: 'create_list',
		timestamp: 123,
		isANormalAction: false,
		firebase_doc_id: 'one'
	});
	const next = cache(state, {
		type: 'outgoing_request',
		timestamp: 123,
		isANormalAction: false,
		firebase_doc_id: 'two'
	});
	expect(next.boundaryActionIds).toEqual(['one', 'two']);
	expect(
		shouldReplayGlobalAction(
			{ type: 'create_list', timestamp: { seconds: 123 } },
			123,
			'one',
			next.boundaryActionIds
		)
	).toBe(false);
	expect(
		shouldReplayGlobalAction(
			{ type: 'create_list', timestamp: { seconds: 123 } },
			123,
			'three',
			next.boundaryActionIds
		)
	).toBe(true);
	const newer = cache(next, {
		type: 'create_label',
		timestamp: 124,
		isANormalAction: false,
		firebase_doc_id: 'four'
	});
	expect(newer.boundaryActionIds).toEqual(['four']);
});
