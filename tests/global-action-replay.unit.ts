import { expect } from 'chai';
import { describe, it } from 'vitest';

import { shouldReplayGlobalAction } from '$lib/global-action-replay';

describe('global action cache replay', () => {
	it('replays actions newer than the cache boundary', () => {
		expect(
			shouldReplayGlobalAction({ type: 'create_list', timestamp: { seconds: 101 } }, 100)
		).to.equal(true);
		expect(
			shouldReplayGlobalAction({ type: 'create_list', timestamp: { seconds: 100 } }, 100)
		).to.equal(false);
	});

	it('always replays idempotent pin history to resolve cached pin state', () => {
		expect(
			shouldReplayGlobalAction({ type: 'pin_label', timestamp: { seconds: 1 } }, 100)
		).to.equal(true);
		expect(
			shouldReplayGlobalAction({ type: 'unpin_label', timestamp: { seconds: 2 } }, 100)
		).to.equal(true);
	});
});
