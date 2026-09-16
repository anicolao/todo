import { createReducer } from '$lib/redux';
import { createAction } from '@reduxjs/toolkit';

export interface CacheState {
	timestamp: number;
	boundaryActionIds?: string[];
}

export const set_timestamp = createAction<number>('set_timestamp');

export const initialCacheState = {
	timestamp: 0,
	cacheLoadTime: 0
} as CacheState;

export const cache = createReducer(initialCacheState, (r) => {
	r.addDefault((state, action) => {
		if (action.timestamp && action.isANormalAction === false) {
			// action came from server, and is a "request" action,
			// not a "lists" action
			state = { ...state };
			if (action.timestamp >= state.timestamp) {
				const ids = action.timestamp === state.timestamp ? state.boundaryActionIds ?? [] : [];
				state.timestamp = action.timestamp;
				state.boundaryActionIds = action.firebase_doc_id
					? [...new Set([...ids, action.firebase_doc_id])]
					: ids;
			}
		}
		return state;
	});
	r.addCase(set_timestamp, (state, action) => {
		state = { ...state };
		state.timestamp = action.payload;
		return state;
	});
	r.addDefault((state, action) => {
		if (action.type === 'CACHE_LOADED@INIT') {
			return { ...action.payload.cache, cacheLoadTime: action.payload.cache.timestamp };
		}
		return state;
	});
});
