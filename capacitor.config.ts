import { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.CAPACITOR_SERVER_URL || 'https://todo-firebase-1a740.web.app';
const appId = process.env.CAPACITOR_APP_ID || 'com.stockgamblers.todo';

const config: CapacitorConfig = {
	appId,
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
		},
		PushNotifications: {
			presentationOptions: []
		}
	}
};

export default config;
