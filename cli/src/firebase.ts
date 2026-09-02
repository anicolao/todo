import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { platform } from 'node:os';
import { initializeApp } from 'firebase/app';
import {
	connectAuthEmulator,
	GoogleAuthProvider,
	inMemoryPersistence,
	initializeAuth,
	signInWithCredential,
	signInWithEmailAndPassword,
	signOut,
	type Auth,
	type User
} from 'firebase/auth';
import {
	connectFirestoreEmulator,
	doc,
	getFirestore,
	serverTimestamp,
	setDoc,
	type Firestore
} from 'firebase/firestore';
import type { AnyAction } from '@reduxjs/toolkit';
import { credentialStore, type CredentialStore } from './credentials';
import { TodoServiceError } from './errors';

const DEFAULT_PROJECT_ID = 'todo-firebase-1a740';
const DEFAULT_API_KEY = 'AIzaSyC7mMXhf0noyZ-0LTJwyRJLpJlX6b-7MqQ';

interface OAuthTokens {
	access_token: string;
	id_token?: string;
	refresh_token?: string;
}

export interface LoginParams {
	email?: string;
	password?: string;
}

export interface BrowserLoginStart {
	id: string;
	url: string;
}

interface PendingBrowserLogin extends BrowserLoginStart {
	completion: Promise<User>;
	cancel: (error: Error) => void;
}

function base64url(value: Buffer) {
	return value.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function openBrowser(url: string) {
	const command = platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
	const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
	const child = spawn(command, args, { detached: true, stdio: 'ignore' });
	child.unref();
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
	const response = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body
	});
	if (!response.ok) {
		throw new TodoServiceError('authentication', 'Google login token exchange failed');
	}
	const tokens = (await response.json()) as Partial<OAuthTokens>;
	if (!tokens.access_token) {
		throw new TodoServiceError('authentication', 'Google login returned no access token');
	}
	return tokens as OAuthTokens;
}

export class FirebaseRuntime {
	readonly projectId: string;
	readonly auth: Auth;
	readonly firestore: Firestore;
	readonly emulator: boolean;
	readonly credentials: CredentialStore;
	#pendingBrowserLogin?: PendingBrowserLogin;

	constructor() {
		this.projectId = process.env.TODO_FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
		const app = initializeApp(
			{
				apiKey: process.env.TODO_FIREBASE_API_KEY || DEFAULT_API_KEY,
				authDomain: `${this.projectId}.firebaseapp.com`,
				projectId: this.projectId,
				storageBucket: `${this.projectId}.appspot.com`,
				messagingSenderId: '847898271389',
				appId: '1:847898271389:web:d386e542429c9bd9033e74'
			},
			`todo-cli-${crypto.randomUUID()}`
		);
		this.auth = initializeAuth(app, { persistence: inMemoryPersistence });
		this.firestore = getFirestore(app);
		this.emulator = process.env.TODO_FIREBASE_EMULATOR === 'true';
		if (this.emulator) {
			const authUrl = process.env.TODO_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099';
			const firestoreHost = process.env.TODO_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
			const firestorePort = Number(process.env.TODO_FIRESTORE_EMULATOR_PORT || 8080);
			if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(authUrl)) {
				throw new TodoServiceError('configuration', 'Auth emulator must use a loopback address');
			}
			if (firestoreHost !== '127.0.0.1' && firestoreHost !== 'localhost') {
				throw new TodoServiceError(
					'configuration',
					'Firestore emulator must use a loopback address'
				);
			}
			connectAuthEmulator(this.auth, authUrl, { disableWarnings: true });
			connectFirestoreEmulator(this.firestore, firestoreHost, firestorePort);
		}
		this.credentials = credentialStore(this.projectId);
	}

	get user(): User | null {
		return this.auth.currentUser;
	}

	async restore(): Promise<User | undefined> {
		if (this.emulator) {
			const email = process.env.TODO_AUTH_EMAIL;
			const password = process.env.TODO_AUTH_PASSWORD;
			if (!email || !password) return undefined;
			return (await signInWithEmailAndPassword(this.auth, email, password)).user;
		}
		const refreshToken = await this.credentials.read();
		if (!refreshToken) return undefined;
		const clientId = process.env.TODO_GOOGLE_CLIENT_ID;
		if (!clientId) return undefined;
		const body = new URLSearchParams({
			client_id: clientId,
			refresh_token: refreshToken,
			grant_type: 'refresh_token'
		});
		if (process.env.TODO_GOOGLE_CLIENT_SECRET) {
			body.set('client_secret', process.env.TODO_GOOGLE_CLIENT_SECRET);
		}
		const tokens = await tokenRequest(body);
		return this.signInWithGoogle(tokens);
	}

	async login(params: LoginParams): Promise<User> {
		if (this.emulator) {
			if (!params.email || !params.password) {
				throw new TodoServiceError(
					'usage',
					'Emulator login requires --email and --password (or TODO_AUTH_EMAIL and TODO_AUTH_PASSWORD)'
				);
			}
			return (await signInWithEmailAndPassword(this.auth, params.email, params.password)).user;
		}
		const pending = await this.beginBrowserLogin();
		openBrowser(pending.url);
		return this.finishBrowserLogin(pending.id);
	}

	private async signInWithGoogle(tokens: OAuthTokens): Promise<User> {
		const credential = GoogleAuthProvider.credential(tokens.id_token || null, tokens.access_token);
		return (await signInWithCredential(this.auth, credential)).user;
	}

	async beginBrowserLogin(): Promise<BrowserLoginStart> {
		if (this.emulator) {
			throw new TodoServiceError('usage', 'Browser login is unavailable with Firebase emulators');
		}
		const clientId = process.env.TODO_GOOGLE_CLIENT_ID;
		if (!clientId) {
			throw new TodoServiceError(
				'configuration',
				'TODO_GOOGLE_CLIENT_ID must name a Google OAuth desktop client'
			);
		}
		this.cancelBrowserLogin('A newer Google login was started');
		const state = base64url(randomBytes(24));
		const verifier = base64url(randomBytes(48));
		const challenge = base64url(createHash('sha256').update(verifier).digest());
		let resolveCode!: (code: string) => void;
		let rejectCode!: (error: Error) => void;
		const codePromise = new Promise<string>((resolve, reject) => {
			resolveCode = resolve;
			rejectCode = reject;
		});
		const server = createServer((request, response) => {
			try {
				const url = new URL(request.url || '/', 'http://127.0.0.1');
				if (url.searchParams.get('state') !== state) {
					throw new Error('OAuth state did not match');
				}
				const error = url.searchParams.get('error');
				if (error) throw new Error(`Google login failed: ${error}`);
				const code = url.searchParams.get('code');
				if (!code) throw new Error('Google login returned no authorization code');
				response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
				response.end('Todo CLI is signed in. You may close this window.\n');
				resolveCode(code);
			} catch (error) {
				response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
				response.end('Todo CLI sign-in failed. Return to the terminal.\n');
				rejectCode(error as Error);
			}
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => resolve());
		});
		const port = (server.address() as AddressInfo).port;
		const redirectUri = `http://127.0.0.1:${port}/callback`;
		const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
		authorization.search = new URLSearchParams({
			client_id: clientId,
			redirect_uri: redirectUri,
			response_type: 'code',
			scope: 'openid email profile',
			access_type: 'offline',
			prompt: 'consent',
			state,
			code_challenge: challenge,
			code_challenge_method: 'S256'
		}).toString();
		const id = crypto.randomUUID();
		const timeout = setTimeout(() => rejectCode(new Error('Google login timed out')), 120_000);
		const completion = (async () => {
			const code = await codePromise;
			const body = new URLSearchParams({
				client_id: clientId,
				code,
				code_verifier: verifier,
				grant_type: 'authorization_code',
				redirect_uri: redirectUri
			});
			if (process.env.TODO_GOOGLE_CLIENT_SECRET) {
				body.set('client_secret', process.env.TODO_GOOGLE_CLIENT_SECRET);
			}
			const tokens = await tokenRequest(body);
			const user = await this.signInWithGoogle(tokens);
			if (tokens.refresh_token) await this.credentials.write(tokens.refresh_token);
			return user;
		})().finally(() => {
			clearTimeout(timeout);
			server.close();
		});
		void completion.catch(() => undefined);
		this.#pendingBrowserLogin = {
			id,
			url: authorization.toString(),
			completion,
			cancel: rejectCode
		};
		return { id, url: authorization.toString() };
	}

	async finishBrowserLogin(id: string): Promise<User> {
		const pending = this.#pendingBrowserLogin;
		if (!pending || pending.id !== id) {
			throw new TodoServiceError('authentication', 'Google login is no longer pending');
		}
		try {
			return await pending.completion;
		} finally {
			if (this.#pendingBrowserLogin?.id === id) this.#pendingBrowserLogin = undefined;
		}
	}

	cancelBrowserLogin(message = 'Google login was cancelled') {
		this.#pendingBrowserLogin?.cancel(new Error(message));
		this.#pendingBrowserLogin = undefined;
	}

	async logout() {
		this.cancelBrowserLogin();
		await signOut(this.auth);
		if (!this.emulator) await this.credentials.remove();
	}

	async appendListAction(listId: string, actionId: string, action: AnyAction) {
		const user = this.user;
		if (!user) throw new TodoServiceError('authentication', 'Sign in with `todo auth login`');
		await setDoc(doc(this.firestore, 'lists', listId, 'actions', actionId), {
			...action,
			creator: user.uid,
			timestamp: serverTimestamp()
		});
	}
}
