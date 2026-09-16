import { describe, expect, it, vi } from 'vitest';
import {
	deliverNotification,
	type NotificationBatchResponse,
	type NotificationServices
} from '../src/notifications';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise;
	});
	return { promise, resolve };
}

function services(
	send: NotificationServices['send'],
	deleteToken: NotificationServices['deleteToken'] = vi.fn(async () => undefined)
): NotificationServices {
	return {
		listTokens: vi.fn(async () => ['valid-token']),
		send,
		deleteToken,
		log: vi.fn()
	};
}

describe('notification delivery', () => {
	it('does not finish until Firebase finishes sending', async () => {
		const pendingSend = deferred<NotificationBatchResponse>();
		const sendStarted = deferred<void>();
		const send = vi.fn(() => {
			sendStarted.resolve();
			return pendingSend.promise;
		});
		const notificationServices = services(send);
		let finished = false;

		const delivery = deliverNotification(
			'recipient',
			{ type: 'complete_item', payload: { description: 'Labels item' } },
			notificationServices
		).then(() => {
			finished = true;
		});

		await sendStarted.promise;
		expect(send).toHaveBeenCalledOnce();
		expect(finished).toBe(false);

		pendingSend.resolve({ successCount: 1, failureCount: 0, responses: [{ success: true }] });
		await delivery;
		expect(finished).toBe(true);
	});

	it('awaits stale-token deletion and preserves tokens after transient failures', async () => {
		const pendingDeletion = deferred<void>();
		const deletionStarted = deferred<void>();
		const deleteToken = vi.fn(() => {
			deletionStarted.resolve();
			return pendingDeletion.promise;
		});
		const notificationServices = services(
			vi.fn(async () => ({
				successCount: 0,
				failureCount: 2,
				responses: [
					{ success: false, error: { code: 'messaging/registration-token-not-registered' } },
					{ success: false, error: { code: 'messaging/server-unavailable' } }
				]
			})),
			deleteToken
		);
		notificationServices.listTokens = vi.fn(async () => ['stale-token', 'retryable-token']);
		let finished = false;

		const delivery = deliverNotification(
			'recipient',
			{ type: 'create_item', payload: { description: 'New item' } },
			notificationServices
		).then(() => {
			finished = true;
		});

		await deletionStarted.promise;
		expect(deleteToken).toHaveBeenCalledOnce();
		expect(deleteToken).toHaveBeenCalledWith('recipient', 'stale-token');
		expect(finished).toBe(false);

		pendingDeletion.resolve();
		await delivery;
		expect(finished).toBe(true);
	});
});
