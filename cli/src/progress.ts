import type { ReplayProgress, ServiceStatus } from './types';

export function replayProgressText(progress: ReplayProgress) {
	const label =
		progress.stream === 'global'
			? 'Account history'
			: `Lists ${progress.listsCompleted}/${progress.listsTotal} · ${
					progress.listName || 'Untitled List'
			  }`;
	const total = progress.actionsTotal;
	const done = progress.actionsProcessed;
	const filled = total ? Math.floor((done / total) * 20) : 0;
	const bar = total
		? `[${'='.repeat(filled)}${' '.repeat(20 - filled)}] ${done}/${total} actions processed`
		: 'waiting for action history';
	// List names are untrusted text; keep terminal controls out of the status line.
	return `${label} · ${bar}`.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
}

export function replayProgressReporter(output = process.stderr) {
	let previous = '';
	let shown = false;
	let finished = false;
	return {
		update(status: ServiceStatus | undefined) {
			if (finished || status?.phase !== 'hydrating' || !status.replay) return undefined;
			const line = replayProgressText(status.replay);
			if (line !== previous) {
				output.write(output.isTTY ? `\r\x1b[2K${line}` : `${line}\n`);
				previous = line;
				shown = true;
			}
			return status.replay.completedWork;
		},
		finish() {
			finished = true;
			if (shown && output.isTTY) output.write('\n');
		}
	};
}
