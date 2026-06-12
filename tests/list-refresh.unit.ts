import { expect } from 'chai';
import { describe, it } from 'vitest';

import { selectListsForRefresh } from '$lib/list-refresh';

describe('list refresh selection', () => {
	it('loads every visible uncached list on startup even without activity docs', () => {
		const listsToLoad = selectListsForRefresh({
			currentListId: null,
			visibleLists: ['active', 'deleted-without-activity', 'named-without-activity'],
			listIdToTimestamp: {},
			activityLists: [{ id: 'active', seconds: 10 }],
			isStartup: true
		});

		expect(listsToLoad).to.deep.equal([
			'active',
			'deleted-without-activity',
			'named-without-activity'
		]);
	});

	it('uses activity timestamps for non-startup refreshes', () => {
		const listsToLoad = selectListsForRefresh({
			currentListId: 'opened-list',
			visibleLists: ['opened-list', 'fresh-activity', 'stale-activity', 'missing-activity'],
			listIdToTimestamp: {
				'opened-list': 100,
				'fresh-activity': 100,
				'stale-activity': 100
			},
			activityLists: [
				{ id: 'fresh-activity', seconds: 101 },
				{ id: 'stale-activity', seconds: 100 }
			],
			isStartup: false
		});

		expect(listsToLoad).to.deep.equal(['opened-list', 'fresh-activity']);
	});
});
