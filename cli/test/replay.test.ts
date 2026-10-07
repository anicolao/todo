import { expect, test } from 'bun:test';
import { replayInBatches } from '../src/replay';
import { replayProgressReporter, replayProgressText } from '../src/progress';
import { SERVICE_VERSION, type ReplayProgress, type ServiceStatus } from '../src/types';

test('reports only completed actions, in order, and yields to status requests', async () => {
	const documents = Array.from({ length: 350 }, (_, index) => index);
	const applied: number[] = [];
	const reports: number[] = [];
	let yielded = false;
	setTimeout(() => {
		yielded = true;
	}, 0);
	await replayInBatches(
		documents,
		(document) => {
			applied.push(document);
			if (document === 100) expect(yielded).toBe(true);
		},
		(processed, total) => {
			expect(total).toBe(350);
			expect(processed).toBe(applied.length);
			reports.push(processed);
		}
	);
	expect(applied).toEqual(documents);
	expect(reports[0]).toBe(0);
	expect(reports.at(-1)).toBe(350);
	expect(reports.length).toBeGreaterThanOrEqual(5);
});

test('does not claim failed actions completed', async () => {
	const reports: number[] = [];
	await expect(
		replayInBatches(
			[1],
			() => {
				throw new Error('bad action');
			},
			(done) => reports.push(done)
		)
	).rejects.toThrow('bad action');
	expect(reports).toEqual([0]);
});

test('renders real counts without terminal controls and suppresses duplicate reports', () => {
	const replay: ReplayProgress = {
		completedWork: 50,
		stream: 'list',
		listName: 'Groceries\n\x1b[2J',
		listsCompleted: 1,
		listsTotal: 3,
		actionsProcessed: 50,
		actionsTotal: 100
	};
	const text = replayProgressText(replay);
	expect(text).toContain('Lists 1/3');
	expect(text).toContain('[==========          ] 50/100 actions processed');
	expect(text).not.toContain('\n');
	expect(text).not.toContain('\x1b');
	const writes: string[] = [];
	const reporter = replayProgressReporter({
		isTTY: false,
		write: (value: string) => {
			writes.push(value);
			return true;
		}
	} as typeof process.stderr);
	const status: ServiceStatus = {
		serviceVersion: SERVICE_VERSION,
		phase: 'hydrating',
		projectId: 'test',
		listCount: 3,
		itemCount: 0,
		replay
	};
	expect(reporter.update(status)).toBe(50);
	reporter.update(status);
	expect(reporter.update({ ...status, phase: 'ready' })).toBeUndefined();
	reporter.finish();
	reporter.update({ ...status, replay: { ...replay, actionsProcessed: 75 } });
	expect(writes).toEqual([`${text}\n`]);
});
