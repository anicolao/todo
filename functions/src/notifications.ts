export interface NotificationAction {
	type: string;
	payload?: unknown;
	[key: string]: unknown;
}

export interface RequestActionRecord {
	id: string;
	action: NotificationAction;
}

export interface NotificationMessage {
	data: { action: string };
	notification: {
		title: string;
		body: string;
		image: string;
	};
	tokens: string[];
}

export interface NotificationSendResponse {
	success: boolean;
	error?: {
		code?: string;
		message?: string;
	};
}

export interface NotificationBatchResponse {
	successCount: number;
	failureCount: number;
	responses: NotificationSendResponse[];
}

export interface NotificationServices {
	listTokens: (userId: string) => Promise<string[]>;
	send: (message: NotificationMessage) => Promise<NotificationBatchResponse>;
	deleteToken: (userId: string, token: string) => Promise<unknown>;
	log: (message: string, details?: Record<string, unknown>) => void;
}

const staleTokenErrors = new Set([
	'messaging/invalid-registration-token',
	'messaging/registration-token-not-registered'
]);

export function pendingShareReminder(): NotificationAction {
	// This is notification data, not a persisted reducer action. Keep it free of
	// list, sender, and item data because an unaccepted invitation may be spam.
	return { type: 'pending_share_reminder' };
}

function payloadString(action: NotificationAction, field: string): string | undefined {
	if (typeof action.payload !== 'object' || action.payload === null) return undefined;
	const value = (action.payload as Record<string, unknown>)[field];
	return typeof value === 'string' ? value : undefined;
}

function affectedListId(action: NotificationAction): string | undefined {
	if (typeof action.payload === 'string') return action.payload;
	return payloadString(action, 'id');
}

/**
 * Select what, if anything, an editor may learn from a list activity push.
 *
 * Records must be in persisted timestamp order. An editor with no share
 * history is an owner or a legacy collaborator and retains existing behavior.
 */
export function notificationActionForListActivity(
	recipientId: string,
	listId: string,
	activity: NotificationAction,
	requestRecords: RequestActionRecord[]
): NotificationAction | undefined {
	const decisions = new Map<string, 'accepted' | 'rejected'>();
	for (const { action } of requestRecords) {
		if (
			(action.type !== 'accept_request' && action.type !== 'reject_request') ||
			action.creator !== recipientId
		) {
			continue;
		}
		const requestId = payloadString(action, 'id');
		if (requestId) {
			decisions.set(requestId, action.type === 'accept_request' ? 'accepted' : 'rejected');
		}
	}

	let relationship: 'accepted' | 'pending' | 'declined' | 'removed' = 'accepted';
	for (const { id, action } of requestRecords) {
		if (
			(action.type !== 'accept_pending_share' && action.type !== 'revoke_share') ||
			affectedListId(action) !== listId
		) {
			continue;
		}
		const decision = decisions.get(id);
		if (action.type === 'accept_pending_share') {
			relationship =
				decision === 'accepted' ? 'accepted' : decision === 'rejected' ? 'declined' : 'pending';
		} else {
			// Revocation is automatic. Only a rejected revocation leaves the share active.
			relationship = decision === 'rejected' ? 'accepted' : 'removed';
		}
	}

	if (relationship === 'pending') return pendingShareReminder();
	if (relationship === 'declined' || relationship === 'removed') return undefined;
	return activity;
}

function makeNotification(action: NotificationAction) {
	let title = 'Test title';
	let body = payloadString(action, 'description') ?? '';
	const image = 'https://todo-firebase-1a740.web.app/brownCheck.png';
	if (action.type === 'create_item') {
		title = 'New Todo Item';
	} else if (action.type === 'complete_item') {
		title = 'Todo Completed';
	} else if (action.type === 'accept_pending_share') {
		title = 'List Shared';
	} else if (action.type === 'pending_share_reminder') {
		title = 'List invitation pending';
		body = 'Open TODO to accept or decline.';
	}
	return {
		title,
		body,
		image
	};
}

export async function deliverNotification(
	userId: string,
	action: NotificationAction,
	services: NotificationServices
): Promise<void> {
	const tokens = await services.listTokens(userId);
	if (tokens.length === 0) {
		services.log('No notification tokens registered.', { userId });
		return;
	}

	const response = await services.send({
		data: { action: JSON.stringify(action) },
		notification: makeNotification(action),
		tokens
	});

	services.log('Notification multicast completed.', {
		userId,
		tokenCount: tokens.length,
		successCount: response.successCount,
		failureCount: response.failureCount
	});

	const deletions: Promise<unknown>[] = [];
	response.responses.forEach((result, index) => {
		if (result.success) return;
		const code = result.error?.code ?? 'unknown';
		services.log('Notification delivery failed.', { userId, tokenIndex: index, code });
		if (staleTokenErrors.has(code)) {
			deletions.push(services.deleteToken(userId, tokens[index]));
		}
	});
	await Promise.all(deletions);
}
