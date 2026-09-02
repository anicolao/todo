import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TodoServiceError } from '../src/errors';
import { RpcServer, rpcRequest } from '../src/rpc';

const directories: string[] = [];

afterEach(async () => {
	await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('local RPC', () => {
	test('round trips a versioned request', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'todo-rpc-'));
		directories.push(directory);
		const socket = join(directory, 'service.sock');
		const server = new RpcServer(socket, async (request) => ({
			method: request.method,
			params: request.params
		}));
		await server.start();
		try {
			expect(await rpcRequest(socket, 'items.query', { state: 'active' })).toEqual({
				method: 'items.query',
				params: { state: 'active' }
			});
		} finally {
			await server.stop();
		}
	});

	test('returns structured handler errors', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'todo-rpc-'));
		directories.push(directory);
		const socket = join(directory, 'service.sock');
		const server = new RpcServer(socket, async () => {
			throw new TodoServiceError('usage', 'bad request');
		});
		await server.start();
		try {
			await expect(rpcRequest(socket, 'bad')).rejects.toMatchObject({
				code: 'usage',
				message: 'bad request'
			});
		} finally {
			await server.stop();
		}
	});
});
