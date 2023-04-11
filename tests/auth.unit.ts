import { describe, it, expect } from 'vitest';

import { auth, waiting } from '$lib/components/auth';

describe('auth', () => {
	it('waiting message is initialized correctly', () => {
		const nextState = auth({}, waiting());
		expect(nextState.authMessage).to.equal('Waiting...');
		expect(nextState.signedIn).to.equal(false);
	});
});
