import { describe, expect, it } from 'vitest';
import {
	accessToken,
	main,
	parseArguments,
	registeredTokens
} from '../scripts/verify-ios-push.mjs';

function jsonResponse(body: unknown, status = 200): Response {
	return {
		json: async () => body,
		ok: status >= 200 && status < 300,
		status
	} as Response;
}

describe('iOS push verifier', () => {
	it('parses one target and the dry-run flag', () => {
		expect(parseArguments(['person@example.com', '--dry-run'])).toEqual({
			dryRun: true,
			help: false,
			targetEmail: 'person@example.com'
		});
		expect(() => parseArguments(['not-an-email'])).toThrow(
			'provide the Todo account email to test'
		);
		expect(() => parseArguments(['one@example.com', 'two@example.com'])).toThrow(
			'only one target email may be supplied'
		);
	});

	it('authenticates service-account JSON without consulting Firebase CLI state', async () => {
		let receivedOptions: Record<string, unknown> | undefined;
		class StubGoogleAuth {
			constructor(options: Record<string, unknown>) {
				receivedOptions = options;
			}

			async getAccessToken() {
				return 'service-account-token';
			}
		}

		const token = await accessToken({
			env: { FIREBASE_SERVICE_ACCOUNT: '{"client_email":"push@example.com"}' },
			GoogleAuthClass: StubGoogleAuth,
			loadFirebaseAuth: () => {
				throw new Error('Firebase CLI auth should not be loaded');
			}
		});

		expect(token).toBe('service-account-token');
		expect(receivedOptions).toEqual({
			credentials: { client_email: 'push@example.com' },
			keyFilename: undefined,
			scopes: ['https://www.googleapis.com/auth/cloud-platform']
		});
	});

	it('selects the requested Firebase CLI account when no service account is supplied', async () => {
		const token = await accessToken({
			env: { TODO_FIREBASE_ACCOUNT: 'operator@example.com' },
			loadFirebaseAuth: () => ({
				findAccountByEmail: (email: string) =>
					email === 'operator@example.com'
						? { tokens: { refresh_token: 'refresh-token' } }
						: undefined,
				getGlobalDefaultAccount: () => undefined,
				getAccessToken: async (refreshToken: string) => ({
					access_token: `access-for-${refreshToken}`
				})
			})
		});

		expect(token).toBe('access-for-refresh-token');
	});

	it('paginates registered tokens without logging or transforming them', async () => {
		const calls: string[] = [];
		const fetchImpl = async (input: string | URL | Request) => {
			const url = String(input);
			calls.push(url);
			if (url.includes('/users/')) {
				return jsonResponse({ fields: { uid: { stringValue: 'user-123' } } });
			}
			if (!url.includes('pageToken=')) {
				return jsonResponse({
					documents: [{ name: 'projects/project/databases/(default)/documents/x/token-one' }],
					nextPageToken: 'next-page'
				});
			}
			return jsonResponse({
				documents: [{ name: 'projects/project/databases/(default)/documents/x/token-two' }]
			});
		};

		await expect(
			registeredTokens('project', 'access-token', 'person@example.com', fetchImpl)
		).resolves.toEqual(['token-one', 'token-two']);
		expect(calls).toHaveLength(3);
		expect(calls[2]).toContain('pageToken=next-page');
	});

	it('reports only token indexes and error codes after delivery', async () => {
		const sensitiveTokens = ['SENSITIVE_TOKEN_ALPHA', 'SENSITIVE_TOKEN_BETA'];
		const deliveredTokens: string[] = [];
		const output: string[] = [];
		const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
			const url = String(input);
			if (url.includes('/users/')) {
				return jsonResponse({ fields: { uid: { stringValue: 'user-123' } } });
			}
			if (url.includes('/documents/notifications/')) {
				return jsonResponse({
					documents: sensitiveTokens.map((token) => ({
						name: `projects/project/databases/(default)/documents/x/${token}`
					}))
				});
			}

			const request = JSON.parse(String(init?.body));
			deliveredTokens.push(request.message.token);
			if (request.message.token === sensitiveTokens[0]) return jsonResponse({ name: 'accepted' });
			return jsonResponse(
				{
					error: {
						details: [{ errorCode: 'THIRD_PARTY_AUTH_ERROR' }],
						status: 'UNAUTHENTICATED'
					}
				},
				401
			);
		};

		const summary = await main({
			argv: ['person@example.com'],
			env: { FIREBASE_PROJECT_ID: 'project' },
			fetchImpl,
			getAccessToken: async () => 'access-token',
			log: (line: string) => output.push(line)
		});

		expect(deliveredTokens).toEqual(sensitiveTokens);
		expect(summary).toEqual({
			failureCount: 1,
			failures: [{ code: 'THIRD_PARTY_AUTH_ERROR', index: 1 }],
			mode: 'delivery',
			successCount: 1,
			target: 'person@example.com',
			tokenCount: 2
		});
		expect(output).toHaveLength(1);
		for (const token of sensitiveTokens) expect(output[0]).not.toContain(token);
	});
});
