import { expect } from 'chai';
import { describe, it } from 'vitest';

import {
	initialState,
	create_list,
	delete_list,
	lists,
	type ListsState,
	rename_list,
	register_pending_share,
	accept_pending_share
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
		nextState = lists(nextState, delete_list('id1'));
		expect(nextState.visibleLists.length).to.equal(0);
	});

	it('registers a list share', () => {
		let nextState = initialState;
		expect(nextState.pendingShares.length).to.equal(0);
		nextState = lists(nextState, {
			...register_pending_share({ id: 'id1', name: 'shareMe' }),
			creator: 'god'
		});
		expect(nextState.pendingShares.length).to.equal(1);
		expect(nextState.pendingShares[0].id).to.equal('id1');
		expect(nextState.pendingShares[0].name).to.equal('shareMe');
		expect(nextState.pendingShares[0].sharerId).to.equal('god');
	});

	it('accepts a list share', () => {
		let nextState = initialState;
		expect(nextState.pendingShares.length).to.equal(0);
		nextState = lists(nextState, {
			...register_pending_share({ id: 'id1', name: 'shareMe' }),
			creator: 'god'
		});

		expect(nextState.visibleLists.length).to.equal(0);
		expect(nextState.pendingShares.length).to.equal(1);
		expect(nextState.pendingShares[0].id).to.equal('id1');
		expect(nextState.pendingShares[0].name).to.equal('shareMe');
		expect(nextState.pendingShares[0].sharerId).to.equal('god');

		let action = accept_pending_share('id1');
		nextState = lists(nextState, action);

		expect(nextState.pendingShares.length).to.equal(0);
		expect(nextState.visibleLists.length).to.equal(1);
		expect(nextState.visibleLists[0]).to.equal('id1');
		expect(nextState.listIdToList['id1']).to.equal('shareMe');
	});
});
