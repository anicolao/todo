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
	resolveSearchableLabelQuery,
	selectExcludedSearchListIds,
	selectSearchableListIds,
	set_label_query,
	set_label_visibility,
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
		expect(state.labelIdToLabel.label1.visibility).to.equal('visible');
		expect(queryHasId(state.labelIdToLabel.label1.query, 'list1')).to.equal(true);
	});

	it('stores visibility independently from the query', () => {
		let state = labels(
			initialState,
			set_label_visibility({ label_id: 'label1', visibility: 'hidden' })
		);
		expect(state.labelIdToLabel.label1.query).to.deep.equal(emptyLabelQuery);
		expect(state.labelIdToLabel.label1.visibility).to.equal('hidden');

		state = labels(state, set_label_query({ label_id: 'label1', query: listQuery }));
		expect(state.labelIdToLabel.label1.query).to.deep.equal(listQuery);
		expect(state.labelIdToLabel.label1.visibility).to.equal('hidden');

		state = labels(state, set_label_visibility({ label_id: 'label1', visibility: 'fully_hidden' }));
		expect(state.labelIdToLabel.label1.query).to.deep.equal(listQuery);
		expect(state.labelIdToLabel.label1.visibility).to.equal('fully_hidden');

		state = labels(state, set_label_visibility({ label_id: 'label1', visibility: 'visible' }));
		expect(state.labelIdToLabel.label1.visibility).to.equal('visible');
	});

	it('ignores invalid visibility actions and replays identical actions idempotently', () => {
		const action = set_label_visibility({ label_id: 'label1', visibility: 'hidden' });
		const state = labels(initialState, action);
		expect(labels(state, action)).to.equal(state);
		expect(labels(state, set_label_visibility({ label_id: '', visibility: 'visible' }))).to.equal(
			state
		);
		expect(
			labels(state, {
				type: 'set_label_visibility',
				payload: { label_id: 'label1', visibility: 'unknown' }
			} as any)
		).to.equal(state);
	});

	it('adds a label predicate idempotently', () => {
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

	it('removes predicates whose fields are returned in Firestore order', () => {
		let state = labels(
			initialState,
			set_label_query({
				label_id: 'label1',
				query: {
					type: 'or',
					predicates: [{ id: 'list1', type: 'id' }]
				}
			})
		);

		expect(queryHasId(state.labelIdToLabel.label1.query, 'list1')).to.equal(true);
		state = labels(
			state,
			remove_label_predicate({ label_id: 'label1', predicate: { type: 'id', id: 'list1' } })
		);

		expect(queryHasId(state.labelIdToLabel.label1.query, 'list1')).to.equal(false);
	});

	it('treats or predicates as equivalent regardless of predicate order', () => {
		const orderedQuery: LabelQuery = {
			type: 'or',
			predicates: [
				{
					type: 'or',
					predicates: [
						{ type: 'id', id: 'list1' },
						{ type: 'id', id: 'list2' }
					]
				}
			]
		};
		const reorderedPredicate: LabelQuery = {
			type: 'or',
			predicates: [
				{ type: 'id', id: 'list2' },
				{ type: 'id', id: 'list1' }
			]
		};
		let state = labels(initialState, set_label_query({ label_id: 'label1', query: orderedQuery }));

		state = labels(
			state,
			add_label_predicate({ label_id: 'label1', predicate: reorderedPredicate })
		);
		let query = state.labelIdToLabel.label1.query;
		expect(query.type).to.equal('or');
		if (query.type === 'or') {
			expect(query.predicates.length).to.equal(1);
		}

		state = labels(
			state,
			remove_label_predicate({ label_id: 'label1', predicate: reorderedPredicate })
		);
		query = state.labelIdToLabel.label1.query;
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
			listIdToTimestamp: {},
			pinnedLabelIds: []
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

	it('excludes concrete lists selected by hidden labels from aggregate searches', () => {
		const lists: ListsState = {
			visibleLists: ['hidden-label', 'work-label', 'list1', 'list2'],
			listIdToList: {
				'hidden-label': 'Archive',
				'work-label': 'Work',
				list1: 'Archived work',
				list2: 'Current work'
			},
			listIdToType: {
				'hidden-label': 'label',
				'work-label': 'label',
				list1: 'list',
				list2: 'list'
			},
			listIdToLastKnownInfo: {},
			listIdToTimestamp: {},
			pinnedLabelIds: []
		};
		let labelState = labels(
			initialState,
			set_label_query({
				label_id: 'hidden-label',
				query: { type: 'or', predicates: [{ type: 'id', id: 'list1' }] }
			})
		);
		labelState = labels(
			labelState,
			set_label_visibility({ label_id: 'hidden-label', visibility: 'hidden' })
		);
		labelState = labels(
			labelState,
			set_label_query({
				label_id: 'work-label',
				query: {
					type: 'or',
					predicates: [
						{ type: 'id', id: 'list1' },
						{ type: 'id', id: 'list2' }
					]
				}
			})
		);

		expect([...selectExcludedSearchListIds(lists, labelState)]).to.deep.equal(['list1']);
		expect(selectSearchableListIds(lists, labelState)).to.deep.equal(['list2']);
		expect(resolveSearchableLabelQuery('work-label', lists, labelState)).to.deep.equal([
			{ id: 'list2', name: 'Current work', inaccessible: false }
		]);
		expect(resolveSearchableLabelQuery('hidden-label', lists, labelState)).to.deep.equal([
			{ id: 'list1', name: 'Archived work', inaccessible: false }
		]);
	});

	it('resolves nested hidden labels and preserves inaccessible placeholders', () => {
		const lists: ListsState = {
			visibleLists: ['archive', 'nested', 'list1'],
			listIdToList: { archive: 'Renamed Archive', nested: 'Nested', list1: 'One' },
			listIdToType: { archive: 'label', nested: 'label', list1: 'list' },
			listIdToLastKnownInfo: { missing: { name: 'Missing' } },
			listIdToTimestamp: {},
			pinnedLabelIds: []
		};
		let labelState = labels(
			initialState,
			set_label_query({
				label_id: 'nested',
				query: {
					type: 'or',
					predicates: [
						{ type: 'id', id: 'list1' },
						{ type: 'id', id: 'missing' }
					]
				}
			})
		);
		labelState = labels(
			labelState,
			set_label_query({
				label_id: 'archive',
				query: { type: 'or', predicates: [{ type: 'id', id: 'nested' }] }
			})
		);
		labelState = labels(
			labelState,
			set_label_visibility({ label_id: 'archive', visibility: 'fully_hidden' })
		);

		expect([...selectExcludedSearchListIds(lists, labelState)]).to.deep.equal(['list1']);
		const directEntries = resolveSearchableLabelQuery('archive', lists, labelState);
		expect(directEntries.map((entry) => entry.id)).to.deep.equal(['list1', 'missing']);
		expect(directEntries[1].inaccessible).to.equal(true);
	});
});
