import type { APIRequestContext } from '@playwright/test';

type DeleteOptions = Parameters<APIRequestContext['delete']>[1];

export const emulatorProjectId =
	process.env.E2E_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'todo-firebase-1a740';

const firestoreHost = process.env.E2E_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
const firestorePort = process.env.E2E_FIRESTORE_EMULATOR_PORT || '8080';
const authHost = process.env.E2E_AUTH_EMULATOR_HOST || '127.0.0.1';
const authPort = process.env.E2E_AUTH_EMULATOR_PORT || '9099';

export const firestoreEmulatorOrigin = `http://${firestoreHost}:${firestorePort}`;
export const authEmulatorOrigin = `http://${authHost}:${authPort}`;

export async function resetFirestoreEmulator(request: APIRequestContext, options?: DeleteOptions) {
	await request.delete(
		`${firestoreEmulatorOrigin}/emulator/v1/projects/${emulatorProjectId}/databases/(default)/documents`,
		options
	);
}

export async function resetAuthEmulator(request: APIRequestContext, options?: DeleteOptions) {
	await request.delete(
		`${authEmulatorOrigin}/emulator/v1/projects/${emulatorProjectId}/accounts`,
		options
	);
}

export async function resetEmulators(request: APIRequestContext) {
	await resetFirestoreEmulator(request);
	await resetAuthEmulator(request);
}
