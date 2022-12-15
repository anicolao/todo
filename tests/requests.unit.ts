import { expect } from 'chai';
import { describe, it } from 'vitest';

import { accept_request, initialState, outgoing_request, requests } from '$lib/components/requests';

describe('requests', () => {
	it('can take note of a pending request action', () => {
		const state = requests(
			initialState,
			outgoing_request({ id: 'abc', uid: 'user0', action: { type: 'pendingRA' } })
		);
		expect(state.outgoingRequests.length).to.equal(1);
		expect(state.outgoingRequests[0]).to.equal('abc');
		expect(state.requestIdToRequest['abc'].type).to.equal('pendingRA');
		expect(state.requestIdToUid['abc']).to.equal('user0');
	});

	it('can accept a pending request action', () => {
		let state = requests(
			initialState,
			outgoing_request({ id: 'abc', uid: 'user0', action: { type: 'pendingRA' } })
		);
		expect(state.outgoingRequests.length).to.equal(1);
		expect(state.completedRequests.length).to.equal(0);
		expect(state.outgoingRequests[0]).to.equal('abc');
		expect(state.requestIdToRequest['abc'].type).to.equal('pendingRA');
		state = requests(state, accept_request({ id: 'abc' }));
		expect(state.outgoingRequests.length).to.equal(0);
		expect(state.completedRequests.length).to.equal(1);
		expect(state.completedRequests[0]).to.equal('abc');
	});
});
