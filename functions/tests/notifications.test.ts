import { describe, expect, it, vi } from 'vitest';
import {
	deliverNotification,
	notificationActionForListActivity,
	pendingShareReminder,
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
	it('redacts all invitation details from pending-share reminders', async () => {
		const send = vi.fn(async () => ({
			successCount: 1,
			failureCount: 0,
			responses: [{ success: true }]
		}));

		await deliverNotification('recipient', pendingShareReminder(), services(send));

		expect(send).toHaveBeenCalledWith({
			data: { action: JSON.stringify({ type: 'pending_share_reminder' }) },
			notification: {
				title: 'List invitation pending',
				body: 'Open TODO to accept or decline.',
				image: 'https://todo-firebase-1a740.web.app/brownCheck.png'
			},
			tokens: ['valid-token']
		});
	});

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

describe('list activity notification privacy', () => {
	const activity = {
		type: 'create_item',
		payload: { description: 'Private task text' }
	};
	const invitation = {
		id: 'invitation',
		action: { type: 'accept_pending_share', payload: 'shared-list' }
	};

	it('replaces item content with an accept-or-decline reminder while an invitation is pending', () => {
		expect(
			notificationActionForListActivity('recipient', 'shared-list', activity, [invitation])
		).toEqual({ type: 'pending_share_reminder' });
	});

	it('delivers item content only after the invitation is accepted', () => {
		expect(
			notificationActionForListActivity('recipient', 'shared-list', activity, [
				invitation,
				{
					id: 'decision',
					action: {
						type: 'accept_request',
						payload: { id: 'invitation' },
						creator: 'recipient'
					}
				}
			])
		).toBe(activity);
	});

	it('sends nothing after an invitation is declined', () => {
		expect(
			notificationActionForListActivity('recipient', 'shared-list', activity, [
				invitation,
				{
					id: 'decision',
					action: {
						type: 'reject_request',
						payload: { id: 'invitation' },
						creator: 'recipient'
					}
				}
			])
		).toBeUndefined();
	});

	it('uses the latest invitation when a declined share is sent again', () => {
		expect(
			notificationActionForListActivity('recipient', 'shared-list', activity, [
				invitation,
				{
					id: 'decision',
					action: {
						type: 'reject_request',
						payload: { id: 'invitation' },
						creator: 'recipient'
					}
				},
				{
					id: 'second-invitation',
					action: { type: 'accept_pending_share', payload: 'shared-list' }
				}
			])
		).toEqual({ type: 'pending_share_reminder' });
	});

	it('does not let the sender forge the recipient acceptance', () => {
		expect(
			notificationActionForListActivity('recipient', 'shared-list', activity, [
				invitation,
				{
					id: 'forged-decision',
					action: {
						type: 'accept_request',
						payload: { id: 'invitation' },
						creator: 'sender'
					}
				}
			])
		).toEqual({ type: 'pending_share_reminder' });
	});

	it('preserves legacy editor notifications when no share history exists', () => {
		expect(notificationActionForListActivity('recipient', 'shared-list', activity, [])).toBe(
			activity
		);
	});
});
