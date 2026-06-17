import { expect } from 'chai';
import { describe, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION, isCompatibleCachedState } from '$lib/components/schema';

describe('schema', () => {
	it('rejects cached state without a schema version', () => {
		expect(isCompatibleCachedState({ cache: { timestamp: 1 } })).to.equal(false);
	});

	it('rejects cached state with a mismatched schema version', () => {
		expect(isCompatibleCachedState({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).to.equal(false);
	});

	it('accepts cached state with the current schema version', () => {
		expect(isCompatibleCachedState({ schemaVersion: CURRENT_SCHEMA_VERSION })).to.equal(true);
	});
});
