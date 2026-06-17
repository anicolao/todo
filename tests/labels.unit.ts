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
