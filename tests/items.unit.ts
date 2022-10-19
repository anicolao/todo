import { expect } from 'chai';
import { describe, it } from 'vitest';

import { complete_item, create_item, describe_item, initialState, items, reorder_item, star_item, type ItemsState } from '$lib/components/items';

describe('items', () => {
  function createItem(state: ItemsState, list_id: string, id: string, description: string) {
    return items(state, create_item({ list_id, id, description }));
  }

  it('can create a new item', () => {
    const list_id = "List 9";
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    const nextState = createItem(initialState, list_id, id, description);

    const list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIds.length).to.equal(1);
    expect(list.itemIds[0]).to.equal(id);
    expect(list.itemIdToItem).to.deep.include({ "abcd1234": { completed: false, starred: false, description } });
  });

  it('creates new items at the top of the list', () => {
    const list_id = "List 9";
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, list_id, id, description);
    let list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIds.length).to.equal(1);
    expect(list.itemIds[0]).to.equal(id);
    expect(list.itemIdToItem).to.deep.include({ "abcd1234": { completed: false, starred: false, description } });

    nextState = createItem(nextState, list_id, "id1", "first item ever");
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIds.length).to.equal(2);
    expect(list.itemIds[0]).to.equal("id1");
  });

  it('can redescribe an item', () => {
    const list_id = "List 9";
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, list_id, id, description);
    let list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIds.length).to.equal(1);
    expect(list.itemIds[0]).to.equal(id);
    expect(list.itemIdToItem).to.deep.include({ "abcd1234": { completed: false, starred: false, description } });

    nextState = items(nextState, describe_item({ id, list_id, description: "newly minted" }));
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIds.length).to.equal(1);
    expect(list.itemIds[0]).to.equal(id);
    expect(list.itemIdToItem).to.deep.include({ "abcd1234": { completed: false, starred: false, description: "newly minted" } });
  });

  it('can complete an item', () => {
    const list_id = "List 9";
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, list_id, id, description);
    let list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].completed).to.equal(false);

    nextState = items(nextState, complete_item({ list_id, id, completed: true }));
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].completed).to.equal(true);
  });

  it('can uncomplete an item', () => {
    const list_id = "List 9";
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, list_id, id, description);
    let list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].completed).to.equal(false);

    nextState = items(nextState, complete_item({ id, list_id, completed: true }));
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].completed).to.equal(true);

    nextState = items(nextState, complete_item({ id, list_id, completed: false }));
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].completed).to.equal(false);
  });

  it('can star an item', () => {
    const list_id = "List 9";
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, list_id, id, description);
    let list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].starred).to.equal(false);

    nextState = items(nextState, star_item({ id, list_id, starred: true }));
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].starred).to.equal(true);
  });

  it('can unstar an item', () => {
    const list_id = "List 9";
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, list_id, id, description);
    let list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].starred).to.equal(false);

    nextState = items(nextState, star_item({ list_id, id, starred: true }));
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].starred).to.equal(true);

    nextState = items(nextState, star_item({ list_id, id, starred: false }));
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIdToItem[id].starred).to.equal(false);
  });

  it('reorders an item', () => {
    const list_id = "List 9";
    let nextState = createItem(initialState, list_id, "idA", "Item A");
    let list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIds.length).to.equal(1);

    nextState = createItem(nextState, list_id, "idB", "Item B");
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIds.length).to.equal(2);

    expect(list.itemIds[0]).to.equal("idB");
    expect(list.itemIds[1]).to.equal("idA");

    nextState = items(nextState, reorder_item({ list_id, id: "idA", goes_before: "idB" }));
    list = nextState.listIdToListOfItems[list_id];

    expect(list.itemIds[0]).to.equal("idA");
    expect(list.itemIds[1]).to.equal("idB");
  });

  it('reorders to the end', () => {
    const list_id = "List 9";
    let nextState = createItem(initialState, list_id, "idA", "Item A");
    let list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIds.length).to.equal(1);
    nextState = createItem(nextState, list_id, "idB", "Item B");
    list = nextState.listIdToListOfItems[list_id];
    expect(list.itemIds.length).to.equal(2);

    expect(list.itemIds[0]).to.equal("idB");
    expect(list.itemIds[1]).to.equal("idA");

    nextState = items(nextState, reorder_item({ list_id, id: "idB" }));
    list = nextState.listIdToListOfItems[list_id];

    expect(list.itemIds[0]).to.equal("idA");
    expect(list.itemIds[1]).to.equal("idB");
  });

  it('throws when a reordered item does not exist', () => {
    const list_id = "List 9";
    try {
      let nextState = createItem(initialState, list_id, "idA", "Item A");
      let list = nextState.listIdToListOfItems[list_id];
      expect(list.itemIds.length).to.equal(1);
      expect(list.itemIds[0]).to.equal("idA");
      nextState = items(nextState, reorder_item({ list_id, id: "idB" }));
    } catch (e) {
      expect(e).to.equal('ERROR: itemid idB not found in items array');
    }
  });

  it('reorders when item before does not exist', () => {
    const list_id = "List 9";
    try {
      let nextState = createItem(initialState, list_id, "idA", "Item A");
      let list = nextState.listIdToListOfItems[list_id];
      expect(list.itemIds.length).to.equal(1);
      expect(list.itemIds[0]).to.equal("idA");
      nextState = items(nextState, reorder_item({ list_id, id: "idA", goes_before: "idC" }));
    } catch (e) {
      expect(e).to.equal('ERROR: itemid idC not found in items array');
    }
  });
});