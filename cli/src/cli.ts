#!/usr/bin/env bun

import { closeSync, fchmodSync, openSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { platform } from 'node:os';
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
	const service =
		process.env.TODO_CLI_SERVICE_ENTRYPOINT ||
		fileURLToPath(new URL('./service.ts', import.meta.url));
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

function markdownText(value: string) {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/([`*_[\]<>])/g, '\\$1')
		.replace(/\r?\n/g, ' ');
}

function printMarkdown(markdown: string) {
	const output = `${markdown.trimEnd()}\n`;
	if (process.stdout.isTTY) {
		const rendered = spawnSync('glow', ['-'], {
			input: output,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'ignore']
		});
		if (!rendered.error && rendered.status === 0) {
			process.stdout.write(rendered.stdout);
			return;
		}
	}
	process.stdout.write(output);
}

function openBrowser(url: string) {
	const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
	const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
	const child = spawn(command, args, { detached: true, stdio: 'ignore' });
	child.once('error', () => undefined);
	child.unref();
}

function printStatus(status: ServiceStatus, verbose = false) {
	const identity = status.email || status.uid || 'signed out';
	const lines = [`# Todo service`, '', `**${status.phase}** — ${markdownText(identity)}`];
	if (status.phase === 'ready')
		lines.push('', `${status.listCount} lists, ${status.itemCount} items`);
	if (verbose) lines.push('', `Project: \`${status.projectId}\``);
	if (status.message) lines.push('', `> ${markdownText(status.message)}`);
	printMarkdown(lines.join('\n'));
}

export function listsMarkdown(lists: ListView[], verbose = false) {
	const lines = ['# Lists', ''];
	if (lists.length === 0) return [...lines, '_No lists._'].join('\n');
	for (const list of lists) {
		const metadata = verbose ? ` — ${list.type}; \`${list.id}\`` : '';
		lines.push(`- ${markdownText(list.name)}${metadata}`);
	}
	return lines.join('\n');
}

function dateString(item: ItemView) {
	if (!item.dueDate) return '';
	return `${item.dueDate.year.toString().padStart(4, '0')}-${item.dueDate.month
		.toString()
		.padStart(2, '0')}-${item.dueDate.day.toString().padStart(2, '0')}`;
}

export interface ItemsMarkdownOptions {
	title: string;
	verbose?: boolean;
	groupByList?: boolean;
	showState?: boolean;
}

function itemMarkdown(item: ItemView, options: ItemsMarkdownOptions) {
	const state = options.showState ? ` [${item.completed ? 'x' : ' '}]` : '';
	let line = `-${state} ${item.starred ? '★' : '☆'} ${markdownText(item.description)}`;
	if (options.verbose) {
		const metadata = [
			`\`${item.id}\``,
			item.completed ? 'completed' : 'active',
			item.dueDate ? `due ${dateString(item)}` : undefined
		].filter(Boolean);
		line += ` — ${metadata.join('; ')}`;
	}
	return line;
}

export function itemsMarkdown(items: ItemView[], options: ItemsMarkdownOptions) {
	const lines = [`# ${markdownText(options.title)}`, ''];
	if (items.length === 0) return [...lines, '_No items._'].join('\n');
	const groupByList = options.groupByList || new Set(items.map((item) => item.listId)).size > 1;
	if (!groupByList) {
		lines.push(...items.map((item) => itemMarkdown(item, options)));
		return lines.join('\n');
	}
	const groups = new Map<string, ItemView[]>();
	for (const item of items) {
		const group = groups.get(item.listId) || [];
		group.push(item);
		groups.set(item.listId, group);
	}
	for (const group of groups.values()) {
		const list = group[0];
		const metadata = options.verbose ? ` \`${list.listId}\`` : '';
		lines.push(`## ${markdownText(list.listName)}${metadata}`, '');
		lines.push(...group.map((item) => itemMarkdown(item, options)), '');
	}
	return lines.join('\n').trimEnd();
}

function printItem(item: ItemView, verb: string, verbose = false) {
	const metadata = verbose ? ` — \`${item.id}\`` : '';
	printMarkdown(
		`- **${verb}:** ${item.starred ? '★' : '☆'} ${markdownText(item.description)}${metadata}`
	);
}

function help() {
	printMarkdown(`# Todo CLI

Usage: \`todo <command> [options]\`

Commands:

- \`lists [--verbose|--json]\`
- \`list [--list NAME_OR_ID] [--completed|--all-states] [--verbose|--json]\`
- \`today [--verbose|--json]\`
- \`search QUERY [--list NAME_OR_ID] [--completed|--all-states] [--verbose|--json]\`
- \`add [--list NAME_OR_ID] DESCRIPTION [--verbose|--json]\`
- \`complete|uncomplete [--list NAME_OR_ID] ITEM_ID [--verbose|--json]\`
- \`edit [--list NAME_OR_ID] ITEM_ID DESCRIPTION [--verbose|--json]\`
- \`star|unstar [--list NAME_OR_ID] ITEM_ID [--verbose|--json]\`
- \`due [--list NAME_OR_ID] ITEM_ID YYYY-MM-DD [--verbose|--json]\`
- \`undue [--list NAME_OR_ID] ITEM_ID [--verbose|--json]\`
- \`config set default-list NAME_OR_ID\`
- \`auth login [--no-open]|status|logout\`
- \`service start|status|stop|logs\`

Human-readable output is Markdown. Interactive output is rendered with \`glow\` when installed;
use \`--verbose\` to include IDs and other metadata, or \`--json\` for structured output.`);
}

export async function runCli(args = process.argv.slice(2)) {
	const parsed = parseArgs(args);
	const [command, ...positionals] = parsed.positionals;
	const json = parsed.options.json === true;
	const verbose = parsed.options.verbose === true;
	const list = optionString(parsed, 'list');
	const state = parsed.options['all-states']
		? 'all'
		: parsed.options.completed
		? 'completed'
		: 'active';
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
				printStatus((await call('service.status')) as ServiceStatus, verbose);
				return;
			}
			if (operation === 'status') {
				if (!(await serviceAvailable())) {
					printMarkdown('# Todo service\n\n**stopped**');
					return;
				}
				printStatus(
					(await call('service.status', undefined, { start: false })) as ServiceStatus,
					verbose
				);
				return;
			}
			if (operation === 'stop') {
				if (!(await serviceAvailable())) {
					printMarkdown('Todo service is already stopped.');
					return;
				}
				await call('service.stop', undefined, { start: false });
				printMarkdown('Stopped Todo service.');
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
				const started = (await call(
					'auth.login.begin',
					{ email: optionString(parsed, 'email'), password: optionString(parsed, 'password') },
					{ timeout: 10_000 }
				)) as
					| { completed: true; status: ServiceStatus }
					| { completed: false; id: string; url: string };
				if (started.completed) {
					result = started.status;
				} else {
					printMarkdown(`# Google sign-in

Open this URL if the browser does not open automatically:

<${started.url}>

_Waiting for Google authorization…_`);
					if (parsed.options['no-open'] !== true) openBrowser(started.url);
					result = await call('auth.login.finish', { id: started.id }, { timeout: 150_000 });
				}
			} else if (operation === 'status') {
				result = await call('auth.status');
			} else if (operation === 'logout') {
				result = await call('auth.logout');
			} else {
				throw new TodoServiceError('usage', `Unknown auth command: ${operation}`);
			}
			if (json) console.log(JSON.stringify(result));
			else if (operation === 'logout') printMarkdown('Signed out.');
			else printStatus(result as ServiceStatus, verbose);
			return;
		}
		case 'lists':
			result = await call('lists.query');
			if (json) console.log(JSON.stringify(result));
			else printMarkdown(listsMarkdown(result as ListView[], verbose));
			return;
		case 'list':
		case 'today':
		case 'search': {
			const search = command === 'search' ? positionals.join(' ').trim() : undefined;
			if (command === 'search' && !search) {
				throw new TodoServiceError('usage', 'Usage: todo search QUERY');
			}
			result = await call('items.query', {
				list,
				state,
				...(command === 'today' ? { today: true } : {}),
				...(search !== undefined ? { search } : {})
			});
			if (json) console.log(JSON.stringify(result));
			else {
				const items = result as ItemView[];
				const title =
					command === 'today'
						? 'Today'
						: command === 'search'
						? `Search: ${search}`
						: items[0]?.listName || list || 'Todos';
				printMarkdown(
					itemsMarkdown(items, {
						title,
						verbose,
						groupByList: command !== 'list' || !list,
						showState: state === 'all'
					})
				);
			}
			return;
		}
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
			else printMarkdown(`Default list is **${markdownText((result as ListView).name)}**.`);
			return;
		default:
			throw new TodoServiceError('usage', `Unknown command: ${command}`);
	}

	if (json) console.log(JSON.stringify({ item: result }));
	else printItem(result as ItemView, command === 'add' ? 'Added' : 'Updated', verbose);
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
