import { createReducer } from '$lib/redux';

export const CURRENT_SCHEMA_VERSION = 3;

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
