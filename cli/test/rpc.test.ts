import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
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

	test('keeps a parsed request open while a long-running handler finishes', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'todo-rpc-'));
		directories.push(directory);
		const socket = join(directory, 'service.sock');
		const server = new RpcServer(
			socket,
			async () => {
				await new Promise((resolve) => setTimeout(resolve, 50));
				return 'finished';
			},
			10
		);
		await server.start();
		try {
			expect(await rpcRequest(socket, 'auth.login.finish', undefined, 1_000)).toBe('finished');
		} finally {
			await server.stop();
		}
	});

	test('reports a service that closes without sending a response', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'todo-rpc-'));
		directories.push(directory);
		const socket = join(directory, 'service.sock');
		const server = createServer((client) => client.end());
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(socket, resolve);
		});
		try {
			await expect(rpcRequest(socket, 'auth.login.finish', undefined, 1_000)).rejects.toMatchObject(
				{
					code: 'service_unavailable',
					message: 'Todo service closed without a response'
				}
			);
		} finally {
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});
});
