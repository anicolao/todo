import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
	connectAuthEmulator,
	createUserWithEmailAndPassword,
	inMemoryPersistence,
	initializeAuth,
	type Auth
} from 'firebase/auth';
import {
	connectFirestoreEmulator,
	doc,
	getFirestore,
	serverTimestamp,
	setDoc,
	type Firestore
} from 'firebase/firestore';
import { TodoApplication } from '../src/application';
import { FirebaseRuntime } from '../src/firebase';
import { runtimePaths } from '../src/paths';
import { PROTOCOL_VERSION, type ItemView, type RpcRequest } from '../src/types';

const enabled = process.env.TODO_RUN_FIREBASE_EMULATOR_TESTS === 'true';
const suite = enabled ? describe : describe.skip;

function request(method: string, params?: unknown): RpcRequest {
	return { protocol: PROTOCOL_VERSION, id: crypto.randomUUID(), method, params };
}

async function eventually<T>(read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
	for (let attempt = 0; attempt < 100; attempt++) {
		const value = await read();
		if (matches(value)) return value;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	throw new Error('Timed out waiting for emulator state');
}

async function runCli(...args: string[]) {
	const child = Bun.spawn([process.execPath, join(import.meta.dir, '../src/cli.ts'), ...args], {
		cwd: join(import.meta.dir, '../..'),
		env: process.env,
		stdout: 'pipe',
		stderr: 'pipe'
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited
	]);
	if (exitCode !== 0) throw new Error(`todo ${args.join(' ')} failed: ${stderr}`);
	return stdout.trim();
}

suite('Firebase emulator integration', () => {
	let seedApp: FirebaseApp;
	let seedAuth: Auth;
	let seedFirestore: Firestore;
	let application: TodoApplication | undefined;
	let root: string;
	let uid: string;

	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), 'todo-cli-emulator-'));
		process.env.TODO_CLI_HOME = join(root, 'state');
		process.env.TODO_CLI_RUNTIME_DIR = join(root, 'run');
		process.env.TODO_FIREBASE_EMULATOR = 'true';
		process.env.TODO_FIREBASE_PROJECT_ID = `todo-cli-test-${Date.now()}`;
		process.env.TODO_AUTH_EMAIL = 'cli@example.test';
		process.env.TODO_AUTH_PASSWORD = 'test-password';

		seedApp = initializeApp(
			{
				apiKey: 'fake-api-key',
				projectId: process.env.TODO_FIREBASE_PROJECT_ID
			},
			`seed-${crypto.randomUUID()}`
		);
		seedAuth = initializeAuth(seedApp, { persistence: inMemoryPersistence });
		connectAuthEmulator(seedAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
		seedFirestore = getFirestore(seedApp);
		connectFirestoreEmulator(seedFirestore, '127.0.0.1', 8080);
		uid = (
			await createUserWithEmailAndPassword(
				seedAuth,
				process.env.TODO_AUTH_EMAIL,
				process.env.TODO_AUTH_PASSWORD
			)
		).user.uid;

		await setDoc(doc(seedFirestore, 'editors', 'list-1', uid, 'editor'), {
			email: process.env.TODO_AUTH_EMAIL
		});
		await setDoc(doc(seedFirestore, 'lists', 'list-1', 'actions', 'name'), {
			type: 'rename_list',
			payload: { id: 'list-1', name: 'Groceries' },
			timestamp: 0
		});
		await setDoc(doc(seedFirestore, 'from', uid, 'to', uid, 'requests', 'create-list'), {
			type: 'create_list',
			payload: { id: 'list-1', name: 'Groceries' },
			creator: uid,
			target: uid,
			timestamp: serverTimestamp()
		});

		application = new TodoApplication(runtimePaths(), new FirebaseRuntime());
		await application.initialize();
	});

	afterAll(async () => {
		await application?.stop();
		await runCli('service', 'stop').catch(() => undefined);
		await deleteApp(seedApp);
		await rm(root, { recursive: true });
	});

	test('hydrates, writes, and observes remote changes', async () => {
		expect(await application!.handle(request('lists.query'))).toEqual([
			{ id: 'list-1', name: 'Groceries', type: 'list' }
		]);

		const created = (await application!.handle(
			request('items.create', { list: 'Groceries', description: 'oat milk' })
		)) as ItemView;
		expect(created).toMatchObject({ description: 'oat milk', completed: false });

		await setDoc(doc(seedFirestore, 'lists', 'list-1', 'actions', 'remote-item'), {
			type: 'create_item',
			payload: { list_id: 'list-1', id: 'remote-item', description: 'bread' },
			creator: uid,
			timestamp: serverTimestamp()
		});

		const items = await eventually(
			() => application!.handle(request('items.query', { list: 'Groceries', state: 'all' })),
			(value) => (value as ItemView[]).some((item) => item.id === 'remote-item')
		);
		expect(items).toHaveLength(2);

		const completed = (await application!.handle(
			request('items.complete', { list: 'Groceries', item: created.id, completed: true })
		)) as ItemView;
		expect(completed.completed).toBe(true);

		await application!.stop();
		await setDoc(doc(seedFirestore, 'lists', 'list-1', 'actions', 'while-stopped'), {
			type: 'create_item',
			payload: { list_id: 'list-1', id: 'while-stopped', description: 'tea' },
			creator: uid,
			timestamp: serverTimestamp()
		});
		application = new TodoApplication(runtimePaths(), new FirebaseRuntime());
		await application.initialize();
		const restartedItems = (await application.handle(
			request('items.query', { list: 'Groceries', state: 'all' })
		)) as ItemView[];
		expect(restartedItems.map((item) => item.description)).toEqual(['tea', 'bread', 'oat milk']);

		await application.stop();
		application = undefined;
		try {
			expect(JSON.parse(await runCli('lists', '--json'))).toEqual([
				{ id: 'list-1', name: 'Groceries', type: 'list' }
			]);
			const added = JSON.parse(await runCli('add', '--list', 'Groceries', 'coffee', '--json')) as {
				item: ItemView;
			};
			expect(added.item.description).toBe('coffee');
			const cliItems = JSON.parse(
				await runCli('list', '--list', 'Groceries', '--all-states', '--json')
			) as ItemView[];
			expect(cliItems.map((item) => item.description)).toEqual([
				'coffee',
				'tea',
				'bread',
				'oat milk'
			]);
		} finally {
			await runCli('service', 'stop');
		}
	});
});
