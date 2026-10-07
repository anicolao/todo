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
	for (const advancing of [true, false]) {
		test(
			advancing
				? 'waits beyond the deadline while real replay work advances'
				: 'times out when responsive replay reports stop advancing',
			async () => {
				const directory = await mkdtemp(join(tmpdir(), 'todo-rpc-'));
				directories.push(directory);
				const socket = join(directory, 'service.sock');
				let work = 0;
				let polls = 0;
				const server = new RpcServer(socket, async (request) => {
					if (request.method === 'service.status') return { completedWork: work };
					for (let batch = 0; batch < 12; batch++) {
						await new Promise((resolve) => setTimeout(resolve, 25));
						if (advancing || batch === 0) work++;
					}
					return 'ready';
				});
				await server.start();
				try {
					const result = rpcRequest(socket, 'items.query', undefined, 120, {
						intervalMs: 10,
						read: async () => {
							polls++;
							return ((await rpcRequest(socket, 'service.status')) as { completedWork: number })
								.completedWork;
						}
					});
					if (advancing) expect(await result).toBe('ready');
					else await expect(result).rejects.toMatchObject({ code: 'service_timeout' });
					// Polling must stop after both success and timeout.
					await new Promise((resolve) => setTimeout(resolve, 25));
					const finishedPolls = polls;
					await new Promise((resolve) => setTimeout(resolve, 40));
					expect(polls).toBe(finishedPolls);
				} finally {
					await server.stop();
				}
			}
		);
	}

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
