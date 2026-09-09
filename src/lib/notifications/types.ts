export type NotificationRegistrationStatus =
	| 'registered'
	| 'denied'
	| 'unsupported'
	| 'disabled'
	| 'error';

export interface NotificationRegistration {
	status: NotificationRegistrationStatus;
	token?: string;
	error?: string;
}

export interface NotificationEnvelope {
	id?: string;
	title?: string;
	body?: string;
	data: Record<string, unknown>;
	action?: unknown;
}

export type NotificationListener = (notification: NotificationEnvelope) => void;

export interface NotificationClient {
	register(): Promise<NotificationRegistration>;
}
