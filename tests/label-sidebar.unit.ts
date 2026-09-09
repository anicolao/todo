import { expect } from 'chai';
import { describe, it } from 'vitest';

import {
	buildLabelPredicateGroups,
	buildExpandedLabelIds,
	buildRouteExpandedLabelIds,
	mergeVisiblePredicateOrder,
	type LabelEntriesById
} from '$lib/components/label-sidebar';
import type { LabelQuery, LabelsState } from '$lib/components/labels';
import type { ListsState } from '$lib/components/lists';

const lists: ListsState = {
	visibleLists: ['label-a', 'label-b', 'label-c', 'list-x'],
	listIdToList: {
		'label-a': 'A',
		'label-b': 'B',
		'label-c': 'C',
		'list-x': 'X'
	},
	listIdToType: {
		'label-a': 'label',
		'label-b': 'label',
		'label-c': 'label',
		'list-x': 'list'
	},
	listIdToLastKnownInfo: {},
	listIdToTimestamp: {},
	pinnedLabelIds: []
};

const listX = { id: 'list-x', name: 'X', inaccessible: false };
const labelEntriesById: LabelEntriesById = {
	'label-a': [listX],
	'label-b': [listX],
	'label-c': []
};

describe('label sidebar expansion', () => {
	it('groups every top-level expression with the flattened lists it contributes', () => {
		const parentId = 'label-parent';
		const nestedId = 'label-nested';
		const parentLists: ListsState = {
			...lists,
			visibleLists: [parentId, nestedId, 'list-a', 'list-b', 'list-c'],
			listIdToList: {
				[parentId]: 'Parent',
				[nestedId]: 'Nested',
				'list-a': 'A',
				'list-b': 'B',
				'list-c': 'C'
			},
			listIdToType: {
				[parentId]: 'label',
				[nestedId]: 'label',
				'list-a': 'list',
				'list-b': 'list',
				'list-c': 'list'
			}
		};
		const predicates: LabelQuery[] = [
			{ type: 'id', id: 'list-a' },
			{ type: 'id', id: nestedId },
			{ type: 'id', id: 'list-c' }
		];
		const labelState: LabelsState = {
			labelIdToLabel: {
				[parentId]: { query: { type: 'or', predicates }, visibility: 'visible' },
				[nestedId]: {
					query: {
						type: 'or',
						predicates: [
							{ type: 'id', id: 'list-b' },
							{ type: 'id', id: 'list-c' }
						]
					},
					visibility: 'visible'
				}
			}
		};

		const groups = buildLabelPredicateGroups(parentId, predicates, parentLists, labelState);
		expect(groups.map((group) => group.entries.map((entry) => entry.id))).to.deep.equal([
			['list-a'],
			['list-b', 'list-c']
		]);
	});

	it('moves visible expressions as blocks while retaining invisible expression slots', () => {
		const first: LabelQuery = { type: 'id', id: 'first' };
		const invisible: LabelQuery = { type: 'id', id: 'invisible' };
		const nested: LabelQuery = {
			type: 'or',
			predicates: [
				{ type: 'id', id: 'nested-a' },
				{ type: 'id', id: 'nested-b' }
			]
		};

		expect(mergeVisiblePredicateOrder([first, invisible, nested], [nested, first])).to.deep.equal([
			nested,
			invisible,
			first
		]);
	});

	it('expands the selected label route', () => {
		const expanded = buildRouteExpandedLabelIds(
			'/labels',
			'label-c',
			'',
			'',
			lists,
			labelEntriesById
		);

		expect([...expanded]).to.deep.equal(['label-c']);
	});

	it('expands only a valid via label for a list route', () => {
		const expanded = buildRouteExpandedLabelIds(
			'/lists',
			'',
			'list-x',
			'label-b',
			lists,
			labelEntriesById
		);

		expect([...expanded]).to.deep.equal(['label-b']);
	});

	it('expands every containing label when via is missing', () => {
		const expanded = buildRouteExpandedLabelIds(
			'/lists',
			'',
			'list-x',
			'',
			lists,
			labelEntriesById
		);

		expect([...expanded]).to.deep.equal(['label-a', 'label-b']);
	});

	it('falls back to every containing label when via is invalid', () => {
		const expanded = buildRouteExpandedLabelIds(
			'/lists',
			'',
			'list-x',
			'label-c',
			lists,
			labelEntriesById
		);

		expect([...expanded]).to.deep.equal(['label-a', 'label-b']);
	});

	it('ignores list and label parameters on unrelated routes', () => {
		const expanded = buildRouteExpandedLabelIds(
			'/search',
			'label-a',
			'list-x',
			'label-b',
			lists,
			labelEntriesById
		);

		expect([...expanded]).to.deep.equal([]);
	});

	it('combines route-derived expansion and persisted pins', () => {
		const expanded = buildExpandedLabelIds(['label-a'], new Set(['label-b']));

		expect([...expanded]).to.deep.equal(['label-a', 'label-b']);
	});

	it('collapses a pinned-only label when its pin is removed', () => {
		const beforeUnpin = buildExpandedLabelIds(['label-a'], new Set());
		const afterUnpin = buildExpandedLabelIds([], new Set());

		expect([...beforeUnpin]).to.deep.equal(['label-a']);
		expect([...afterUnpin]).to.deep.equal([]);
	});

	it('keeps a route-expanded label open when its pin is removed', () => {
		const afterUnpin = buildExpandedLabelIds([], new Set(['label-a']));

		expect([...afterUnpin]).to.deep.equal(['label-a']);
	});
});
