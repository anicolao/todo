import { createReducer } from '$lib/redux';
import { createAction } from '@reduxjs/toolkit';

export interface CacheState {
	timestamp: number;
}

export const set_timestamp = createAction<number>('set_timestamp');

export const initialCacheState = {
	timestamp: 0,
	cacheLoadTime: 0,
} as CacheState;

export const cache = createReducer(initialCacheState, (r) => {
	r.addDefault((state, action) => {
		if(action.timestamp) {
			// action came from server
			state = { ...state };
			state.timestamp = action.timestamp;
		}
		return state;
	});
	r.addCase(set_timestamp, (state, action) => {
		state = { ...state };
		state.timestamp = action.payload;
		return state;
	});
	r.addDefault((state, action) => {
		if (action.type === "CACHE_LOADED@INIT") {
			return {...action.payload.cache, cacheLoadTime: action.payload.cache.timestamp };
		}
		return state;
	});
});
