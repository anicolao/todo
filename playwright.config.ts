import { devices, type PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
	webServer: [
		{
			command: 'npm run build && npm run preview -- --host 127.0.0.1',
			url: 'http://127.0.0.1:4173',
			env: {
				VITE_USE_FIREBASE_EMULATOR: 'true',
				VITE_TEST_LOGIN_EMAIL: process.env.VITE_TEST_LOGIN_EMAIL || '',
				VITE_TEST_LOGIN_PASSWORD: process.env.VITE_TEST_LOGIN_PASSWORD || '',
				VITE_TEST_LOGIN_NAME: process.env.VITE_TEST_LOGIN_NAME || ''
			},
			reuseExistingServer: true,
			timeout: 120000
		},
		{
			command:
				'npx firebase emulators:start --only firestore,auth --project todo-firebase-1a740 --non-interactive',
			url: 'http://127.0.0.1:9099',
			reuseExistingServer: true,
			timeout: 120000
		}
	],
	testDir: 'tests/e2e',
	timeout: 60000,
	workers: process.env.CI ? 1 : undefined,
	use: {
		baseURL: 'http://127.0.0.1:4173',
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
