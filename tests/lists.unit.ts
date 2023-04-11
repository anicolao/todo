import { describe, it, expect } from 'vitest';

import { signed_in, signed_out } from '$lib/components/auth';
import {
	accept_pending_share,
	create_list,
	delete_list,
	initialState,
	lists,
	rename_list,
	reorder_list,
	revoke_share,
	type ListsState
} from '$lib/components/lists';

describe('lists', () => {
	function createList(state: ListsState, id: string, name: string) {
		return lists(state, create_list({ id, name }));
	}
	it('can create a new list', () => {
		const id = 'abcd1234';
		const name = 'My List Creation Test';
		const nextState = createList(initialState, id, name);
		expect(nextState.visibleLists.length).to.equal(1);
		expect(nextState.visibleLists[0]).to.equal(id);
		expect(nextState.listIdToList).to.deep.include({ abcd1234: name });
	});

	it('can create a new list that is first', () => {
		let nextState = createList(initialState, 'id1', 'First List');
		nextState = createList(nextState, 'id2', 'Second List');
		expect(nextState.visibleLists.length).to.equal(2);
		expect(nextState.visibleLists[0]).to.equal('id1');
		expect(nextState.visibleLists[1]).to.equal('id2');
	});

	it('can rename a list and renaming does not move the list', () => {
		let nextState = createList(initialState, 'id1', 'First List');
		nextState = createList(nextState, 'id2', 'Second List');
		expect(nextState.visibleLists.indexOf('id1')).to.equal(0);
		expect(nextState.visibleLists.indexOf('id2')).to.equal(1);
		nextState = lists(nextState, rename_list({ id: 'id2', name: 'Should not move' }));
		expect(nextState.listIdToList['id2']).to.equal('Should not move');
		expect(nextState.visibleLists.indexOf('id2')).to.equal(1);
	});

	it('can delete a list', () => {
		let nextState = createList(initialState, 'id1', 'First List');
		expect(nextState.visibleLists.length).to.equal(1);
		expect(nextState.listIdToList['id1']).to.equal('First List');
		nextState = lists(nextState, delete_list('id1'));
		expect(nextState.visibleLists.length).to.equal(0);
		expect(nextState.listIdToList['id1']).to.equal(undefined);
	});

	it('accepts a share request', () => {
		const firstListId = 'id1';
		let nextState = createList(initialState, firstListId, 'First List');
		expect(nextState.visibleLists.length).to.equal(1);
		const newListId = 'abcdefg';
		nextState = lists(nextState, accept_pending_share(newListId));
		expect(nextState.visibleLists.length).to.equal(2);
		expect(nextState.visibleLists[0]).to.equal(newListId);
		expect(nextState.visibleLists[1]).to.equal(firstListId);

		// TODO: What about the list name that should go into listIdToList?
		// But we don't have the name in the accept_pending_share payload.
	});

	it('revokes a list share', () => {
		let nextState = createList(initialState, 'id1', 'First List');
		nextState = createList(nextState, 'id2', 'Second List');
		expect(nextState.visibleLists.length).to.equal(2);
		expect(nextState.listIdToList['id1']).to.equal('First List');
		expect(nextState.listIdToList['id2']).to.equal('Second List');

		nextState = lists(nextState, revoke_share({ id: 'id1' }));
		expect(nextState.visibleLists.length).to.equal(1);
		expect(nextState.visibleLists[0]).to.equal('id2');
		expect(nextState.listIdToList['id2']).to.equal('Second List');
		expect(nextState.listIdToList['id1']).to.equal(undefined);
	});

	it('returns initial state on sign in', () => {
		const state: ListsState = { visibleLists: ['x', 'y', 'z'], listIdToList: { a: 'A', b: 'B' } };
		const nextState = lists(state, signed_in);
		expect(nextState).to.equal(initialState);
	});

	it('returns initial state on sign out', () => {
		const state: ListsState = { visibleLists: ['x', 'y', 'z'], listIdToList: { a: 'A', b: 'B' } };
		const nextState = lists(state, signed_out);
		expect(nextState).to.equal(initialState);
	});

	it('reorders a list', () => {
		let state = createList(initialState, 'id1', 'First List');
		state = createList(state, 'id2', 'Second List');
		expect(state.visibleLists.length).to.equal(2);
		expect(state.visibleLists[0]).to.equal('id1');
		expect(state.visibleLists[1]).to.equal('id2');

		state = lists(state, reorder_list({ id: 'id2', goes_before: 'id1' }));
		expect(state.visibleLists[0]).to.equal('id2');
		expect(state.visibleLists[1]).to.equal('id1');
	});

	it('reorders a list to the end', () => {
		let state = createList(initialState, 'id1', 'First List');
		state = createList(state, 'id2', 'Second List');
		expect(state.visibleLists.length).to.equal(2);
		expect(state.visibleLists[0]).to.equal('id1');
		expect(state.visibleLists[1]).to.equal('id2');

		state = lists(state, reorder_list({ id: 'id1' }));
		expect(state.visibleLists[0]).to.equal('id2');
		expect(state.visibleLists[1]).to.equal('id1');
	});

	it('throws when a reordered list does not exist', () => {
		let state = createList(initialState, 'id1', 'First List');
		state = createList(state, 'id2', 'Second List');
		expect(state.visibleLists.length).to.equal(2);
		expect(state.visibleLists[0]).to.equal('id1');
		expect(state.visibleLists[1]).to.equal('id2');

		try {
			state = lists(state, reorder_list({ id: 'XYZ' }));
		} catch (e) {
			expect(e).to.equal('ERROR: list_id XYZ not found in visible lists');
			expect(state.visibleLists[0]).to.equal('id1');
			expect(state.visibleLists[1]).to.equal('id2');
		}
	});

	it('reorders when list before does not exist', () => {
		let state = createList(initialState, 'id1', 'First List');
		state = createList(state, 'id2', 'Second List');
		expect(state.visibleLists.length).to.equal(2);
		expect(state.visibleLists[0]).to.equal('id1');
		expect(state.visibleLists[1]).to.equal('id2');

		try {
			state = lists(state, reorder_list({ id: 'id2', goes_before: 'XYZ' }));
		} catch (e) {
			expect(e).to.equal('ERROR: goes_before XYZ not found in visible lists');
		}
	});
});
