import { describe, expect, test } from 'bun:test';
import { selectItemViews } from '../src/application';
import { itemsMarkdown, listsMarkdown, parseArgs } from '../src/cli';
import type { ItemView } from '../src/types';

const items: ItemView[] = [
	{
		id: 'starred',
		listId: 'groceries',
		listName: 'Groceries',
		description: 'Oat milk',
		completed: false,
		starred: true,
		starTimestamp: 20
	},
	{
		id: 'due',
		listId: 'work',
		listName: 'Work',
		description: 'Send report',
		completed: false,
		starred: false,
		starTimestamp: 0,
		dueDate: { year: 2026, month: 9, day: 2 }
	},
	{
		id: 'future',
		listId: 'work',
		listName: 'Work',
		description: 'Plan launch',
		completed: false,
		starred: false,
		starTimestamp: 0,
		dueDate: { year: 2026, month: 9, day: 3 }
	},
	{
		id: 'completed',
		listId: 'groceries',
		listName: 'Groceries',
		description: 'Almond milk',
		completed: true,
		starred: true,
		starTimestamp: 30
	}
];

describe('CLI parsing', () => {
	test('keeps descriptions positional and extracts service options', () => {
		expect(parseArgs(['add', '--list', 'Groceries', 'oat', 'milk', '--json'])).toEqual({
			positionals: ['add', 'oat', 'milk'],
			options: { list: 'Groceries', json: true }
		});
	});

	test('supports the option terminator', () => {
		expect(parseArgs(['add', '--list', 'Work', '--', '--literal'])).toEqual({
			positionals: ['add', '--literal'],
			options: { list: 'Work' }
		});
	});

	test('formats concise Markdown and reserves metadata for verbose output', () => {
		const conciseLists = listsMarkdown([
			{ id: 'groceries', name: 'Groceries', type: 'list' },
			{ id: 'errands', name: 'Errands', type: 'list' }
		]);
		expect(conciseLists).toContain('- Groceries');
		expect(conciseLists).not.toContain('groceries`');
		expect(listsMarkdown([{ id: 'groceries', name: 'Groceries', type: 'list' }], true)).toContain(
			'`groceries`'
		);

		const conciseItems = itemsMarkdown(items.slice(0, 1), { title: 'Groceries' });
		expect(conciseItems).toContain('- ★ Oat milk');
		expect(conciseItems).not.toContain('`starred`');
		const verboseItems = itemsMarkdown(items.slice(0, 1), {
			title: 'Groceries',
			verbose: true
		});
		expect(verboseItems).toContain('`starred`');
		expect(verboseItems).toContain('active');
	});

	test('selects the existing Today view and case-insensitive search results', () => {
		const today = selectItemViews(items, {
			state: 'active',
			today: true,
			now: new Date(2026, 8, 2, 12)
		});
		expect(today.map((item) => item.id)).toEqual(['starred', 'due']);

		const search = selectItemViews(items, { state: 'active', search: 'MILK' });
		expect(search.map((item) => item.id)).toEqual(['starred']);
	});
});
