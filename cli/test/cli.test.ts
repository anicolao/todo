import { describe, expect, test } from 'bun:test';
import { parseArgs } from '../src/cli';

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
});
