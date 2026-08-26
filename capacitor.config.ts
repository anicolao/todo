import { CapacitorConfig } from '@capacitor/cli';

const serverUrl =
	process.env.CAPACITOR_SERVER_URL || 'https://todo-firebase-1a740.web.app';

const config: CapacitorConfig = {
	appId: 'com.stockgamblers.todo',
	appName: 'Todo',
	webDir: 'build',
	server: {
		url: serverUrl,
		cleartext: serverUrl.startsWith('http://')
	},
	plugins: {
		FirebaseAuthentication: {
			skipNativeAuth: true,
			providers: ['google.com']
		}
	}
};

export default config;
