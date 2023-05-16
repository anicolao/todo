import { expect } from 'chai';
import { describe, it } from 'vitest';

import { cache, set_timestamp, initialCacheState } from '$lib/components/cache';

describe('cache', () => {
	it('sets timestamp', () => {
		const time = 7654;
		let nextState = initialCacheState;
		expect(nextState.timestamp).to.equal(0);

		nextState = cache(nextState, set_timestamp(time));
		expect(nextState.timestamp).to.equal(time);
	});
});
