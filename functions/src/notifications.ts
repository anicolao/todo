export interface NotificationAction {
	type: string;
	payload?: {
		description?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
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

function makeNotification(action: NotificationAction) {
	let title = 'Test title';
	const body = action.payload?.description ?? '';
	const image = 'https://todo-firebase-1a740.web.app/brownCheck.png';
	if (action.type === 'create_item') {
		title = 'New Todo Item';
	} else if (action.type === 'complete_item') {
		title = 'Todo Completed';
	} else if (action.type === 'accept_pending_share') {
		title = 'List Shared';
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
