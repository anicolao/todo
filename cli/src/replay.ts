// Yield during replay so status RPCs can report completed work even for large histories.
export async function replayInBatches<T>(
	values: T[],
	apply: (value: T) => void,
	progress: (processed: number, total: number) => void
) {
	progress(0, values.length);
	let batchStart = performance.now();
	for (let index = 0; index < values.length; index++) {
		apply(values[index]);
		const processed = index + 1;
		if (
			processed % 100 === 0 ||
			performance.now() - batchStart >= 20 ||
			processed === values.length
		) {
			progress(processed, values.length);
			await new Promise((resolve) => setTimeout(resolve, 0));
			batchStart = performance.now();
		}
	}
}
