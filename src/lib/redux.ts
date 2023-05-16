import type { AnyAction } from '@reduxjs/toolkit';
import type { TypedActionCreator } from '@reduxjs/toolkit/dist/mapBuilders';

export type CaseType<T> = (state: T, action: AnyAction) => T;

export interface ReducerBuilder<T> {
	addDefault: (reducer: CaseType<T>) => void;
	addCase: (actionCreator: TypedActionCreator<string>, reducer: CaseType<T>) => void;
}

export function createReducer<StateType>(
	initialState: StateType,
	reducers: (builder: ReducerBuilder<StateType>) => void
) {
	const defaultReducers: CaseType<StateType>[] = [];
	const reducerMap: { [k: string]: CaseType<StateType> } = {};
	reducers({
		addDefault: function (reducer) {
			defaultReducers.push(reducer);
		},
		addCase: function (actionCreator, reducer) {
			reducerMap[actionCreator.type] = reducer;
		}
	});
	function deepFreeze(x: any) {
		if (typeof x === 'object' && !Object.isFrozen(x)) {
			for (const k in x) {
				if (!Object.isFrozen(x[k])) {
					x[k] = deepFreeze(x[k]);
				}
			}
		}
		return Object.freeze(x);
	}
	return (incomingState: StateType | undefined, action: AnyAction): StateType => {
		if (incomingState === undefined) {
			console.log(action.type);
			return deepFreeze(initialState);
		}
		let state: StateType = incomingState;
		defaultReducers.forEach(r => state = r(state, action));
		if (reducerMap[action.type]) {
			state = reducerMap[action.type](state, action);
		}
		return deepFreeze(state);
	};
}
