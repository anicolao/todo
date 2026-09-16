import { describe, it, expect } from 'vitest';
import { shouldReplayListAction } from '../src/lib/list-action-replay';
import { lists, create_list } from '../src/lib/components/lists';
import { describe_item } from '../src/lib/components/items';

describe('list action cache boundary', () => {
	it('replays unseen same-second actions, but never duplicates cached ones', () => {
		expect(shouldReplayListAction('saved', { seconds: 100 }, 100, ['saved'])).toBe(false);
		expect(shouldReplayListAction('later', { seconds: 100 }, 100, ['saved'])).toBe(true);
		expect(shouldReplayListAction('old', { seconds: 99 }, 100, ['saved'])).toBe(false);
		expect(shouldReplayListAction('new', { seconds: 101 }, 100, ['saved'])).toBe(true);
		expect(shouldReplayListAction('pending', null, 100, ['saved'])).toBe(true);
	});
	it('records all confirmed IDs at the boundary and does not move the cursor backwards', () => {
		let state = lists(undefined, { type: 'init' });
		state = lists(state, create_list({ id: 'list', name: 'Tasks' }));
		const edit = (id: string, timestamp: number) => ({
			...describe_item({
				list_id: 'list',
				id: 'task',
				orig_description: 'old',
				description: 'new'
			}),
			firebase_doc_id: id,
			timestamp,
			isANormalAction: true
		});
		state = lists(state, edit('a', 100));
		state = lists(state, edit('b', 100));
		state = lists(state, edit('a', 100));
		expect(state.listIdToBoundaryActionIds?.list).toEqual(['a', 'b']);
		state = lists(state, edit('c', 101));
		state = lists(state, edit('older', 100));
		expect(state.listIdToTimestamp.list).toBe(101);
		expect(state.listIdToBoundaryActionIds?.list).toEqual(['c']);
	});
});
