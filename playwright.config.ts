import { devices, type PlaywrightTestConfig } from '@playwright/test';

const appPort = process.env.E2E_APP_PORT || '4173';
const firebaseConfig = process.env.E2E_FIREBASE_CONFIG || 'firebase.json';
const firebaseProjectId = process.env.E2E_FIREBASE_PROJECT_ID || 'todo-firebase-1a740';
const firestoreEmulatorHost = process.env.E2E_FIRESTORE_EMULATOR_HOST || '127.0.0.1';
const firestoreEmulatorPort = process.env.E2E_FIRESTORE_EMULATOR_PORT || '8080';
const authEmulatorHost = process.env.E2E_AUTH_EMULATOR_HOST || '127.0.0.1';
const authEmulatorPort = process.env.E2E_AUTH_EMULATOR_PORT || '9099';
const reuseExistingServer = process.env.E2E_ISOLATED !== 'true';
const shellArg = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const config: PlaywrightTestConfig = {
	webServer: [
		{
			command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${appPort}`,
			url: `http://127.0.0.1:${appPort}`,
			env: {
				VITE_USE_FIREBASE_EMULATOR: 'true',
				VITE_FIREBASE_PROJECT_ID: firebaseProjectId,
				VITE_FIRESTORE_EMULATOR_HOST: firestoreEmulatorHost,
				VITE_FIRESTORE_EMULATOR_PORT: firestoreEmulatorPort,
				VITE_AUTH_EMULATOR_URL: `http://${authEmulatorHost}:${authEmulatorPort}`,
				VITE_TEST_LOGIN_EMAIL: process.env.VITE_TEST_LOGIN_EMAIL || '',
				VITE_TEST_LOGIN_PASSWORD: process.env.VITE_TEST_LOGIN_PASSWORD || '',
				VITE_TEST_LOGIN_NAME: process.env.VITE_TEST_LOGIN_NAME || ''
			},
			reuseExistingServer,
			timeout: 120000
		},
		{
			command: `npx firebase emulators:start --config ${shellArg(
				firebaseConfig
			)} --only firestore,auth --project ${shellArg(firebaseProjectId)} --non-interactive`,
			url: `http://${authEmulatorHost}:${authEmulatorPort}`,
			reuseExistingServer,
			timeout: 120000
		}
	],
	testDir: 'tests/e2e',
	timeout: 60000,
	workers: process.env.CI ? 1 : undefined,
	use: {
		baseURL: `http://127.0.0.1:${appPort}`,
		trace: 'on-first-retry'
	},
	reporter: process.env.CI ? 'html' : 'list',
	projects: [
		{
			name: 'Desktop Chrome',
			use: { ...devices['Desktop Chrome'] }
		},
		/*
		{
			name: 'iPhone 12',
			use: { ...devices['iPhone 12'], isMobile: true }
		},
		*/
		{
			name: 'Pixel 5',
			use: {
				...devices['Pixel 5'],
				viewport: { width: 393, height: 852 },
				deviceScaleFactor: 1,
				isMobile: true,
				hasTouch: true
			}
		}
	]
};

export default config;
