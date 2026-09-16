import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('$lib/firebase', () => ({ default: { firestore: {} } }));
vi.mock('firebase/firestore', () => ({
	collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }),
	doc: (parent: { path: string }) => ({ id: 'operation', parent }),
	serverTimestamp: () => 'server-time',
	writeBatch: vi.fn(),
	getDocs: vi.fn(),
	query: vi.fn(),
	orderBy: vi.fn(),
	setDoc: vi.fn()
}));
vi.mock('$lib/store', () => ({
	store: {
		getState: () => ({
			auth: { uid: 'me' },
			lists: { listIdToList: { list: 'Plans' } },
			requests: { outgoingRequests: [], completedRequests: [] }
		})
	},
	observeConfirmedActions: () => ({ promise: Promise.resolve(), cancel: vi.fn() }),
	discardLocalAction: vi.fn(),
	handleDocChanges: vi.fn(),
	writeCacheNow: vi.fn()
}));
import { writeBatch } from 'firebase/firestore';
import { writeCacheNow } from '$lib/store';
import { listSettingsSession } from '$lib/components/list-details-save';
beforeEach(() => {
	vi.clearAllMocks();
});
it('retry after acknowledged writes only completes refresh and does not send invitations again', async () => {
	const set = vi.fn();
	const commit = vi.fn().mockResolvedValue(undefined);
	vi.mocked(writeBatch).mockReturnValue({ set, commit } as any);
	vi.mocked(writeCacheNow)
		.mockRejectedValueOnce(new Error('cache unavailable'))
		.mockResolvedValueOnce(undefined);
	const session = listSettingsSession('list');
	await expect(session.share({ person: true })).rejects.toThrow('cache unavailable');
	expect(session.committed).toBe(true);
	await session.share({ person: true });
	expect(session.committed).toBe(false);
	expect(writeBatch).toHaveBeenCalledTimes(1);
	expect(commit).toHaveBeenCalledTimes(1);
	expect(set).toHaveBeenCalledTimes(2); // invitation plus sender tracking
	expect(writeCacheNow).toHaveBeenCalledTimes(2);
});
it('a rejected batch can be submitted again because nothing was acknowledged', async () => {
	const commit = vi
		.fn()
		.mockRejectedValueOnce(new Error('permission denied'))
		.mockResolvedValueOnce(undefined);
	vi.mocked(writeBatch).mockReturnValue({ set: vi.fn(), commit } as any);
	vi.mocked(writeCacheNow).mockResolvedValue(undefined);
	const session = listSettingsSession('list');
	await expect(session.share({ person: true })).rejects.toThrow('permission denied');
	expect(session.committed).toBe(false);
	await session.share({ person: true });
	expect(writeBatch).toHaveBeenCalledTimes(2);
});
