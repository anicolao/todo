import type { MessagePayload, Messaging, Unsubscribe } from 'firebase/messaging';
import { getToken, onMessage } from 'firebase/messaging';
import type { NotificationClient, NotificationRegistration } from './types';

export interface WebNotificationDependencies {
	messaging: Messaging | null;
	vapidKey: string;
	requestPermission?: () => Promise<NotificationPermission>;
}

export class WebNotificationClient implements NotificationClient {
	private readonly dependencies: WebNotificationDependencies;
	private unsubscribe?: Unsubscribe;

	constructor(dependencies: WebNotificationDependencies) {
		this.dependencies = dependencies;
	}

	async register(): Promise<NotificationRegistration> {
		if (typeof Notification === 'undefined' || this.dependencies.messaging === null) {
			return { status: 'unsupported' };
		}

		try {
			let permission = Notification.permission;
			if (permission === 'default') {
				permission = await (
					this.dependencies.requestPermission ?? Notification.requestPermission
				)();
			}
			if (permission !== 'granted') {
				return { status: 'denied' };
			}

			if (!this.unsubscribe) {
				this.unsubscribe = onMessage(this.dependencies.messaging, (payload: MessagePayload) => {
					console.info('Web push notification received.', {
						messageId: payload.messageId,
						hasAction: typeof payload.data?.action === 'string'
					});
				});
			}

			const token = (
				await getToken(this.dependencies.messaging, { vapidKey: this.dependencies.vapidKey })
			).trim();
			if (!token) {
				throw new Error('Firebase Cloud Messaging returned an empty token.');
			}
			return { status: 'registered', token };
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error('Web notification registration failed.', { message });
			return { status: 'error', error: message };
		}
	}
}
