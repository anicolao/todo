import type { APIRequestContext, Page } from '@playwright/test';
import { authEmulatorOrigin, emulatorProjectId } from './emulator';

const firebaseApiKey = 'AIzaSyC7mMXhf0noyZ-0LTJwyRJLpJlX6b-7MqQ';
const firebaseAuthAppName = '[DEFAULT]';

export interface E2EAuthUser {
	uid: string;
	email: string;
	password: string;
	name: string;
	photoUrl: string;
}

interface PasswordSignInResponse {
	localId: string;
	email: string;
	displayName?: string;
	photoUrl?: string;
	idToken: string;
	refreshToken: string;
	expiresIn: string;
}

export async function seedAuthUsers(request: APIRequestContext, users: E2EAuthUser[]) {
	const response = await request.post(
		`${authEmulatorOrigin}/identitytoolkit.googleapis.com/v1/projects/${emulatorProjectId}/accounts:batchCreate?key=fake-api-key`,
		{
			headers: {
				authorization: 'Bearer owner'
			},
			data: {
				allowOverwrite: true,
				users: users.map((user) => ({
					localId: user.uid,
					email: user.email,
					emailVerified: true,
					displayName: user.name,
					photoUrl: user.photoUrl,
					rawPassword: user.password
				}))
			}
		}
	);
	if (!response.ok()) {
		throw new Error(`Could not seed auth users: ${await response.text()}`);
	}
}

async function signInWithPassword(
	request: APIRequestContext,
	user: E2EAuthUser
): Promise<PasswordSignInResponse> {
	const response = await request.post(
		`${authEmulatorOrigin}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
		{
			data: {
				email: user.email,
				password: user.password,
				returnSecureToken: true
			}
		}
	);
	if (!response.ok()) {
		throw new Error(`Could not sign in ${user.email}: ${await response.text()}`);
	}
	return response.json();
}

export async function installAuthSession(
	page: Page,
	request: APIRequestContext,
	user: E2EAuthUser
) {
	const session = await signInWithPassword(request, user);
	const now = Date.now();
	const authUser = {
		uid: session.localId,
		email: session.email,
		emailVerified: true,
		displayName: session.displayName || user.name,
		isAnonymous: false,
		photoURL: session.photoUrl || user.photoUrl,
		providerData: [
			{
				providerId: 'password',
				uid: session.email,
				displayName: session.displayName || user.name,
				email: session.email,
				phoneNumber: null,
				photoURL: session.photoUrl || user.photoUrl
			}
		],
		stsTokenManager: {
			refreshToken: session.refreshToken,
			accessToken: session.idToken,
			expirationTime: now + Number(session.expiresIn) * 1000
		},
		createdAt: String(now),
		lastLoginAt: String(now),
		apiKey: firebaseApiKey,
		appName: firebaseAuthAppName
	};

	await page.goto('/login');
	await page.evaluate(
		async ({ key, value }) => {
			const storeName = 'firebaseLocalStorage';
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				const openRequest = indexedDB.open('firebaseLocalStorageDb', 1);
				openRequest.onupgradeneeded = () => {
					const upgradedDb = openRequest.result;
					if (!upgradedDb.objectStoreNames.contains(storeName)) {
						upgradedDb.createObjectStore(storeName, { keyPath: 'fbase_key' });
					}
				};
				openRequest.onerror = () => reject(openRequest.error);
				openRequest.onsuccess = () => resolve(openRequest.result);
			});

			await new Promise<void>((resolve, reject) => {
				const transaction = db.transaction(storeName, 'readwrite');
				transaction.onerror = () => reject(transaction.error);
				transaction.oncomplete = () => resolve();
				const store = transaction.objectStore(storeName);
				store.clear();
				store.put({ fbase_key: key, value });
			});
			db.close();
		},
		{
			key: `firebase:authUser:${firebaseApiKey}:${firebaseAuthAppName}`,
			value: authUser
		}
	);
}
