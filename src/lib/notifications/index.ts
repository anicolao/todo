import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { FCM } from '@capacitor-community/fcm';
import type { Messaging } from 'firebase/messaging';
import { CapacitorNotificationClient } from './capacitor';
import type { NotificationClient, NotificationRegistration } from './types';
import { WebNotificationClient } from './web';

class DisabledNotificationClient implements NotificationClient {
	async register(): Promise<NotificationRegistration> {
		return { status: 'disabled' };
	}
}

export type NotificationPlatform = 'disabled' | 'capacitor' | 'web';

export function selectNotificationPlatform(
	disabled: boolean,
	isNative: boolean
): NotificationPlatform {
	if (disabled) return 'disabled';
	return isNative ? 'capacitor' : 'web';
}

export interface NotificationCoordinatorOptions {
	disabled: boolean;
	messaging: Messaging | null;
	vapidKey: string;
}

type TokenListener = (token: string) => void | Promise<void>;

export class NotificationCoordinator {
	private readonly client: NotificationClient;
	private readonly tokenListeners = new Set<TokenListener>();
	private foregroundReferences = 0;
	private foregroundHandler?: () => void;

	constructor(client: NotificationClient) {
		this.client = client;
	}

	async register(): Promise<NotificationRegistration> {
		const result = await this.client.register();
		if (result.token) {
			for (const listener of this.tokenListeners) {
				void Promise.resolve(listener(result.token)).catch((error) => {
					console.error('Could not persist a refreshed notification token.', error);
				});
			}
		}
		return result;
	}

	onToken(listener: TokenListener): () => void {
		this.tokenListeners.add(listener);
		return () => this.tokenListeners.delete(listener);
	}

	startForegroundRefresh(shouldRefresh: () => boolean = () => true): () => void {
		this.foregroundReferences += 1;
		if (this.foregroundReferences === 1 && typeof document !== 'undefined') {
			this.foregroundHandler = () => {
				if (document.visibilityState === 'visible' && shouldRefresh()) {
					void this.register();
				}
			};
			document.addEventListener('visibilitychange', this.foregroundHandler);
		}

		return () => {
			this.foregroundReferences = Math.max(0, this.foregroundReferences - 1);
			if (this.foregroundReferences === 0 && this.foregroundHandler) {
				document.removeEventListener('visibilitychange', this.foregroundHandler);
				this.foregroundHandler = undefined;
			}
		};
	}
}

let coordinator: NotificationCoordinator | undefined;

export function getNotificationCoordinator(
	options: NotificationCoordinatorOptions
): NotificationCoordinator {
	if (coordinator) return coordinator;

	const platform = selectNotificationPlatform(options.disabled, Capacitor.isNativePlatform());
	let client: NotificationClient;
	if (platform === 'disabled') {
		client = new DisabledNotificationClient();
	} else if (platform === 'capacitor') {
		client = new CapacitorNotificationClient({ push: PushNotifications, fcm: FCM });
	} else {
		client = new WebNotificationClient({
			messaging: options.messaging,
			vapidKey: options.vapidKey
		});
	}
	coordinator = new NotificationCoordinator(client);
	return coordinator;
}

export type { NotificationRegistration } from './types';
