import { createReducer } from '$lib/redux';

// Version 6 caches may have skipped global actions after an invalid reorder.
// Rebuild them from Firestore once the replay reducer can handle those events.
export const CURRENT_SCHEMA_VERSION = 7;

export function isCompatibleCachedState(cachedState: any) {
	return cachedState?.schemaVersion === CURRENT_SCHEMA_VERSION;
}

export const schemaVersion = createReducer(CURRENT_SCHEMA_VERSION, (r) => {
	r.addDefault((state, action) => {
		if (action.type === 'CACHE_LOADED@INIT') {
			return action.payload.schemaVersion;
		}
		return state;
	});
});
