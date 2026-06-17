import { expect } from 'chai';
import { describe, it } from 'vitest';

import {
	add_label_predicate,
	emptyLabelQuery,
	initialState,
	labels,
	queryHasId,
	remove_label_predicate,
	resolveLabelQuery,
	setQueryIdMembership,
	set_label_query,
	type LabelQuery
} from '$lib/components/labels';
import type { ListsState } from '$lib/components/lists';

describe('labels', () => {
	const listQuery: LabelQuery = {
		type: 'or',
		predicates: [{ type: 'id', id: 'list1' }]
	};

	it('can replay a label query', () => {
		const state = labels(initialState, set_label_query({ label_id: 'label1', query: listQuery }));

		expect(state.labelIdToLabel.label1.query).to.deep.equal(listQuery);
		expect(queryHasId(state.labelIdToLabel.label1.query, 'list1')).to.equal(true);
	});

	it('adds a label predicate idempotently', () => {
		let state = labels(initialState, set_label_query({ label_id: 'label1', query: emptyLabelQuery }));
		state = labels(
			state,
			add_label_predicate({ label_id: 'label1', predicate: { type: 'id', id: 'list1' } })
		);
		state = labels(
			state,
			add_label_predicate({ label_id: 'label1', predicate: { type: 'id', id: 'list1' } })
		);

		const query = state.labelIdToLabel.label1.query;
		expect(query.type).to.equal('or');
		if (query.type === 'or') {
			expect(query.predicates.length).to.equal(1);
		}
	});

	it('removes a label predicate idempotently', () => {
		let state = labels(initialState, set_label_query({ label_id: 'label1', query: listQuery }));
		state = labels(
			state,
			remove_label_predicate({ label_id: 'label1', predicate: { type: 'id', id: 'list1' } })
		);
		state = labels(
			state,
			remove_label_predicate({ label_id: 'label1', predicate: { type: 'id', id: 'list1' } })
		);

		const query = state.labelIdToLabel.label1.query;
		expect(query.type).to.equal('or');
		if (query.type === 'or') {
			expect(query.predicates.length).to.equal(0);
		}
	});

	it('removes re-added list predicates across multiple labels', () => {
		let state = initialState;
		const setLabel = (labelId: string) => {
			state = labels(state, set_label_query({ label_id: labelId, query: emptyLabelQuery }));
		};
		const add = (labelId: string, listId: string) => {
			state = labels(
				state,
				add_label_predicate({ label_id: labelId, predicate: { type: 'id', id: listId } })
			);
		};
		const remove = (labelId: string, listId: string) => {
			state = labels(
				state,
				remove_label_predicate({ label_id: labelId, predicate: { type: 'id', id: listId } })
			);
		};
		const has = (labelId: string, listId: string) =>
			queryHasId(state.labelIdToLabel[labelId]?.query, listId);

		setLabel('label1');
		setLabel('label2');
		setLabel('label3');
		add('label1', 'list1');
		add('label2', 'list1');
		add('label2', 'list2');
		add('label3', 'list2');

		remove('label2', 'list1');
		expect(has('label2', 'list1')).to.equal(false);
		add('label2', 'list1');
		expect(has('label2', 'list1')).to.equal(true);
		remove('label2', 'list1');
		expect(has('label2', 'list1')).to.equal(false);
		expect(has('label1', 'list1')).to.equal(true);
		expect(has('label2', 'list2')).to.equal(true);

		remove('label3', 'list2');
		expect(has('label3', 'list2')).to.equal(false);
		add('label3', 'list2');
		expect(has('label3', 'list2')).to.equal(true);
		remove('label3', 'list2');
		expect(has('label3', 'list2')).to.equal(false);
		expect(has('label2', 'list2')).to.equal(true);
	});

	it('can materialize id membership as a complete query', () => {
		let query = setQueryIdMembership(emptyLabelQuery, 'list1', true);
		expect(queryHasId(query, 'list1')).to.equal(true);

		query = setQueryIdMembership(query, 'list2', true);
		expect(queryHasId(query, 'list1')).to.equal(true);
		expect(queryHasId(query, 'list2')).to.equal(true);

		query = setQueryIdMembership(query, 'list1', false);
		expect(queryHasId(query, 'list1')).to.equal(false);
		expect(queryHasId(query, 'list2')).to.equal(true);
	});

	it('lets a final set query override earlier add/remove history', () => {
		let state = labels(
			initialState,
			set_label_query({ label_id: 'label1', query: emptyLabelQuery })
		);
		state = labels(
			state,
			add_label_predicate({ label_id: 'label1', predicate: { type: 'id', id: 'list1' } })
		);
		state = labels(
			state,
			remove_label_predicate({ label_id: 'label1', predicate: { type: 'id', id: 'list1' } })
		);
		state = labels(
			state,
			add_label_predicate({ label_id: 'label1', predicate: { type: 'id', id: 'list1' } })
		);

		const query = setQueryIdMembership(state.labelIdToLabel.label1.query, 'list1', false);
		state = labels(state, set_label_query({ label_id: 'label1', query }));

		expect(queryHasId(state.labelIdToLabel.label1.query, 'list1')).to.equal(false);
	});

	it('resolves accessible and inaccessible id predicates', () => {
		const lists: ListsState = {
			visibleLists: ['list1'],
			listIdToList: { list1: 'Work' },
			listIdToType: { list1: 'list' },
			listIdToLastKnownInfo: { missing1: { name: 'Old Shared List', ownerEmail: 'a@example.com' } },
			listIdToTimestamp: {}
		};
		const labelState = labels(
			initialState,
			set_label_query({
				label_id: 'label1',
				query: {
					type: 'or',
					predicates: [
						{ type: 'id', id: 'list1' },
						{ type: 'id', id: 'missing1' }
					]
				}
			})
		);

		const entries = resolveLabelQuery(labelState.labelIdToLabel.label1.query, lists, labelState);
		expect(entries.length).to.equal(2);
		expect(entries[0]).to.deep.equal({ id: 'list1', name: 'Work', inaccessible: false });
		expect(entries[1].id).to.equal('missing1');
		expect(entries[1].inaccessible).to.equal(true);
		expect(entries[1].name).to.contain('Inaccessible List');
		expect(entries[1].name).to.contain('Old Shared List');
		expect(entries[1].name).to.contain('a@example.com');
	});
});
