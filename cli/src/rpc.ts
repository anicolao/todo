import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { chmod, rm } from 'node:fs/promises';
import { errorValue, TodoServiceError } from './errors';
import { PROTOCOL_VERSION, type RpcRequest, type RpcResponse } from './types';

const MAX_MESSAGE_BYTES = 1024 * 1024;

function responseLine(response: RpcResponse) {
	return `${JSON.stringify(response)}\n`;
}

function requestLine(request: RpcRequest) {
	return `${JSON.stringify(request)}\n`;
}

function parseRequest(line: string): RpcRequest {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		throw new TodoServiceError('invalid_request', 'Request is not valid JSON');
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new TodoServiceError('invalid_request', 'Request must be an object');
	}
	const request = value as Partial<RpcRequest>;
	if (request.protocol !== PROTOCOL_VERSION) {
		throw new TodoServiceError(
			'incompatible_protocol',
			`Protocol ${String(request.protocol)} is not supported; expected ${PROTOCOL_VERSION}`
		);
	}
	if (typeof request.id !== 'string' || typeof request.method !== 'string') {
		throw new TodoServiceError('invalid_request', 'Request id and method are required');
	}
	return request as RpcRequest;
}

export class RpcServer {
	#server?: Server;

	constructor(
		readonly socketPath: string,
		readonly handler: (request: RpcRequest) => Promise<unknown>,
		readonly requestReadTimeoutMs = 30_000
	) {}

	async start() {
		await rm(this.socketPath, { force: true });
		this.#server = createServer((socket) => this.handleSocket(socket));
		this.#server.maxConnections = 32;
		await new Promise<void>((resolve, reject) => {
			this.#server!.once('error', reject);
			this.#server!.listen(this.socketPath, () => {
				this.#server!.off('error', reject);
				resolve();
			});
		});
		await chmod(this.socketPath, 0o600);
	}

	private handleSocket(socket: Socket) {
		let input = '';
		let done = false;
		socket.setTimeout(this.requestReadTimeoutMs, () => socket.destroy());
		socket.setEncoding('utf8');
		socket.on('data', (chunk) => {
			if (done) return;
			input += chunk;
			if (Buffer.byteLength(input) > MAX_MESSAGE_BYTES) {
				done = true;
				socket.end(
					responseLine({
						protocol: PROTOCOL_VERSION,
						id: '',
						error: { code: 'request_too_large', message: 'Request exceeds the size limit' }
					})
				);
				return;
			}
			const newline = input.indexOf('\n');
			if (newline === -1) return;
			done = true;
			socket.setTimeout(0);
			const line = input.slice(0, newline);
			void this.respond(socket, line);
		});
	}

	private async respond(socket: Socket, line: string) {
		let id = '';
		try {
			const request = parseRequest(line);
			id = request.id;
			const result = await this.handler(request);
			socket.end(responseLine({ protocol: PROTOCOL_VERSION, id, result }));
		} catch (error) {
			socket.end(responseLine({ protocol: PROTOCOL_VERSION, id, error: errorValue(error) }));
		}
	}

	async stop() {
		if (this.#server) {
			await new Promise<void>((resolve) => this.#server!.close(() => resolve()));
			this.#server = undefined;
		}
		await rm(this.socketPath, { force: true });
	}
}

export async function rpcRequest(
	socketPath: string,
	method: string,
	params?: unknown,
	timeoutMs = 10_000
) {
	const request: RpcRequest = {
		protocol: PROTOCOL_VERSION,
		id: crypto.randomUUID(),
		method,
		...(params === undefined ? {} : { params })
	};
	return new Promise<unknown>((resolve, reject) => {
		const socket = createConnection(socketPath);
		let input = '';
		let settled = false;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			callback();
		};
		const timeout = setTimeout(() => {
			socket.destroy();
			finish(() =>
				reject(new TodoServiceError('service_timeout', 'Timed out waiting for Todo service'))
			);
		}, timeoutMs);
		const fail = (error: unknown) => {
			finish(() => reject(error));
		};
		socket.setEncoding('utf8');
		socket.once('error', fail);
		socket.once('close', () => {
			fail(new TodoServiceError('service_unavailable', 'Todo service closed without a response'));
		});
		socket.on('connect', () => socket.write(requestLine(request)));
		socket.on('data', (chunk) => {
			input += chunk;
			const newline = input.indexOf('\n');
			if (newline === -1) return;
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			socket.destroy();
			try {
				const response = JSON.parse(input.slice(0, newline)) as RpcResponse;
				if (response.protocol !== PROTOCOL_VERSION) {
					throw new TodoServiceError(
						'incompatible_protocol',
						`Service protocol ${String(response.protocol)} is not supported`
					);
				}
				if (response.id !== request.id) {
					throw new TodoServiceError(
						'invalid_response',
						'Service response ID did not match request'
					);
				}
				if ('error' in response) {
					reject(
						new TodoServiceError(
							response.error.code,
							response.error.message,
							response.error.details
						)
					);
				} else {
					resolve(response.result);
				}
			} catch (error) {
				reject(error);
			}
		});
	});
}
