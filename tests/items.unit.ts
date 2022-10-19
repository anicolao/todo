import { expect } from 'chai';
import { describe, it } from 'vitest';

import { complete_item, create_item, describe_item, initialState, items, reorder_item, star_item, type ItemsState } from '$lib/components/items';

describe('items', () => {
  function createItem(state: ItemsState, id: string, description: string) {
    return items(state, create_item({ id, description }));
  }
  it('can create a new item', () => {
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    const nextState = createItem(initialState, id, description);
    expect(nextState.itemIds.length).to.equal(1);
    expect(nextState.itemIds[0]).to.equal(id);
    expect(nextState.itemIdToItem).to.deep.include({ "abcd1234": { completed: false, starred: false, description } });
  });

  it('creates new items at the top of the list', () => {
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, id, description);
    expect(nextState.itemIds.length).to.equal(1);
    expect(nextState.itemIds[0]).to.equal(id);
    expect(nextState.itemIdToItem).to.deep.include({ "abcd1234": { completed: false, starred: false, description } });
    nextState = createItem(nextState, "id1", "first item ever");
    expect(nextState.itemIds.length).to.equal(2);
    expect(nextState.itemIds[0]).to.equal("id1");
  });

  it('can redescribe an item', () => {
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, id, description);
    expect(nextState.itemIds.length).to.equal(1);
    expect(nextState.itemIds[0]).to.equal(id);
    expect(nextState.itemIdToItem).to.deep.include({ "abcd1234": { completed: false, starred: false, description } });
    nextState = items(nextState, describe_item({ id, description: "newly minted" }));
    expect(nextState.itemIds.length).to.equal(1);
    expect(nextState.itemIds[0]).to.equal(id);
    expect(nextState.itemIdToItem).to.deep.include({ "abcd1234": { completed: false, starred: false, description: "newly minted" } });
  });

  it('can complete an item', () => {
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, id, description);
    expect(nextState.itemIdToItem[id].completed).to.equal(false);
    nextState = items(nextState, complete_item({ id, completed: true }));
    expect(nextState.itemIdToItem[id].completed).to.equal(true);
  });

  it('can uncomplete an item', () => {
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, id, description);
    expect(nextState.itemIdToItem[id].completed).to.equal(false);

    nextState = items(nextState, complete_item({ id, completed: true }));
    expect(nextState.itemIdToItem[id].completed).to.equal(true);

    nextState = items(nextState, complete_item({ id, completed: false }));
    expect(nextState.itemIdToItem[id].completed).to.equal(false);
  });

  it('can star an item', () => {
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, id, description);
    expect(nextState.itemIdToItem[id].starred).to.equal(false);
    nextState = items(nextState, star_item({ id, starred: true }));
    expect(nextState.itemIdToItem[id].starred).to.equal(true);
  });

  it('can unstar an item', () => {
    const id = "abcd1234";
    const description = "My List Item Creation Test";
    let nextState = createItem(initialState, id, description);
    expect(nextState.itemIdToItem[id].starred).to.equal(false);

    nextState = items(nextState, star_item({ id, starred: true }));
    expect(nextState.itemIdToItem[id].starred).to.equal(true);

    nextState = items(nextState, star_item({ id, starred: false }));
    expect(nextState.itemIdToItem[id].starred).to.equal(false);
  });

  it('reorders an item', () => {
    let nextState = createItem(initialState, "idA", "Item A");
    expect(nextState.itemIds.length).to.equal(1);
    nextState = createItem(nextState, "idB", "Item B");
    expect(nextState.itemIds.length).to.equal(2);

    expect(nextState.itemIds[0]).to.equal("idB");
    expect(nextState.itemIds[1]).to.equal("idA");

    nextState = items(nextState, reorder_item({ id: "idA", goes_before: "idB" }));

    expect(nextState.itemIds[0]).to.equal("idA");
    expect(nextState.itemIds[1]).to.equal("idB");
  });

  it('reorders to the end', () => {
    let nextState = createItem(initialState, "idA", "Item A");
    expect(nextState.itemIds.length).to.equal(1);
    nextState = createItem(nextState, "idB", "Item B");
    expect(nextState.itemIds.length).to.equal(2);

    expect(nextState.itemIds[0]).to.equal("idB");
    expect(nextState.itemIds[1]).to.equal("idA");

    nextState = items(nextState, reorder_item({ id: "idB" }));

    expect(nextState.itemIds[0]).to.equal("idA");
    expect(nextState.itemIds[1]).to.equal("idB");
  });

  it('throws when a reordered item does not exist', () => {
    try {
      let nextState = createItem(initialState, "idA", "Item A");
      expect(nextState.itemIds.length).to.equal(1);
      expect(nextState.itemIds[0]).to.equal("idA");
      nextState = items(nextState, reorder_item({ id: "idB" }));
    } catch (e) {
      expect(e).to.equal('ERROR: itemid idB not found in items array');
    }
  });

  it('reorders when item before does not exist', () => {
    try {
      let nextState = createItem(initialState, "idA", "Item A");
      expect(nextState.itemIds.length).to.equal(1);
      expect(nextState.itemIds[0]).to.equal("idA");
      nextState = items(nextState, reorder_item({ id: "idA", goes_before: "idC" }));
    } catch (e) {
      expect(e).to.equal('ERROR: itemid idC not found in items array');
    }
  });
});