import { expect } from 'chai';
import { describe, it } from 'vitest';

import {
	complete_item,
	create_item,
	describe_item,
	initialState,
	items,
	remove_due_date,
	reorder_item,
	RepeatType,
	set_due_date,
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
			abcd1234: {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description
			}
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
			abcd1234: {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description
			}
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
			abcd1234: {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description
			}
		});

		nextState = items(
			nextState,
			describe_item({ id, list_id, orig_description: description, description: 'newly minted' })
		);
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds.length).to.equal(1);
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIdToItem).to.deep.include({
			abcd1234: {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description: 'newly minted'
			}
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
				abcd1234: {
					completed: false,
					starred: false,
					starTimestamp: 0,
					description: mergeObject.orig
				}
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
				abcd1234: {
					completed: false,
					starred: false,
					starTimestamp: 0,
					description: mergeObject.first
				}
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
				abcd1234: {
					completed: false,
					starred: false,
					starTimestamp: 0,
					description: expected
				}
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

		nextState = items(
			nextState,
			complete_item({ list_id, id, completed: true, completed_time: 0 })
		);
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

		nextState = items(
			nextState,
			complete_item({ id, list_id, completed: true, completed_time: 0 })
		);
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(true);

		nextState = items(
			nextState,
			complete_item({ id, list_id, completed: false, completed_time: 0 })
		);
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

		const star_timestamp = 5;
		nextState = items(nextState, star_item({ id, list_id, starred: true, star_timestamp }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].starred).to.equal(true);
		expect(list.itemIdToItem[id].starTimestamp).to.equal(5);
	});

	it('can unstar an item', () => {
		const list_id = 'List 9';
		const id = 'abcd1234';
		const description = 'My List Item Creation Test';
		let nextState = createItem(initialState, list_id, id, description);
		let list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].starred).to.equal(false);

		const star_timestamp = 5;
		nextState = items(nextState, star_item({ list_id, id, starred: true, star_timestamp }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].starred).to.equal(true);

		nextState = items(nextState, star_item({ list_id, id, starred: false, star_timestamp }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].starred).to.equal(false);
		expect(list.itemIdToItem[id].starTimestamp).to.equal(5);
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

		const star_timestamp = 200;
		nextState = items(nextState, star_item({ id: id2, list_id, starred: true, star_timestamp }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds[0]).to.equal(id2);
		expect(list.itemIds[1]).to.equal(id);
		expect(list.itemIdToItem[id2].starred).to.equal(true);
		expect(list.itemIdToItem[id].starTimestamp).to.equal(200);
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
		const star_timestamp = 300;
		nextState = items(nextState, star_item({ id: id2, list_id, starred: true, star_timestamp }));
		nextState = items(nextState, star_item({ id: id, list_id, starred: true, star_timestamp }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIds[1]).to.equal(id2);
		expect(list.itemIdToItem[id].starred).to.equal(true);
		expect(list.itemIdToItem[id2].starred).to.equal(true);
		expect(list.itemIdToItem[id2].starTimestamp).to.equal(star_timestamp);

		nextState = items(nextState, star_item({ id: id2, list_id, starred: false, star_timestamp: 2 }));
		list = nextState.listIdToListOfItems[list_id];
		expect(list.itemIds[0]).to.equal(id);
		expect(list.itemIds[1]).to.equal(id2);
		expect(list.itemIdToItem[id].starred).to.equal(true);
		expect(list.itemIdToItem[id2].starred).to.equal(false);
		expect(list.itemIdToItem[id2].starTimestamp).to.equal(star_timestamp);
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

	function makeListItemWithDueDate(
		due_date_year: number,
		due_date_month: number,
		due_date_day: number,
		due_date_repeats: RepeatType,
		due_date_repeats_every: number
	) {
		const list_id = 'List 10';
		const id = 'item id 1';
		const description = 'Item One';
		let state = createItem(initialState, list_id, id, description);

		let list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description
			}
		});

		state = items(
			state,
			set_due_date({
				list_id,
				id,
				due_date: {
					year: due_date_year,
					month: due_date_month,
					day: due_date_day,
					repeats: { type: due_date_repeats, every: due_date_repeats_every }
				}
			})
		);

		list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description,
				dueDate: {
					year: due_date_year,
					month: due_date_month,
					day: due_date_day,
					repeats: { type: due_date_repeats, every: due_date_repeats_every }
				}
			}
		});
		return { state, list_id, id, description };
	}

	it('sets a simple due date', () => {
		makeListItemWithDueDate(2022, 12, 31, RepeatType.NONE, 0);
	});

	it('sets a repeating due date', () => {
		makeListItemWithDueDate(2022, 12, 31, RepeatType.NONE, 0);
		makeListItemWithDueDate(2022, 12, 31, RepeatType.DAILY, 2);
		makeListItemWithDueDate(2022, 12, 31, RepeatType.MONTHLY, 3);
		makeListItemWithDueDate(2022, 12, 3, RepeatType.WEEKLY, 4);
		makeListItemWithDueDate(2022, 12, 31, RepeatType.YEARLY, 5);
		makeListItemWithDueDate(2022, 12, 31, RepeatType.WEEKDAYS, 0);
	});

	it('removes a due date', () => {
		let { state, list_id, id, description } = makeListItemWithDueDate(
			2022,
			12,
			31,
			RepeatType.DAILY,
			2
		);

		state = items(state, remove_due_date({ list_id, id }));

		let list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description
			}
		});
	});

	it('completes a repeating DAILY task', () => {
		let { state, list_id, id, description } = makeListItemWithDueDate(
			2022,
			12,
			31,
			RepeatType.DAILY,
			1
		);
		const completed_time = new Date(2022, 11, 31).getTime();
		state = items(state, complete_item({ list_id, id, completed: true, completed_time }));
		let list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);

		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description,
				dueDate: {
					year: 2023,
					month: 1,
					day: 1,
					repeats: { type: RepeatType.DAILY, every: 1 }
				}
			}
		});
	});

	it('completes a repeating WEEKLY task', () => {
		let { state, list_id, id, description } = makeListItemWithDueDate(
			2022,
			12,
			31,
			RepeatType.WEEKLY,
			1
		);
		const completed_time = new Date(2022, 11, 31).getTime();
		state = items(state, complete_item({ list_id, id, completed: true, completed_time }));
		let list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);

		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description,
				dueDate: {
					year: 2023,
					month: 1,
					day: 7,
					repeats: { type: RepeatType.WEEKLY, every: 1 }
				}
			}
		});
	});

	it('completes a repeating MONTHLY task', () => {
		let { state, list_id, id, description } = makeListItemWithDueDate(
			2022,
			12,
			30,
			RepeatType.MONTHLY,
			1
		);
		const completed_time = new Date(2022, 11, 31).getTime();
		state = items(state, complete_item({ list_id, id, completed: true, completed_time }));
		let list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);

		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description,
				dueDate: {
					year: 2023,
					month: 1,
					day: 30,
					repeats: { type: RepeatType.MONTHLY, every: 1 }
				}
			}
		});
	});

	it('completes a repeating YEARLY task', () => {
		let { state, list_id, id, description } = makeListItemWithDueDate(
			2022,
			12,
			30,
			RepeatType.YEARLY,
			1
		);
		const completed_time = new Date(2022, 11, 31).getTime();
		state = items(state, complete_item({ list_id, id, completed: true, completed_time }));
		let list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);

		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description,
				dueDate: {
					year: 2023,
					month: 12,
					day: 30,
					repeats: { type: RepeatType.YEARLY, every: 1 }
				}
			}
		});
	});

	it('completes a repeating WEEKDAYS task', () => {
		let { state, list_id, id, description } = makeListItemWithDueDate(
			2022,
			12,
			30,
			RepeatType.WEEKDAYS,
			1
		);
		const completed_time = new Date(2022, 11, 31).getTime();
		state = items(state, complete_item({ list_id, id, completed: true, completed_time }));
		let list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);

		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description,
				dueDate: {
					year: 2023,
					month: 1,
					day: 2,
					repeats: { type: RepeatType.WEEKDAYS, every: 1 }
				}
			}
		});
	});

	it('completes a repeating DAILY task twice', () => {
		let { state, list_id, id, description } = makeListItemWithDueDate(
			2022,
			12,
			31,
			RepeatType.DAILY,
			1
		);
		const completed_time = new Date(2022, 11, 31).getTime();
		state = items(state, complete_item({ list_id, id, completed: true, completed_time }));
		let list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);

		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description,
				dueDate: {
					year: 2023,
					month: 1,
					day: 1,
					repeats: { type: RepeatType.DAILY, every: 1 }
				}
			}
		});

		state = items(state, complete_item({ list_id, id, completed: true, completed_time }));
		list = state.listIdToListOfItems[list_id];
		expect(list.itemIdToItem[id].completed).to.equal(false);

		expect(list.itemIdToItem).to.deep.include({
			'item id 1': {
				completed: false,
				starred: false,
				starTimestamp: 0,
				description,
				dueDate: {
					year: 2023,
					month: 1,
					day: 2,
					repeats: { type: RepeatType.DAILY, every: 1 }
				}
			}
		});
	});
});
