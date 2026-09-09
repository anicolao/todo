import type { PluginListenerHandle, PermissionState } from '@capacitor/core';
import type {
	ActionPerformed,
	PushNotificationSchema,
	PushNotificationsPlugin,
	RegistrationError,
	Token
} from '@capacitor/push-notifications';
import type { FCMPlugin } from '@capacitor-community/fcm';
import type {
	NotificationClient,
	NotificationEnvelope,
	NotificationListener,
	NotificationRegistration
} from './types';

export interface CapacitorNotificationDependencies {
	push: Pick<
		PushNotificationsPlugin,
		'addListener' | 'checkPermissions' | 'requestPermissions' | 'register'
	>;
	fcm: Pick<FCMPlugin, 'getToken'>;
	timeoutMilliseconds?: number;
	onReceived?: NotificationListener;
	onAction?: NotificationListener;
}

interface RegistrationWaiter {
	resolve: () => void;
	reject: (error: Error) => void;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function decodeNotification(notification: PushNotificationSchema): NotificationEnvelope {
	const data =
		notification.data && typeof notification.data === 'object'
			? (notification.data as Record<string, unknown>)
			: {};
	let action: unknown;
	if (typeof data.action === 'string') {
		try {
			action = JSON.parse(data.action);
		} catch {
			action = undefined;
		}
	}

	return {
		id: notification.id,
		title: notification.title,
		body: notification.body,
		data,
		action
	};
}

export class CapacitorNotificationClient implements NotificationClient {
	private readonly dependencies: CapacitorNotificationDependencies;
	private listenersPromise?: Promise<PluginListenerHandle[]>;
	private registrationPromise?: Promise<NotificationRegistration>;
	private registrationWaiter?: RegistrationWaiter;

	constructor(dependencies: CapacitorNotificationDependencies) {
		this.dependencies = dependencies;
	}

	register(): Promise<NotificationRegistration> {
		if (!this.registrationPromise) {
			this.registrationPromise = this.performRegistration().finally(() => {
				this.registrationPromise = undefined;
			});
		}
		return this.registrationPromise;
	}

	private async installListeners(): Promise<PluginListenerHandle[]> {
		if (!this.listenersPromise) {
			this.listenersPromise = Promise.all([
				this.dependencies.push.addListener('registration', (_token: Token) => {
					// On iOS this is an APNs token. It is only a readiness signal and
					// must never be persisted in TODO's FCM token fields.
					this.registrationWaiter?.resolve();
					this.registrationWaiter = undefined;
				}),
				this.dependencies.push.addListener('registrationError', (error: RegistrationError) => {
					this.registrationWaiter?.reject(new Error(error.error));
					this.registrationWaiter = undefined;
				}),
				this.dependencies.push.addListener(
					'pushNotificationReceived',
					(notification: PushNotificationSchema) => {
						const decoded = decodeNotification(notification);
						console.info('Push notification received.', {
							id: decoded.id,
							title: decoded.title,
							hasAction: decoded.action !== undefined
						});
						this.dependencies.onReceived?.(decoded);
					}
				),
				this.dependencies.push.addListener(
					'pushNotificationActionPerformed',
					(performed: ActionPerformed) => {
						const decoded = decodeNotification(performed.notification);
						console.info('Push notification opened.', {
							id: decoded.id,
							actionId: performed.actionId,
							hasAction: decoded.action !== undefined
						});
						this.dependencies.onAction?.(decoded);
					}
				)
			]).catch((error) => {
				this.listenersPromise = undefined;
				throw error;
			});
		}
		return this.listenersPromise;
	}

	private async permission(): Promise<PermissionState> {
		let permission = (await this.dependencies.push.checkPermissions()).receive;
		if (permission === 'prompt' || permission === 'prompt-with-rationale') {
			permission = (await this.dependencies.push.requestPermissions()).receive;
		}
		return permission;
	}

	private waitForNativeRegistration(): { promise: Promise<void>; cancel: () => void } {
		const timeoutMilliseconds = this.dependencies.timeoutMilliseconds ?? 15_000;
		let cancel = () => undefined;
		const promise = new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => {
				if (this.registrationWaiter?.reject === rejectRegistration) {
					this.registrationWaiter = undefined;
				}
				reject(new Error('Timed out waiting for native push registration.'));
			}, timeoutMilliseconds);
			const resolveRegistration = () => {
				clearTimeout(timeout);
				resolve();
			};
			const rejectRegistration = (error: Error) => {
				clearTimeout(timeout);
				reject(error);
			};
			this.registrationWaiter = {
				resolve: resolveRegistration,
				reject: rejectRegistration
			};
			cancel = () => {
				clearTimeout(timeout);
				if (this.registrationWaiter?.reject === rejectRegistration) {
					this.registrationWaiter = undefined;
				}
				resolve();
			};
		});
		return { promise, cancel };
	}

	private async performRegistration(): Promise<NotificationRegistration> {
		try {
			await this.installListeners();
			if ((await this.permission()) !== 'granted') {
				return { status: 'denied' };
			}

			const nativeRegistration = this.waitForNativeRegistration();
			try {
				await this.dependencies.push.register();
			} catch (error) {
				nativeRegistration.cancel();
				throw error;
			}
			await nativeRegistration.promise;

			const token = (await this.dependencies.fcm.getToken()).token.trim();
			if (!token) {
				throw new Error('Firebase Cloud Messaging returned an empty token.');
			}
			return { status: 'registered', token };
		} catch (error) {
			const message = errorMessage(error);
			console.error('Notification registration failed.', { message });
			return { status: 'error', error: message };
		}
	}
}
