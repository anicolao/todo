import type { AnyAction } from "@reduxjs/toolkit";
import type { TypedActionCreator } from "@reduxjs/toolkit/dist/mapBuilders";


export type CaseType<T> = (state: T, action: AnyAction) => T;

export interface ReducerBuilder<T> {
  addCase: (actionCreator: TypedActionCreator<string>, reducer: CaseType<T>) => void;
}

export function createReducer<StateType>(initialState: StateType, reducers: (builder: ReducerBuilder<StateType>) => void) {
  const reducerMap: { [k: string]: CaseType<StateType> } = {};
  reducers({
    addCase: function (actionCreator, reducer) {
      reducerMap[actionCreator.type] = reducer;
    }
  })
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
  return (state: StateType | undefined, action: AnyAction): StateType => {
    if (state === undefined) {
      console.log(action.type);
      return deepFreeze(initialState);
    }
    if (reducerMap[action.type]) {
      return deepFreeze(reducerMap[action.type](state, action));
    }
    return state;
  };
}