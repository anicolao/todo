import { devices, type PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
	webServer: [
		{
			command: 'npm run build && npm run preview',
			port: 4173,
			env: {
				VITE_USE_FIREBASE_EMULATOR: 'true'
			},
			reuseExistingServer: true
		},
		{
			command: 'npx firebase emulators:start --only firestore',
			port: 8080,
			reuseExistingServer: true
		}
	],
	testDir: 'tests/e2e',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'on-first-retry'
	},
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
				isMobile: true,
				hasTouch: true
			}
		}
	]
};

export default config;
