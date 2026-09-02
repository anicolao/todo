#!/usr/bin/env bun

import { closeSync, fchmodSync, openSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TodoServiceError } from './errors';
import { ensurePrivateDirectories, runtimePaths } from './paths';
import { rpcRequest } from './rpc';
import type { ItemView, ListView, ServiceStatus } from './types';

interface ParsedArgs {
	positionals: string[];
	options: Record<string, string | boolean>;
}

const VALUE_OPTIONS = new Set(['list', 'email', 'password']);

export function parseArgs(args: string[]): ParsedArgs {
	const positionals: string[] = [];
	const options: Record<string, string | boolean> = {};
	for (let index = 0; index < args.length; index++) {
		const value = args[index];
		if (value === '--') {
			positionals.push(...args.slice(index + 1));
			break;
		}
		if (!value.startsWith('--')) {
			positionals.push(value);
			continue;
		}
		const name = value.slice(2);
		if (VALUE_OPTIONS.has(name)) {
			const optionValue = args[++index];
			if (optionValue === undefined)
				throw new TodoServiceError('usage', `${value} requires a value`);
			options[name] = optionValue;
		} else {
			options[name] = true;
		}
	}
	return { positionals, options };
}

function optionString(parsed: ParsedArgs, name: string) {
	const value = parsed.options[name];
	return typeof value === 'string' ? value : undefined;
}

function sleep(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function serviceAvailable() {
	try {
		await rpcRequest(runtimePaths().socket, 'service.status', undefined, 500);
		return true;
	} catch {
		return false;
	}
}

export async function startService() {
	const paths = await ensurePrivateDirectories(runtimePaths());
	if (await serviceAvailable()) return;
	const log = openSync(paths.log, 'a', 0o600);
	fchmodSync(log, 0o600);
	const service = fileURLToPath(new URL('./service.ts', import.meta.url));
	const child = spawn(process.execPath, [service], {
		cwd: fileURLToPath(new URL('../..', import.meta.url)),
		detached: true,
		stdio: ['ignore', log, log],
		env: process.env
	});
	child.unref();
	closeSync(log);
	for (let attempt = 0; attempt < 100; attempt++) {
		if (await serviceAvailable()) return;
		await sleep(100);
	}
	throw new TodoServiceError('service_unavailable', `Todo service did not start; see ${paths.log}`);
}

async function call(
	method: string,
	params?: unknown,
	options?: { start?: boolean; timeout?: number }
) {
	const shouldStart = options?.start !== false;
	if (shouldStart) await startService();
	const timeout = options?.timeout || 10_000;
	for (let attempt = 0; attempt < 150; attempt++) {
		try {
			return await rpcRequest(runtimePaths().socket, method, params, timeout);
		} catch (error) {
			if (!(error instanceof TodoServiceError) || error.code !== 'not_ready') throw error;
			await sleep(100);
		}
	}
	throw new TodoServiceError('service_timeout', 'Todo service did not become ready');
}

function printStatus(status: ServiceStatus) {
	const identity = status.email || status.uid || 'signed out';
	console.log(`${status.phase}: ${identity} (${status.projectId})`);
	if (status.phase === 'ready') console.log(`${status.listCount} lists, ${status.itemCount} items`);
	if (status.message) console.error(status.message);
}

function printLists(lists: ListView[]) {
	if (lists.length === 0) return;
	console.log('ID\tTYPE\tNAME');
	for (const list of lists) console.log(`${list.id}\t${list.type}\t${list.name}`);
}

function dateString(item: ItemView) {
	if (!item.dueDate) return '';
	return `${item.dueDate.year.toString().padStart(4, '0')}-${item.dueDate.month
		.toString()
		.padStart(2, '0')}-${item.dueDate.day.toString().padStart(2, '0')}`;
}

function printItems(items: ItemView[]) {
	if (items.length === 0) return;
	const multipleLists = new Set(items.map((item) => item.listId)).size > 1;
	console.log(`${multipleLists ? 'LIST\t' : ''}ID\tSTATE\tSTAR\tDUE\tDESCRIPTION`);
	for (const item of items) {
		console.log(
			`${multipleLists ? `${item.listName}\t` : ''}${item.id}\t${
				item.completed ? 'completed' : 'active'
			}\t${item.starred ? '*' : ''}\t${dateString(item)}\t${item.description}`
		);
	}
}

function printItem(item: ItemView, verb: string) {
	console.log(`${verb} “${item.description}” (${item.id})`);
}

function help() {
	console.log(`Usage: todo <command> [options]

Commands:
  lists [--json]
  list [--list NAME_OR_ID] [--completed|--all-states] [--json]
  add [--list NAME_OR_ID] DESCRIPTION [--json]
  complete|uncomplete [--list NAME_OR_ID] ITEM_ID [--json]
  edit [--list NAME_OR_ID] ITEM_ID DESCRIPTION [--json]
  star|unstar [--list NAME_OR_ID] ITEM_ID [--json]
  due [--list NAME_OR_ID] ITEM_ID YYYY-MM-DD [--json]
  undue [--list NAME_OR_ID] ITEM_ID [--json]
  config set default-list NAME_OR_ID
  auth login [--email EMAIL --password PASSWORD]
  auth status|logout
  service start|status|stop|logs`);
}

export async function runCli(args = process.argv.slice(2)) {
	const parsed = parseArgs(args);
	const [command, ...positionals] = parsed.positionals;
	const json = parsed.options.json === true;
	const list = optionString(parsed, 'list');
	let result: unknown;

	switch (command) {
		case undefined:
		case 'help':
		case '--help':
			help();
			return;
		case 'service': {
			const operation = positionals[0] || 'status';
			if (operation === 'start') {
				await startService();
				printStatus((await call('service.status')) as ServiceStatus);
				return;
			}
			if (operation === 'status') {
				if (!(await serviceAvailable())) {
					console.log('stopped');
					return;
				}
				printStatus((await call('service.status', undefined, { start: false })) as ServiceStatus);
				return;
			}
			if (operation === 'stop') {
				if (!(await serviceAvailable())) {
					console.log('Already stopped');
					return;
				}
				await call('service.stop', undefined, { start: false });
				console.log('Stopped Todo service');
				return;
			}
			if (operation === 'logs') {
				const path = runtimePaths().log;
				try {
					const lines = readFileSync(path, 'utf8').trimEnd().split('\n');
					console.log(lines.slice(-100).join('\n'));
				} catch {
					console.log(`No service log at ${path}`);
				}
				return;
			}
			throw new TodoServiceError('usage', `Unknown service command: ${operation}`);
		}
		case 'auth': {
			const operation = positionals[0] || 'status';
			if (operation === 'login') {
				result = await call(
					'auth.login',
					{ email: optionString(parsed, 'email'), password: optionString(parsed, 'password') },
					{ timeout: 150_000 }
				);
			} else if (operation === 'status') {
				result = await call('auth.status');
			} else if (operation === 'logout') {
				result = await call('auth.logout');
			} else {
				throw new TodoServiceError('usage', `Unknown auth command: ${operation}`);
			}
			if (json) console.log(JSON.stringify(result));
			else if (operation === 'logout') console.log('Signed out');
			else printStatus(result as ServiceStatus);
			return;
		}
		case 'lists':
			result = await call('lists.query');
			if (json) console.log(JSON.stringify(result));
			else printLists(result as ListView[]);
			return;
		case 'list':
			result = await call('items.query', {
				list,
				state: parsed.options['all-states']
					? 'all'
					: parsed.options.completed
					? 'completed'
					: 'active'
			});
			if (json) console.log(JSON.stringify(result));
			else printItems(result as ItemView[]);
			return;
		case 'add':
			result = await call('items.create', { list, description: positionals.join(' ') });
			break;
		case 'complete':
		case 'uncomplete':
			result = await call('items.complete', {
				list,
				item: positionals[0],
				completed: command === 'complete'
			});
			break;
		case 'edit':
			result = await call('items.edit', {
				list,
				item: positionals[0],
				description: positionals.slice(1).join(' ')
			});
			break;
		case 'star':
		case 'unstar':
			result = await call('items.star', {
				list,
				item: positionals[0],
				starred: command === 'star'
			});
			break;
		case 'due':
			result = await call('items.due', { list, item: positionals[0], date: positionals[1] });
			break;
		case 'undue':
			result = await call('items.due', { list, item: positionals[0] });
			break;
		case 'config':
			if (positionals[0] !== 'set' || positionals[1] !== 'default-list') {
				throw new TodoServiceError('usage', 'Usage: todo config set default-list NAME_OR_ID');
			}
			result = await call('config.setDefaultList', { list: positionals.slice(2).join(' ') });
			if (json) console.log(JSON.stringify(result));
			else console.log(`Default list is ${(result as ListView).name}`);
			return;
		default:
			throw new TodoServiceError('usage', `Unknown command: ${command}`);
	}

	if (json) console.log(JSON.stringify({ item: result }));
	else printItem(result as ItemView, command === 'add' ? 'Added' : 'Updated');
}

function exitCode(error: unknown) {
	if (!(error instanceof TodoServiceError)) return 1;
	if (['usage', 'ambiguous', 'not_found'].includes(error.code)) return 2;
	if (error.code === 'authentication') return 3;
	if (error.code === 'permission') return 4;
	if (error.code.startsWith('service_') || error.code === 'incompatible_protocol') return 5;
	return 1;
}

if (import.meta.main) {
	runCli().catch((error) => {
		console.error((error as Error).message);
		if (error instanceof TodoServiceError && error.details)
			console.error(JSON.stringify(error.details));
		process.exit(exitCode(error));
	});
}
