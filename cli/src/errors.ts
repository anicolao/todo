import type { RpcErrorValue } from './types';

export class TodoServiceError extends Error {
	readonly code: string;
	readonly details?: unknown;

	constructor(code: string, message: string, details?: unknown) {
		super(message);
		this.name = 'TodoServiceError';
		this.code = code;
		this.details = details;
	}
}

export function errorValue(error: unknown): RpcErrorValue {
	if (error instanceof TodoServiceError) {
		return {
			code: error.code,
			message: error.message,
			...(error.details ? { details: error.details } : {})
		};
	}
	if (error instanceof Error) {
		return { code: 'runtime_error', message: error.message };
	}
	return { code: 'runtime_error', message: String(error) };
}

export function requireObject(value: unknown, name = 'params'): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new TodoServiceError('usage', `${name} must be an object`);
	}
	return value as Record<string, unknown>;
}

export function optionalString(value: unknown, name: string): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== 'string') throw new TodoServiceError('usage', `${name} must be a string`);
	return value;
}

export function requiredString(value: unknown, name: string): string {
	const result = optionalString(value, name);
	if (result === undefined || result.trim() === '') {
		throw new TodoServiceError('usage', `${name} is required`);
	}
	return result;
}
