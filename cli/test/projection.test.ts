import { describe, expect, test } from 'bun:test';
import { create_item, complete_item, star_item } from '$lib/components/items';
import { Projection } from '../src/projection';
import { TodoServiceError } from '../src/errors';

function populatedProjection() {
	const projection = new Projection();
	projection.dispatchGlobal(
		{ type: 'create_list', payload: { id: 'list-1', name: 'Groceries' }, creator: 'user-1' },
		'user-1',
		'global-1',
		1
	);
	projection.dispatchList(
		{ type: 'rename_list', payload: { id: 'list-1', name: 'Groceries' } },
		'name',
		0
	);
	projection.dispatchList(
		create_item({ list_id: 'list-1', id: 'item-1', description: 'oat milk' }),
		'action-1',
		2
	);
	return projection;
}

describe('service projection', () => {
	test('reuses the existing reducers for global and list actions', () => {
		const projection = populatedProjection();
		expect(projection.listViews()).toEqual([{ id: 'list-1', name: 'Groceries', type: 'list' }]);
		expect(projection.itemViews()).toEqual([
			{
				id: 'item-1',
				listId: 'list-1',
				listName: 'Groceries',
				description: 'oat milk',
				completed: false,
				starred: false
			}
		]);
	});

	test('applies existing completion and star behavior', () => {
		const projection = populatedProjection();
		projection.dispatchList(
			complete_item({
				list_id: 'list-1',
				id: 'item-1',
				completed: true,
				completed_time: 123,
				description: 'oat milk'
			}),
			'action-2',
			3
		);
		projection.dispatchList(
			star_item({ list_id: 'list-1', id: 'item-1', starred: true, star_timestamp: 124 }),
			'action-3',
			4
		);
		expect(projection.itemViews()[0]).toMatchObject({ completed: true, starred: true });
	});

	test('defers an item mutation until a later create action during replay', () => {
		const projection = new Projection();
		projection.dispatchGlobal(
			{ type: 'create_list', payload: { id: 'list-1', name: 'Groceries' }, creator: 'user-1' },
			'user-1',
			'global-1',
			1
		);
		projection.dispatchListBatch([
			{
				action: complete_item({
					list_id: 'list-1',
					id: 'item-1',
					completed: true,
					completed_time: 123,
					description: 'oat milk'
				}),
				documentId: 'complete-before-create',
				timestamp: 2
			},
			{
				action: create_item({ list_id: 'list-1', id: 'item-2', description: 'bread' }),
				documentId: 'unrelated-create',
				timestamp: 3
			},
			{
				action: create_item({ list_id: 'list-1', id: 'item-1', description: 'oat milk' }),
				documentId: 'later-create',
				timestamp: 4
			}
		]);

		expect(projection.itemViews().find((item) => item.id === 'item-1')).toMatchObject({
			completed: true,
			description: 'oat milk'
		});
	});

	test('rejects an item mutation with no create action without changing the projection', () => {
		const projection = populatedProjection();
		const before = projection.snapshot();
		expect(() =>
			projection.dispatchListBatch([
				{
					action: star_item({
						list_id: 'list-1',
						id: 'missing-item',
						starred: true,
						star_timestamp: 123
					}),
					documentId: 'orphan-star',
					timestamp: 3
				}
			])
		).toThrow('before its item is created');
		expect(projection.snapshot()).toEqual(before);
	});

	test('resolves unique item prefixes and rejects ambiguous ones', () => {
		const projection = populatedProjection();
		const list = projection.resolveList('Groceries');
		expect(projection.resolveItem(list, 'item-').id).toBe('item-1');
		projection.dispatchList(
			create_item({ list_id: 'list-1', id: 'item-2', description: 'bread' }),
			'action-2',
			3
		);
		expect(() => projection.resolveItem(list, 'item-')).toThrow(TodoServiceError);
	});

	test('restores an isolated copy of snapshot state', () => {
		const projection = populatedProjection();
		const restored = new Projection(projection.snapshot());
		expect(restored.itemViews()).toEqual(projection.itemViews());
	});
});
