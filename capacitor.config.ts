import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.stockgamblers.todo',
	appName: 'Todo',
	webDir: 'build',
	bundledWebRuntime: false,
	plugins: {
		FirebaseAuthentication: {
			skipNativeAuth: true,
			providers: ['google.com']
		}
	}
};

export default config;
