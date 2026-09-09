import { expect } from 'chai';
import { describe, it } from 'vitest';

import { requireGoogleIdToken } from '$lib/auth/google';

describe('native Google sign-in', () => {
	it('returns the native ID token used by Firebase JS auth', () => {
		expect(requireGoogleIdToken({ credential: { idToken: '  google-id-token  ' } })).to.equal(
			'google-id-token'
		);
	});

	it('fails with a configuration diagnostic when iOS returns no ID token', () => {
		expect(() => requireGoogleIdToken({ credential: null })).to.throw(
			'Verify the iOS Firebase client configuration'
		);
	});
});
