import { expect } from 'chai';
import { describe, it } from 'vitest';

import { CapacitorNotificationClient, decodeNotification } from '$lib/notifications/capacitor';
import { NotificationCoordinator, selectNotificationPlatform } from '$lib/notifications';
import type { NotificationClient } from '$lib/notifications/types';

type NativeListener = (value: any) => void;

function nativeHarness(permission: 'prompt' | 'granted' | 'denied' = 'prompt') {
	const calls: string[] = [];
	const listeners = new Map<string, NativeListener>();
	let permissionRequests = 0;
	const push = {
		async addListener(name: string, listener: NativeListener) {
			calls.push(`listen:${name}`);
			listeners.set(name, listener);
			return { remove: async () => undefined };
		},
		async checkPermissions() {
			calls.push('checkPermissions');
			return { receive: permission };
		},
		async requestPermissions() {
			permissionRequests += 1;
			calls.push('requestPermissions');
			return { receive: 'granted' as const };
		},
		async register() {
			calls.push('register');
			listeners.get('registration')?.({ value: 'apns-token-must-not-be-persisted' });
		}
	};
	const fcm = {
		async getToken() {
			calls.push('getToken');
			return { token: 'fcm-token-for-the-backend' };
		}
	};
	return { calls, listeners, push, fcm, permissionRequests: () => permissionRequests };
}

describe('notification platform selection', () => {
	it('prefers disabled, then Capacitor, then web', () => {
		expect(selectNotificationPlatform(true, true)).to.equal('disabled');
		expect(selectNotificationPlatform(false, true)).to.equal('capacitor');
		expect(selectNotificationPlatform(false, false)).to.equal('web');
	});
});

describe('Capacitor notification registration', () => {
	it('installs every listener before permission and registration', async () => {
		const harness = nativeHarness();
		const client = new CapacitorNotificationClient(harness as any);

		const result = await client.register();

		expect(result).to.deep.equal({
			status: 'registered',
			token: 'fcm-token-for-the-backend'
		});
		expect(harness.calls).to.deep.equal([
			'listen:registration',
			'listen:registrationError',
			'listen:pushNotificationReceived',
			'listen:pushNotificationActionPerformed',
			'checkPermissions',
			'requestPermissions',
			'register',
			'getToken'
		]);
		expect(harness.permissionRequests()).to.equal(1);
	});

	it('does not prompt or register after permission was denied', async () => {
		const harness = nativeHarness('denied');
		const client = new CapacitorNotificationClient(harness as any);

		expect(await client.register()).to.deep.equal({ status: 'denied' });
		expect(harness.permissionRequests()).to.equal(0);
		expect(harness.calls).not.to.include('register');
		expect(harness.calls).not.to.include('getToken');
	});

	it('coalesces simultaneous registration and allows a later retry', async () => {
		const harness = nativeHarness('granted');
		let attempts = 0;
		harness.push.register = async () => {
			harness.calls.push('register');
			attempts += 1;
			if (attempts === 1) {
				harness.listeners.get('registrationError')?.({ error: 'APNs unavailable' });
			} else {
				harness.listeners.get('registration')?.({ value: 'new-apns-token' });
			}
		};
		const client = new CapacitorNotificationClient(harness as any);

		const firstAttempts = await Promise.all([client.register(), client.register()]);
		expect(firstAttempts[0].status).to.equal('error');
		expect(firstAttempts[1].status).to.equal('error');
		expect(attempts).to.equal(1);

		expect((await client.register()).token).to.equal('fcm-token-for-the-backend');
		expect(attempts).to.equal(2);
	});

	it('returns a retryable error when native registration times out', async () => {
		const harness = nativeHarness('granted');
		harness.push.register = async () => {
			harness.calls.push('register');
		};
		const client = new CapacitorNotificationClient({
			...(harness as any),
			timeoutMilliseconds: 1
		});

		const result = await client.register();
		expect(result.status).to.equal('error');
		expect(result.error).to.contain('Timed out');
	});

	it('decodes action data without executing or persisting it', () => {
		const action = { type: 'item_completed', id: 'item-1' };
		const decoded = decodeNotification({
			id: 'notification-1',
			title: 'Updated',
			body: 'A task changed',
			data: { action: JSON.stringify(action) }
		});
		expect(decoded.action).to.deep.equal(action);
		expect(decoded.data.action).to.equal(JSON.stringify(action));
	});
});

describe('notification coordinator', () => {
	it('publishes only returned FCM tokens and keeps registration repeatable', async () => {
		let registrations = 0;
		const client: NotificationClient = {
			async register() {
				registrations += 1;
				return { status: 'registered', token: `fcm-${registrations}` };
			}
		};
		const coordinator = new NotificationCoordinator(client);
		const tokens: string[] = [];
		const unsubscribe = coordinator.onToken((token) => {
			tokens.push(token);
		});

		await coordinator.register();
		await coordinator.register();
		unsubscribe();
		await coordinator.register();

		expect(tokens).to.deep.equal(['fcm-1', 'fcm-2']);
		expect(registrations).to.equal(3);
	});
});
