import { expect } from 'chai';
import { describe, it } from 'vitest';

import {
	complete_item,
	create_item,
	describe_item,
	initialState,
	items,
	reorder_item,
	star_item,
	type ItemsState
} from '$lib/components/items';

describe('items', () => {
	function createItem(state: ItemsState, list_id: string, id: string, description: string) {
		return items(state, create_item({ list_id, id, description }));
	}

	it('can create a new item', () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		const nextState = createItem(initialState, list_id, id, description);

		const list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(1);
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIdToItem).to.deep.include({
			abcd1234: { completed: false, starred: false, description }
		});
	});

	it('creates new items at the top of the list', () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		let nextState = createItem(initialState, list_id, id, description);
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(1);
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIdToItem).to.deep.include({
			abcd1234: { completed: false, starred: false, description }
		});

		nextState = createItem(nextState, list_id, 'id1', 'first item ever');
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(2);
		expect(list.itemIds[0]).to.equal('id1');
	});

	it('can redescribe an item', () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		let nextState = createItem(initialState, list_id, id, description);
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(1);
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIdToItem).to.deep.include({
			abcd1234: { completed: false, starred: false, description }
		});

		nextState = items(
			nextState,
			describe_item({ id, list_id, orig_description: description, description: 'newly minted' })
		);
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(1);
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIdToItem).to.deep.include({
			abcd1234: { completed: false, starred: false, description: 'newly minted' }
		});
	});

	function test_merge(
		mergeObject: { orig: string; first: string; second: string },
		expected: string
	) {
		it('handles conflicts and produces: ' + expected, () => {
			const list_id = 'List 9';
			const id = 'abcd1234';
			let nextState = createItem(initialState, list_id, id, mergeObject.orig);
			let list = nextState.listIdToListOfItems[list_id];
			expect(list.itemIds.length).to.equal(1);
			expect(list.itemIds[0]).to.equal(id);
			expect(list.itemIdToItem).to.deep.include({
				abcd1234: { completed: false, starred: false, description: mergeObject.orig }
			});

			nextState = items(
				nextState,
				describe_item({
					id,
					list_id,
					orig_description: mergeObject.orig,
					description: mergeObject.first
				})
			);
			list = nextState.listIdToListOfItems[list_id];
			expect(list.itemIds.length).to.equal(1);
			expect(list.itemIds[0]).to.equal(id);
			expect(list.itemIdToItem).to.deep.include({
				abcd1234: { completed: false, starred: false, description: mergeObject.first }
			});

			nextState = items(
				nextState,
				describe_item({
					id,
					list_id,
					orig_description: mergeObject.orig,
					description: mergeObject.second
				})
			);
			list = nextState.listIdToListOfItems[list_id];
			expect(list.itemIds.length).to.equal(1);
			expect(list.itemIds[0]).to.equal(id);
			expect(list.itemIdToItem).to.deep.include({
				abcd1234: { completed: false, starred: false, description: expected }
			});
		});
	}

	test_merge(
		{
			orig: 'This is the crrected stng',
			first: 'This is the crrected string',
			second: 'This is the corrected stng'
		},
		'This is the corrected string'
	);

	test_merge(
		{
			orig: 'This is the crrected stng',
			first: 'This is the corrected stng',
			second: 'This is the crrected string'
		},
		'This is the corrected string'
	);

	test_merge(
		{
			orig: 'The voice passive, is to be avoded',
			first: 'The passive voice should be avoded',
			second: 'The voice passive, is to be avoided'
		},
		'The passive voice should be avoided'
	);

	test_merge(
		{
			orig: 'The voice passive, is to be avoded',
			first: 'The voice passive, is to be avoided',
			second: 'The passive voice should be avoded'
		},
		'The passive voice should be avoided'
	);

	test_merge(
		{
			orig: 'ALWAYS GIVE UP ON OVERLAPPING EDITS',
			first: 'Always give up on overlapping edits',
			second: 'Give up on overlapping edits'
		},
		'A̶l̶w̶a̶y̶s̶ ̶g̶i̶v̶e̶ ̶u̶p̶ ̶o̶n̶ ̶o̶v̶e̶r̶l̶a̶p̶p̶i̶n̶g̶ ̶e̶d̶i̶t̶s̶ Give up on overlapping edits'
	);

	test_merge(
		{
			orig: 'Even really small overlaps',
			first: 'Even pretty small overlaps',
			second: 'Even very small overlaps'
		},
		'E̶v̶e̶n̶ ̶p̶r̶e̶t̶t̶y̶ ̶s̶m̶a̶l̶l̶ ̶o̶v̶e̶r̶l̶a̶p̶s̶ Even very small overlaps'
	);

	test_merge(
		{
			orig: 'Not the same.',
			first: 'The same.',
			second: 'The same.'
		},
		'The same.'
	);

	it('can complete an item', () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		let nextState = createItem(initialState, list_id, id, description);
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);

		nextState = items(nextState, complete_item({ list_id, id, completed: true }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(true);
	});

	it('can uncomplete an item', () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		let nextState = createItem(initialState, list_id, id, description);
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);

		nextState = items(nextState, complete_item({ id, list_id, completed: true }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(true);

		nextState = items(nextState, complete_item({ id, list_id, completed: false }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);
	});

	it('can star an item', () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		let nextState = createItem(initialState, list_id, id, description);
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].starred).to.equal(false);

		nextState = items(nextState, star_item({ id, list_id, starred: true }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].starred).to.equal(true);
	});

	it('can unstar an item', () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		let nextState = createItem(initialState, list_id, id, description);
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].starred).to.equal(false);

		nextState = items(nextState, star_item({ list_id, id, starred: true }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].starred).to.equal(true);

		nextState = items(nextState, star_item({ list_id, id, starred: false }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].starred).to.equal(false);
	});

	it('moves a starred item to the top', () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		const id2 = '7788';
		const description2 = 'Item 77 88';

		let nextState = createItem(initialState, list_id, id2, description2);
		nextState = createItem(nextState, list_id, id, description);
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIds[1]).to.equal(id2);
		expect(list.itemIdToItem[id2].starred).to.equal(false);

		nextState = items(nextState, star_item({ id: id2, list_id, starred: true }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds[0]).to.equal(id2);
		expect(list.itemIds[1]).to.equal(id);
		expect(list.itemIdToItem[id2].starred).to.equal(true);
	});

	it("doesn't move an unstarred item to the top", () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		const id2 = '7788';
		const description2 = 'Item 77 88';

		let nextState = createItem(initialState, list_id, id2, description2);
		nextState = createItem(nextState, list_id, id, description);
		let list = nextState.listIdToListOfItems[list_id];
		nextState = items(nextState, star_item({ id: id2, list_id, starred: true }));
		nextState = items(nextState, star_item({ id: id, list_id, starred: true }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIds[1]).to.equal(id2);
		expect(list.itemIdToItem[id].starred).to.equal(true);
		expect(list.itemIdToItem[id2].starred).to.equal(true);

		nextState = items(nextState, star_item({ id: id2, list_id, starred: false }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIds[1]).to.equal(id2);
		expect(list.itemIdToItem[id].starred).to.equal(true);
		expect(list.itemIdToItem[id2].starred).to.equal(false);
	});

	it('reorders an item', () => {
		const list_id = 'List 9';
		let nextState = createItem(initialState, list_id, 'idA', 'Item A');
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(1);

		nextState = createItem(nextState, list_id, 'idB', 'Item B');
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(2);

		expect(list.itemIds[0]).to.equal('idB');
		expect(list.itemIds[1]).to.equal('idA');

		nextState = items(nextState, reorder_item({ list_id, id: 'idA', goes_before: 'idB' }));
		list = nextState.listIdToListOfItems[list_id];

		expect(list.itemIds[0]).to.equal('idA');
		expect(list.itemIds[1]).to.equal('idB');
	});

	it('reorders to the end', () => {
		const list_id = 'List 9';
		let nextState = createItem(initialState, list_id, 'idA', 'Item A');
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(1);
		nextState = createItem(nextState, list_id, 'idB', 'Item B');
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(2);

		expect(list.itemIds[0]).to.equal('idB');
		expect(list.itemIds[1]).to.equal('idA');

		nextState = items(nextState, reorder_item({ list_id, id: 'idB' }));
		list = nextState.listIdToListOfItems[list_id];

		expect(list.itemIds[0]).to.equal('idA');
		expect(list.itemIds[1]).to.equal('idB');
	});

	it('throws when a reordered item does not exist', () => {
		const list_id = 'List 9';
		try {
			let nextState = createItem(initialState, list_id, 'idA', 'Item A');
			let list = nextState.listIdToListOfItems[list_id];
			expect(list.itemIds.length).to.equal(1);
			expect(list.itemIds[0]).to.equal('idA');
			nextState = items(nextState, reorder_item({ list_id, id: 'idB' }));
		} catch (e) {
			expect(e).to.equal('ERROR: itemid idB not found in items array');
		}
	});

	it('reorders when item before does not exist', () => {
		const list_id = 'List 9';
		try {
			let nextState = createItem(initialState, list_id, 'idA', 'Item A');
			let list = nextState.listIdToListOfItems[list_id];
			expect(list.itemIds.length).to.equal(1);
			expect(list.itemIds[0]).to.equal('idA');
			nextState = items(nextState, reorder_item({ list_id, id: 'idA', goes_before: 'idC' }));
		} catch (e) {
			expect(e).to.equal('ERROR: itemid idC not found in items array');
		}
	});
});
