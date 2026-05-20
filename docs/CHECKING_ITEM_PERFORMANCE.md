# Checking Item Performance

## Summary

Checking off an item is likely slow on very large lists because the client does work proportional to the total number of items in the list, not just the number of visible active items.

The strongest current hypothesis is:

1. The completed item action is replayed into the local store.
2. The item reducer copies and freezes large list-level data structures.
3. Each `ItemList` recomputes its display array by scanning every item id in the list.
4. The hidden completed-items `ItemList` still builds its item array even when completed items are collapsed.

This fits the reported symptom: a list with thousands of completed items and only a few current items can still be slow when checking off one current item.

## Click Path

The checkbox click handler is in `src/lib/components/ItemDisplay.svelte`.

```ts
function complete(list_id: string, id: string, completed: boolean) {
	return () => {
		if (completed) {
			const sound = new Audio('/completed.mp3');
			sound.play();
		}
		if ($store.auth.uid) {
			const completed_time = new Date().getTime();
			const item = $store.items.listIdToListOfItems[list_id].itemIdToItem[id];
			dispatch(
				'lists',
				list_id,
				$store.auth.uid,
				complete_item({ list_id, id, completed, completed_time, description: item.description })
			);
		}
	};
}
```

`dispatch` in `src/lib/components/ActionLog.ts` writes the action to Firestore:

```ts
return addDoc(actions, { ...action, timestamp: serverTimestamp(), creator: uid });
```

The click handler does not await this promise, so the first visible delay is probably not caused by waiting for the network, Cloud Functions, or Firestore acknowledgement. The local snapshot/replay path is more likely.

## Expensive Store Update

The reducer for `complete_item` is in `src/lib/components/items.ts`.

It copies the list, the item, the entire `itemIdToItem` map for the list, and the top-level `listIdToListOfItems` map:

```ts
state = { ...state };
const list = { ...state.listIdToListOfItems[action.payload.list_id] };
let item = { ...list.itemIdToItem[action.payload.id] };
...
list.itemIdToItem = { ...list.itemIdToItem };
list.itemIdToItem[action.payload.id] = item;
state.listIdToListOfItems = { ...state.listIdToListOfItems };
state.listIdToListOfItems[action.payload.list_id] = { ...list };
return state;
```

The important line is:

```ts
list.itemIdToItem = { ...list.itemIdToItem };
```

That is an O(N) object copy where N is the number of items in the list, including completed historical items.

After the reducer runs, `src/lib/redux.ts` calls `deepFreeze(state)`. Since the copied `itemIdToItem` object is new, freezing also walks the large map:

```ts
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
```

So a single checkbox action can perform at least one full-list object copy plus a full-list freeze walk.

## Expensive List Rebuild

`src/lib/components/ItemList.svelte` rebuilds its local `items` array when list data changes.

```ts
function updateItemIds(
	filter: (listId: string, itemId: string) => boolean,
	comparator: ((a: TodoItem, b: TodoItem) => number) | null
) {
	items = [];
	listIds = $store.lists.visibleLists.filter(listIdMatcher);
	listIds.forEach((listId) => filterItems(listId, filter));
	if (comparator !== null) {
		items.sort(comparator);
	}
}
```

`filterItems` scans every item id in each matched list:

```ts
function filterItems(listId: string, filter: (listId: string, itemId: string) => boolean) {
	$store.items.listIdToListOfItems[listId]?.itemIds.forEach((itemId: string) => {
		const item = $store.items.listIdToListOfItems[listId]?.itemIdToItem[itemId];
		if (item && filter(listId, itemId)) {
			items.push({
				...item,
				id: itemId,
				animationId: itemId,
				listId,
				description: item.description
			});
		}
	});
}
```

The object literal passed to `items.push` creates a new render/display object for every matching item. It copies all `TodoItem` fields with `...item` and adds:

- `id`
- `animationId`
- `listId`
- `description`

For a completed list with 5,000 completed items, this can allocate about 5,000 new `ExtendedTodoItem` objects on each rebuild.

## Hidden Completed Items Still Rebuild

The selected-list page renders two `ItemList` components in `src/routes/(app)/lists/+page.svelte`:

```svelte
<ItemList listIdMatcher={selectedList(listId)} filter={completedItems(false)} />
<ItemList
	listIdMatcher={selectedList(listId)}
	filter={completedItems(true)}
	bind:hasItems
	show={showCompleted}
>
```

The completed list receives `show={showCompleted}`, but `show` only controls DOM rendering later in `ItemList.svelte`:

```svelte
{#if show}
	<div class="listContainer">...</div>
{/if}
```

It does not prevent `updateItemIds` or `filterItems` from running. That means the hidden completed list still scans all item ids and builds the completed `items` array.

This is probably the biggest mismatch between the UI and the work being done: "completed items hidden" does not mean "completed items skipped."

## Less Likely Causes

The Firestore write itself is less likely to be the immediate cause because the click handler does not await `addDoc`.

Cloud Functions are also unlikely to block the checkbox UI directly. A function may run after the action is written, but the local UI should already be updating from the action log.

The completion sound may add a small amount of work:

```ts
const sound = new Audio('/completed.mp3');
sound.play();
```

But that does not explain why the issue would correlate strongly with large lists.

## Possible Amplifier

`ActionLog.watch` uses metadata snapshots:

```ts
{
	includeMetadataChanges: true;
}
```

It also accepts local pending writes with no timestamp:

```ts
return !x.doc.data().timestamp || x.doc.data().timestamp.seconds > currentTime;
```

A single local action may therefore be processed once as a pending local write and again after the server timestamp arrives. The reducer has some timestamp guards, but the snapshot/store/render pipeline may still do extra work.

## Profiling Plan

Do not implement a fix until the hot path has been measured.

Start with two profiling passes:

1. Browser profile of a real or generated large list.
2. Focused synthetic timing of the suspected synchronous operations.

The browser profile should use Chrome DevTools Performance or Playwright tracing against a production build. The test case should check one active item on lists of increasing size:

- small: about 100 total items
- medium: about 1,000 total items
- large: about 5,000 total items
- very large: about 10,000 total items

For each size, keep only a few active items and make the rest completed. Run the same check-off interaction with completed items collapsed and expanded.

Record:

- total click-to-visible-update time
- scripting time
- rendering/layout time
- heap allocation during the interaction
- number of `ItemList` instances mounted on the route
- total item ids scanned by each mounted `ItemList`
- number of display objects built by each mounted `ItemList`

The focused synthetic timing should measure the suspected synchronous operations independently:

- copying `list.itemIdToItem` in `complete_item`
- freezing the copied state path in `deepFreeze`
- scanning item ids for the active filter
- scanning item ids for the completed filter
- constructing the `items.push({ ...item, id, animationId, listId })` display objects

Synthetic timing does not prove the UI behavior by itself. Its purpose is to show whether the suspected operations scale linearly with total list size and are large enough to justify deeper browser profiling.

Expected profile if this hypothesis is right:

- time grows with total `itemIds.length`
- the hidden completed `ItemList` still consumes time
- memory allocation spikes during `items.push({ ...item, ... })`
- disabling the completed `ItemList` or skipping rebuilds when `show === false` substantially improves the click

## Profiling Results

No full app browser profile has been captured yet.

Initial focused profiling was run on May 20, 2026 using generated list data. These measurements are not a substitute for profiling the real Svelte/Firebase app. They are a first pass to rank hypotheses before changing code.

### Synthetic Reducer And List Rebuild Timing

This pass measured the suspected synchronous operations in Chromium with five active items and the rest completed.

| Total items | Completed items | Reducer copy + freeze | Active display build | Completed display build |
| ----------: | --------------: | --------------------: | -------------------: | ----------------------: |
|         100 |              95 |              0.000 ms |             0.000 ms |                0.000 ms |
|       1,000 |             995 |              0.200 ms |             0.000 ms |                0.000 ms |
|       5,000 |           4,995 |              0.800 ms |             0.100 ms |                0.200 ms |
|      10,000 |           9,995 |              1.800 ms |             0.200 ms |                0.300 ms |
|      20,000 |          19,995 |              4.200 ms |             0.300 ms |                0.700 ms |
|      50,000 |          49,995 |             12.500 ms |             0.600 ms |                1.300 ms |

The result confirms linear scaling, but this isolated loop cost is too small to fully explain a large user-visible delay at only a few thousand items. It still matters because it runs synchronously and can combine with Svelte rendering, store notifications, Redux DevTools, local cache writes, and duplicate snapshot processing.

### Whole-State Processing Timing

`src/lib/store.ts` configures Redux DevTools with:

```ts
devTools: {
	maxAge: 100000;
}
```

Redux Toolkit enables the DevTools enhancer whenever `devTools` is truthy. In production builds this still composes with the browser Redux DevTools extension if the extension is installed. With a large todo state, each action may therefore require whole-state processing outside the application code.

Synthetic whole-state timing in Chromium:

| Total items | Approx JSON size | `JSON.stringify` | `structuredClone` |
| ----------: | ---------------: | ---------------: | ----------------: |
|       1,000 |          0.16 MB |         0.200 ms |          0.500 ms |
|       5,000 |          0.83 MB |         0.900 ms |          2.600 ms |
|      10,000 |          1.66 MB |         2.000 ms |          5.700 ms |
|      20,000 |          3.35 MB |         4.400 ms |         11.700 ms |
|      50,000 |          8.45 MB |        12.200 ms |         32.100 ms |

With heavier completed-item history and longer descriptions:

| Total items | History entries per item | Description chars | Approx JSON size | `JSON.stringify` | `structuredClone` |
| ----------: | -----------------------: | ----------------: | ---------------: | ---------------: | ----------------: |
|       5,000 |                        0 |                20 |          0.90 MB |         1.000 ms |          2.800 ms |
|       5,000 |                       10 |               100 |          1.61 MB |         1.600 ms |          3.500 ms |
|       5,000 |                      100 |               100 |          5.05 MB |         6.000 ms |         10.300 ms |
|      10,000 |                       10 |               100 |          3.22 MB |         3.300 ms |          7.300 ms |
|      10,000 |                      100 |               100 |         10.10 MB |        11.900 ms |         20.800 ms |

These measurements make Redux DevTools and whole-state cache/write paths important to test in the full browser profile. They could explain why the problem affects a power user with unusually large state, especially if they have the Redux DevTools extension installed.

### Current Read

The initial data supports this ranking:

1. Most likely to matter: whole-state processing around store dispatch, Redux DevTools, and cache persistence.
2. Still likely to matter: reducer object copying and `deepFreeze` on large list structures.
3. Likely smaller by itself: hidden completed `ItemList` display-object construction.
4. Still unmeasured: actual Svelte DOM update, FLIP animation, and browser layout cost on the real route.

The next required step is a full browser Performance profile of the real app interaction on a large list.

## Likely Fix Directions

The likely fixes are structural:

- Do not rebuild the hidden completed list when `showCompleted` is false.
- Maintain separate active/completed item id indexes so active views do not scan all historical completed items.
- Avoid copying the entire `itemIdToItem` map for a single-item update.
- Avoid deep-freezing large unchanged structures in production click paths.
- Consider virtualizing completed/history-heavy views.
- Consider archiving or compacting old completed items so current-task interactions do not pay for old history.

No fix should be selected until the profiling results identify the actual bottleneck.
