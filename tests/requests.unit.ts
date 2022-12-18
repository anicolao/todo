import { expect } from 'chai';
import { describe, it } from 'vitest';

import {
	accept_request,
	incoming_request,
	initialState,
	outgoing_request,
	requests
} from '$lib/components/requests';

describe('requests', () => {
	it('can take note of an outgoing request', () => {
		const state = requests(
			initialState,
			outgoing_request({ id: 'abc', uid: 'user0', action: { type: 'pendingRA' } })
		);
		expect(state.outgoingRequests.length).to.equal(1);
		expect(state.outgoingRequests[0]).to.equal('abc');
		expect(state.requestIdToRequest['abc'].type).to.equal('pendingRA');
		expect(state.requestIdToUid['abc']).to.equal('user0');
		expect(state.incomingRequests.length).to.equal(0);
		expect(state.completedRequests.length).to.equal(0);
	});

	it('can take note of an incoming request', () => {
		const state = requests(
			initialState,
			incoming_request({ id: 'abc', uid: 'user0', action: { type: 'pendingRA' } })
		);
		expect(state.incomingRequests.length).to.equal(1);
		expect(state.incomingRequests[0]).to.equal('abc');
		expect(state.requestIdToRequest['abc'].type).to.equal('pendingRA');
		expect(state.requestIdToUid['abc']).to.equal('user0');
		expect(state.outgoingRequests.length).to.equal(0);
		expect(state.completedRequests.length).to.equal(0);
	});

	it('can accept an outgoing request', () => {
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
		expect(state.incomingRequests.length).to.equal(0);
		expect(state.completedRequests.length).to.equal(1);
		expect(state.completedRequests[0]).to.equal('abc');
	});

	it('can accept an incoming request', () => {
		let state = requests(
			initialState,
			incoming_request({ id: 'abc', uid: 'user0', action: { type: 'pendingRA' } })
		);
		expect(state.incomingRequests.length).to.equal(1);
		expect(state.completedRequests.length).to.equal(0);
		expect(state.incomingRequests[0]).to.equal('abc');
		expect(state.requestIdToRequest['abc'].type).to.equal('pendingRA');
		state = requests(state, accept_request({ id: 'abc' }));
		expect(state.outgoingRequests.length).to.equal(0);
		expect(state.incomingRequests.length).to.equal(0);
		expect(state.completedRequests.length).to.equal(1);
		expect(state.completedRequests[0]).to.equal('abc');
	});

	it('automatically completes an accept_request ack.', () => {
		let state = requests(
			initialState,
			outgoing_request({ id: 'abc', uid: 'user0', action: { type: 'accept_request' } })
		);
		expect(state.outgoingRequests.length).to.equal(0);
		expect(state.incomingRequests.length).to.equal(0);
		expect(state.completedRequests.length).to.equal(1);
		expect(state.completedRequests[0]).to.equal('abc');
		expect(state.requestIdToRequest['abc'].type).to.equal('accept_request');
	});
});
