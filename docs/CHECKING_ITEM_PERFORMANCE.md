# Checking Item Performance

## Summary

The confirmed cause of the first slow checkbox is that the UI waits for a Firestore snapshot to
apply the completion action. A directly opened list normally has a live action watcher, but an
aggregate route such as Today can render cached tasks from lists that were only hydrated once at
startup. The first action on one of those lists remains network-dependent until the activity feed
causes a watcher to be attached.

Large-state reducer and rendering work still scales with item count, but controlled measurements
put it in the millisecond range. It does not explain the one-second-plus first-click delay.

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
			dispatchOptimistically(
				'lists',
				list_id,
				$store.auth.uid,
				complete_item({ list_id, id, completed, completed_time, description: item.description })
			);
		}
	};
}
```

The fix uses the store's existing local-action rebasing path. It creates the Firestore document ID,
applies the action locally with `timestamp: null`, and writes the same action and document ID to
Firestore:

```ts
const actionDoc = doc(actions);
store.dispatch({ ...action, firebase_doc_id: actionDoc.id, timestamp: null });
await setDoc(actionDoc, { ...action, timestamp: serverTimestamp(), creator: uid });
```

When Firestore echoes that document, the rebasing reducer removes the matching local action before
applying the server action. Pending snapshots are deduplicated by document ID, and a rejected write
removes the local action so the UI rolls back.

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

## Secondary Costs

Once the completion reaches Redux, large-state reducer, rendering, DevTools, and cache work can add
synchronous cost. The measurements below show that these are worth monitoring, but are not large
enough to explain the cold first-click symptom by themselves.

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

A focused full-app browser test was added on September 2, 2026 in
`tests/e2e/011-cold-listener-checkbox/011-cold-listener-checkbox.spec.ts`.

### Cold Listener Timing

The baseline characterization used the startup state most relevant to the reported "first click in
the morning" symptom:

1. It creates tasks and waits for them to reach the app-level `TODOS` IndexedDB cache.
2. It closes the page and removes only Firestore's IndexedDB cache, retaining the app cache and
   authentication session.
3. It applies 1,200 ms of network latency and reloads the selected list.
4. It clicks one cached task immediately and records whether the selected-list listener is attached.
5. It clicks a second task after that listener is active, under the same network conditions.

Three Chromium executions produced:

| Run | Listener ready at first click | First click | Second click |
| --: | :---------------------------: | ----------: | -----------: |
|   1 |              no               |    4,141 ms |       116 ms |
|   2 |              no               |    4,133 ms |       120 ms |
|   3 |              no               |    4,130 ms |       120 ms |

In the repeated run, the cached UI became visible at about 3,665 ms after navigation and the first
click happened about 80 ms later. `watch from time ... on <list id>` did not appear until about
7,340 ms. The first task remained visible until about 7,875 ms. Once that watcher existed, the
second task disappeared in about 120 ms despite unchanged network latency.

This confirms the causal mechanism under controlled cold-start conditions: a checkbox action made
while the selected list has no watcher cannot reach Redux through the Firestore snapshot path.
The UI catches up only after startup attaches the watcher and Firestore delivers the action. The
artificial latency amplifies the window, so this test does not by itself establish the exact
production delay, but its first-only behavior matches the reported symptom closely.

### When The Watcher Became Delayed

The original eager watcher was introduced in `a781036` on November 9, 2022 (`Subscribe and unsub
for each list`). A `ListMenuItem` instantiated `watch('lists', listId)` synchronously. Commit
`2cc0b67` on November 16, 2022 (`Fix race condition for list creation`) moved that call behind the
editor and initial-list writes. Commit `4a119cf` on March 29, 2023 (`Attempt to reduce firebase
writes during app load`) replaced the unconditional writes with an editor `getDoc`, but continued
to await that remote operation before calling `watch`. Commit `9a53422` on May 3, 2023 moved the
logic into the central database startup path with the same setup-before-watch ordering.

Later activity-refresh changes appeared to add another gate, but detailed timing disproved that
interpretation on current main. The store's `subscribe` implementation invokes its callback
immediately, and the loading-status dispatch re-enters that callback. Consequently,
`loadList(currentListId)` starts while the activity query is still pending. In the controlled
baseline, `Refresh list subscriptions`, `Loading for`, and `Firebase: Setting up list` all logged at
6,145 ms. The editor `getDoc` completed at 7,361 ms and `watch` was called in the same millisecond.
The measured 1,216 ms watcher-setup gap was therefore the editor lookup, not the activity query.

The other large gap was before `loadList`: cached UI appeared at 3,675 ms, but list startup waited
for the first global-requests snapshot and did not begin until 6,145 ms. For cached sessions, those
two gates combined to make the UI interactive several seconds before its selected-list listener
existed.

### Current-List-First Experiment

The experiment now starts list loading immediately after app-cache hydration. For a list with a
cached action timestamp, it attaches the listener before the editor existence check; genuinely new
lists retain setup-before-watch ordering so the list-creation race remains guarded. It also records
an initial snapshot that arrives before activity discovery finishes, so startup completion cannot
miss that event.

Under the same 1,200 ms artificial latency, the selected-list watcher was registered before the
cached UI was displayed. Three repeated runs measured first-click updates of 120 ms, 113 ms, and
114 ms. Second-click updates were 111 ms, 114 ms, and 113 ms. The earlier baseline was approximately
4,140 ms for the first click and 120 ms for the second.

### Aggregate-View Production Reproduction

Manual testing of the preview found that the current-list-first change was incomplete. The browser
log showed the user on Today and clicking a task owned by `Routine`. That list had been populated by
the startup one-shot hydration path, but there was no `watch from time ... on <Routine id>` entry
before the click. The click triggered `Loading for`, then watcher setup, and the first callback
arrived 134 ms later in the captured log. Although that particular callback was below one second,
the UI was still gated on a network-dependent watcher that did not exist when the cached task was
rendered. This matches the reported preview behavior and explains why the direct-list test passed
while the real Today workflow still failed.

Watching every cached list would reverse the deliberate June 12, 2026 change in `ea503c3`
(`Hydrate startup lists without live watch fanout`). The regression test therefore covers the real
invariant instead: on an aggregate route, a cached task must disappear promptly even when its
source-list watcher is not yet active. With 1,200 ms artificial network latency, repeated runs of
the optimistic completion path updated the aggregate view in 13-23 ms without adding startup
listener fanout.

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

1. Confirmed cause of the first cold click: completion depended on a live Firestore watcher, while
   aggregate routes can render tasks whose source lists have no watcher.
2. Confirmed narrower direct-list issue: cached UI could appear before the selected-list watcher.
3. Secondary cost: whole-state processing around store dispatch, Redux DevTools, and cache
   persistence.
4. Smaller measured costs: reducer copying, `deepFreeze`, and hidden completed-list rebuilding.

## Likely Fix Directions

The likely fixes are structural:

- Apply checkbox completion through the existing local-action rebasing layer, then reconcile it by
  Firestore document ID. Roll back the local action if the write fails.
- On cached startup, retain the selected-list-first watcher improvement, while avoiding live
  watcher fanout across every cached list.
- Do not rebuild the hidden completed list when `showCompleted` is false.
- Maintain separate active/completed item id indexes so active views do not scan all historical completed items.
- Avoid copying the entire `itemIdToItem` map for a single-item update.
- Avoid deep-freezing large unchanged structures in production click paths.
- Consider virtualizing completed/history-heavy views.
- Consider archiving or compacting old completed items so current-task interactions do not pay for old history.

Verify the aggregate Today path on the preview, then use a production-device profile to decide
which secondary structural optimizations are justified.
