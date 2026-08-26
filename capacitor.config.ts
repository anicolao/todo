import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.stockgamblers.todo',
	appName: 'Todo',
	webDir: 'build',
	server: {
		url: 'https://todo-firebase-1a740.web.app'
	},
	plugins: {
		FirebaseAuthentication: {
			skipNativeAuth: true,
			providers: ['google.com']
		}
	}
};

export default config;
