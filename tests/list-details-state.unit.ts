import { describe, it, expect } from 'vitest';
import { changedSelections, sharingStatus } from '$lib/components/list-details-state';
import {
	initialState,
	requests,
	outgoing_request,
	accept_request,
	reject_request
} from '$lib/components/requests';
import { accept_pending_share, revoke_share } from '$lib/components/lists';

describe('sharing relationship history', () => {
	it('distinguishes invitation, acceptance, removal pending and removal completion', () => {
		let state = requests(
			initialState,
			outgoing_request({ id: 'invite', uid: 'person', action: accept_pending_share('list') })
		);
		expect(sharingStatus(state, 'list', 'person')).toBe('invitation');
		expect(sharingStatus(state, 'other-list', 'person')).toBe('available');
		expect(sharingStatus(state, 'list', 'other-person')).toBe('available');
		state = requests(state, accept_request({ id: 'invite' }));
		expect(sharingStatus(state, 'list', 'person')).toBe('shared');
		state = requests(
			state,
			outgoing_request({ id: 'remove', uid: 'person', action: revoke_share({ id: 'list' }) })
		);
		expect(sharingStatus(state, 'list', 'person')).toBe('removal');
		state = requests(state, accept_request({ id: 'remove' }));
		expect(sharingStatus(state, 'list', 'person')).toBe('available');
	});
	it('allows retrying a declined invitation and preserves sharing after rejected removal', () => {
		let state = requests(
			initialState,
			outgoing_request({ id: 'invite', uid: 'person', action: accept_pending_share('list') })
		);
		state = requests(state, reject_request({ id: 'invite' }));
		expect(sharingStatus(state, 'list', 'person')).toBe('rejected');
		state = requests(
			state,
			outgoing_request({ id: 'invite2', uid: 'person', action: accept_pending_share('list') })
		);
		expect(sharingStatus(state, 'list', 'person')).toBe('invitation');
		state = requests(state, accept_request({ id: 'invite2' }));
		state = requests(
			state,
			outgoing_request({ id: 'remove', uid: 'person', action: revoke_share({ id: 'list' }) })
		);
		state = requests(state, reject_request({ id: 'remove' }));
		expect(sharingStatus(state, 'list', 'person')).toBe('shared');
	});
	it('does not submit unchanged or toggled-back selections', () => {
		expect(changedSelections({ a: true, b: false }, { a: true, b: false, c: false })).toEqual([]);
		expect(changedSelections({ a: true, b: false }, { a: false, b: true })).toEqual(['a', 'b']);
	});
});
