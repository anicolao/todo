const { expect: untypedExpect } = await import('@esm-bundle' + '/chai');
export const expect: typeof import('chai').expect = untypedExpect;

import { initialState, create_list, delete_list, lists, type ListsState } from './lists';

describe('lists', () => {
  function createList(state: ListsState, id: string, name: string) {
    return lists(state, create_list({ id, name }));
  }
  it('can create a new list', () => {
    const id = "abcd1234";
    const name = "My List Creation Test";
    const nextState = createList(initialState, id, name);
    expect(nextState.visibleLists.length).to.equal(1);
    expect(nextState.visibleLists[0]).to.equal(id);
    expect(nextState.listIdToList).to.deep.include({ "abcd1234": name });
  });

  it('can create a new list that is first', () => {
    let nextState = createList(initialState, "id1", "First List");
    nextState = createList(nextState, "id2", "Top List");
    expect(nextState.visibleLists.length).to.equal(2);
    expect(nextState.visibleLists[0]).to.equal("id2");
  });
});