# Labels Design

## Goal

Labels let a user group existing lists under a named sidebar entry without moving,
renaming, duplicating, or changing the underlying lists. From the user's point of
view, the primary workflow is:

1. Open the list edit dialog from the pencil in the sidebar.
2. Create a new label containing the current list, or add the current list to an
   existing label.
3. See that label in the list-of-lists sidebar, by default at the top.
4. Open the label to see a combined task view for the lists selected by the
   label query.

The important system constraint is that labels should not be a separate metadata
system. A label should be represented like a list:

- It has an id that participates in `visibleLists`.
- It has a name and a position in the existing sidebar order.
- It has a document under the same `lists/{id}` tree as ordinary lists.
- It has an action log under `lists/{id}/actions`.
- Its actions construct a query view instead of task items.

The only global action needed for this feature is `create_label`. All edits to a
label after creation are label-document actions, just as task edits are list
document actions.

## Current Architecture

The app already has two action-log levels:

- The user's global action stream builds the user's list-of-lists metadata:
  creation, visibility, ordering, and sharing acceptance.
- Each `lists/{id}/actions` stream builds the state for that document.

Ordinary list documents replay actions into task-list state. Label documents
should replay actions into label-query state. This keeps labels aligned with the
existing event-sourced model instead of adding special global metadata for label
membership.

Today, the `lists` reducer owns:

- `visibleLists`: ordered ids shown in the sidebar.
- `listIdToList`: id to display name.
- `listIdToTimestamp`: latest loaded document-action timestamp for cache refresh.

Label ids should be stored in `visibleLists` alongside ordinary list ids. They
should participate in the same ordering, sharing, and visibility mechanics as
ordinary lists. The app will need enough metadata to know which renderer to use
for a visible id, but labels should not get a separate `visibleLabels` order or a
separate sidebar model.

## Global Action

Add exactly one global action:

```ts
export const create_label = createAction<{
	id: string;
	name: string;
}>('create_label');
```

`create_label` should behave like `create_list` from the sidebar's point of view:

- Insert the id into `visibleLists`.
- Put new labels at the top of `visibleLists` by default.
- Store the display name in `listIdToList`.
- Mark the id as a label so the sidebar routes it to the label view.
- Create the backing `lists/{id}` document/action stream just as list creation
  creates the backing list stream.

`create_label` should not contain the label query. Creating a useful label from a
list edit dialog is a two-log operation: the global stream creates the visible
document id, and the new label document stream receives an initial query action
that defines which lists the label matches.

There should not be global actions for adding/removing a list from a label,
renaming a label, deleting a label's query clauses, or changing the label query.
Those are actions on the label document itself.

## Document Type Metadata

The app needs to distinguish visible ids at render time:

```ts
export type ListDocumentType = 'list' | 'label';

export interface ListsState {
	visibleLists: string[];
	listIdToList: { [key: string]: string };
	listIdToType: { [key: string]: ListDocumentType };
	listIdToTimestamp: { [key: string]: number };
}
```

`create_list` should set `listIdToType[id] = 'list'`.
`create_label` should set `listIdToType[id] = 'label'`.

This is metadata about the document id in the sidebar. It does not make labels a
separate storage system; it lets one ordered `visibleLists` array contain both
kinds of entries.

Reducers should not special-case old cached states that are missing this field.
Instead, adding `listIdToType` should bump the global materialized-state schema
version so old caches are discarded and rebuilt from the action logs.

## Label Document State

Add a label state reducer that is fed by actions from `lists/{labelId}/actions`.
It should be keyed by the same ids used in `visibleLists`:

```ts
export interface LabelState {
	query: LabelQuery;
}

export interface LabelsState {
	labelIdToLabel: { [labelId: string]: LabelState };
}
```

This state is analogous to item state for ordinary lists:

- Ordinary list action stream: `lists/{listId}/actions` -> items/list content.
- Label action stream: `lists/{labelId}/actions` -> label query.

The existing document watch/cache machinery should watch label ids the same way
it watches list ids. The reducer that consumes the document actions determines
whether those actions update items or label query state.

## Schema Version

Add a top-level materialized-state schema version:

```ts
export const CURRENT_SCHEMA_VERSION = 2;

export interface GlobalState {
	schemaVersion: number;
	auth: AuthState;
	uiSettings: UiSettingsState;
	ui: UiState;
	lists: ListsState;
	items: ItemsState;
	labels: LabelsState;
	requests: RequestsState;
	cache: CacheState;
	users: UsersState;
}
```

The exact value is arbitrary; the rule is what matters. Every materialized Redux
state written to IndexedDB should include `schemaVersion:
CURRENT_SCHEMA_VERSION`. When reading cached state:

1. If `cachedState.schemaVersion` is missing, discard the cached state.
2. If `cachedState.schemaVersion !== CURRENT_SCHEMA_VERSION`, discard the cached
   state.
3. Only dispatch `CACHE_LOADED@INIT` when the version matches.
4. After discarding a cache, replay from Firebase action logs from scratch.

This keeps reducers simple. Reducers only need to construct the current schema
from their current initial state and action replay. They should not contain
fallbacks for missing fields from older cache shapes.

Whenever a reducer slice changes shape in a way that would make an older cached
state incomplete, stale, or ambiguous, bump `CURRENT_SCHEMA_VERSION`. This labels
change should bump it because it adds `listIdToType`, label query state, and
last-known inaccessible-list metadata.

## Query Language

The query language should be general enough to cover both user-created labels and
the existing built-in query views such as All, Today, and Starred. Those views
already compile to closely related primitives:

- `ItemList` receives a `listIdMatcher` to decide which task-list ids to scan.
- `ItemList` receives an item `filter` to decide which tasks to show.
- Some views pass a `comparator` to produce a cross-list sorted result.
- The All view differs mostly in presentation: it iterates `visibleLists` and
  renders a grouped result for each visible entry.

A stored label query should be a boolean expression. The first user-created
labels only need `or` plus `id` predicates:

```ts
export type LabelQuery = OrQuery | IdPredicate;

export interface OrQuery {
	type: 'or';
	predicates: LabelQuery[];
}

export interface IdPredicate {
	type: 'id';
	id: string;
}
```

An `id` predicate names a document id from the same id space used by
`visibleLists`. If the id names a task list, it resolves to that task list. If the
id names a label, it resolves by evaluating that label's query. The compiler must
detect cycles and render a label-cycle error rather than recursing forever.

A label containing three lists is represented as:

```ts
{
	type: 'or',
	predicates: [
		{ type: 'id', id: 'X' },
		{ type: 'id', id: 'Y' },
		{ type: 'id', id: 'Z' }
	]
}
```

This corresponds to:

```text
id:X OR id:Y OR id:Z
```

This is not a one-off list-id disjunction type. It is the first small subset of a
real boolean expression tree. Future predicates can be added without changing the
top-level shape, for example:

```ts
{ type: 'and', predicates: [...] }
{ type: 'not', predicate: ... }
{ type: 'starred' }
{ type: 'completed' }
{ type: 'due_today' }
{ type: 'text_contains', text: '...' }
```

The first implementation only needs to compile `or` and `id` into the same view
primitives that `ItemList` already consumes.

## Built-In Query Views

The existing special routes can be described as predefined query views:

- All: iterate each id in `visibleLists`, resolve that visible entry, filter to
  incomplete items, and render results grouped by the visible entry's name.
- Starred: resolve the visible entries, filter to starred incomplete items, sort
  by descending `starTimestamp`, and show source list names.
- Today: resolve the visible entries, filter to incomplete items that are starred
  or due today, sort starred items first and otherwise by due date, and show
  source list names.
- By Date: resolve the visible entries, filter to incomplete dated items, sort by
  due date, and show source list names.
- Completed: resolve the visible entries, filter to completed or previously
  completed repeating items, sort by descending completed timestamp, and enable
  undo.

Labels should use this same model. A label created from list ids is equivalent to
the All view with a narrower list query:

```ts
{
	lists: {
		type: 'or',
		predicates: [
			{ type: 'id', id: 'X' },
			{ type: 'id', id: 'Y' }
		]
	},
	items: { type: 'not', predicate: { type: 'completed' } },
	presentation: { groupBy: 'list' }
}
```

The persisted first version can store only the `lists` expression in the label
document and let the label route supply the default item filter/presentation:
incomplete tasks grouped by source list. The compiler should still be shaped so
the built-in views and future labels share entry resolution, item filtering, and
presentation instead of growing separate predicate systems.

## Visible Entry Resolution

The query compiler should have a single way to resolve ids from `visibleLists`:

1. If `listIdToType[id] === 'list'`, the id resolves to one task-list group.
2. If `listIdToType[id] === 'label'`, the id resolves by replaying and compiling
   that label document's query.
3. If the id is referenced but inaccessible, it resolves to an inaccessible-list
   placeholder group.

This makes labels first-class visible entries while still allowing the renderer to
produce task rows. It also makes the All view a useful guide for implementation:
All is a grouped view over every visible entry, not a separate sidebar structure.

## Label Document Actions

Label document actions should mutate the label query. A minimal set is:

```ts
export const set_label_query = createAction<{
	label_id: string;
	query: LabelQuery;
}>('set_label_query');

export const add_label_predicate = createAction<{
	label_id: string;
	predicate: LabelQuery;
}>('add_label_predicate');

export const remove_label_predicate = createAction<{
	label_id: string;
	predicate: LabelQuery;
}>('remove_label_predicate');
```

For the first UI workflow, adding the current list to an existing label can
dispatch `add_label_predicate({ label_id, predicate: { type: 'id', id: listId } })`
to the label's own action stream:

```ts
dispatch('lists', labelId, uid, add_label_predicate(...));
```

Creating a new label from the list edit dialog should:

1. Generate a new id.
2. Dispatch `create_label` to the global action stream.
3. Create/watch the label document.
4. Dispatch an initial label-document action that sets the query to:

```ts
{
	type: 'or',
	predicates: [{ type: 'id', id: currentListId }]
}
```

Reducer rules:

- `set_label_query` replaces the query.
- `add_label_predicate` appends to an `or` query if the predicate is not already
  present.
- `remove_label_predicate` removes matching predicates.
- Query actions should be idempotent where possible so replay and duplicate
  delivery are harmless.

Renaming a label should use the same document-level naming approach as ordinary
lists. If ordinary list names are defined by `rename_list` actions in
`lists/{id}/actions`, label names should use that same action rather than
introducing `rename_label`.

## Sidebar UI

Labels participate in `visibleLists`; they are not shown from a separate
`visibleLabels` structure and should not be segregated into a different sidebar
section.

For the first implementation, new labels should be inserted at the top of
`visibleLists`. Existing list reordering behavior can move labels and lists
together once the drag code knows how to render both document types. If that is
too much for the first implementation, labels can still be shown at the top while
using the same persisted `visibleLists` order.

Clicking a visible id should route based on `listIdToType[id]`:

```text
list  -> /lists?listId=ID
label -> /labels?labelId=ID
```

The sidebar row should use the renderer implied by `listIdToType[id]`. This is a
display distinction, not a separate ordering or sharing model.

## List Edit Dialog UI

The list edit dialog should add a "Labels" section below sharing. It should be
optimized for the current ordinary list because the user entered the dialog from
that list.

Controls:

- Existing labels: show a checkbox list of label documents. Checked means the
  current list id is matched by that label's query. Toggling dispatches a
  label-document action to add or remove an id predicate.
- New label: a text field and add button. Creating a label dispatches
  `create_label({ id, name })`, then initializes the label document query with an
  `or` query containing the current list id predicate.

Validation:

- Trim label names.
- Disable creating a label with an empty name.
- Allow duplicate names only if existing list names already allow duplicates; if
  we want stricter behavior, enforce it uniformly later.

The dialog should persist label membership edits to the label document action
stream. Label membership edits should not be global actions.

## Label View

Add a route:

```text
src/routes/(app)/labels/+page.svelte
```

The route should:

- Read `labelId` from the URL.
- Look up and compile that label document's query.
- Set the app icon and title from `listIdToList[labelId]`.
- Render the default label view as incomplete tasks grouped by matched source,
  matching the All view's grouped presentation over a narrowed list set.
- Use source names in group headers so tasks reveal their source list or label.
- Render inaccessible referenced lists as explicit placeholders rather than
  silently dropping them.

For the first implementation, label views should not allow cross-list drag
reordering. Reordering across multiple underlying list action logs is ambiguous.

## Loading and Cache Behavior

Because labels are entries in `visibleLists`, startup should include them in the
same document refresh policy as ordinary lists. A visible label id should be
watched/loaded so its query can be replayed from `lists/{labelId}/actions`.

Opening a label view requires two layers of loaded state:

1. The label document actions, so the app knows the query.
2. The visible entries matched by that query. Task-list entries provide task
   rows; label entries recursively provide the entries selected by their own
   query; inaccessible entries provide placeholders.

Once the label query is known, the route should ensure the matched accessible ids
are loaded or watched using the existing document refresh path. Labels should not
introduce a second watch system; they should ask the existing document watch
machinery to load the ids selected by the query.

## Sharing Semantics

Labels should be shareable exactly like ordinary lists. A label id is just another
document id in `visibleLists`, and the existing share request flow should work for
labels as it does for task lists:

- Sharing a label grants access to the label document and its query action log.
- Sharing a label does not automatically grant access to every list referenced by
  the query.
- If the recipient already has access to a referenced list, that list renders
  normally inside the label view.
- If the recipient does not have access to a referenced list, the label view
  should show an inaccessible-list placeholder for that reference.

The same edit dialog sharing UI can be used for labels and ordinary lists because
sharing is document-id based. The dialog can vary only the label/list membership
controls shown for ordinary lists.

## Inaccessible List References

An `id` predicate is a durable reference. It should not be deleted or hidden just
because the current user cannot load that list today.

When a label query references an id that the current user cannot access, render an
entry named:

```text
Inaccessible List
```

If the client has historical metadata from a time when the user could access that
list, the placeholder should include it, for example:

```text
Inaccessible List - Old List Name
Inaccessible List - Old List Name (Owner Name)
```

To support this, the client should keep last-known list metadata separately from
current visibility:

```ts
export interface LastKnownListInfo {
	name?: string;
	ownerUid?: string;
	ownerEmail?: string;
}

export interface ListsState {
	visibleLists: string[];
	listIdToList: { [key: string]: string };
	listIdToType: { [key: string]: ListDocumentType };
	listIdToLastKnownInfo: { [id: string]: LastKnownListInfo };
	listIdToTimestamp: { [key: string]: number };
}
```

`delete_list` and `revoke_share` can remove a list id from `visibleLists` while
leaving `listIdToLastKnownInfo[id]` intact. Query compilation should preserve
inaccessible `id` references as displayable groups with no task rows, rather than
filtering them out.

## Migration

There should be no field-level migration for `listIdToType`,
`listIdToLastKnownInfo`, label query state, or any future materialized-state shape
change. The migration strategy is schema-version invalidation:

- The cache reader checks the top-level `schemaVersion` before dispatching
  `CACHE_LOADED@INIT`.
- Missing or mismatched versions cause the cache to be ignored.
- The app replays global actions and document actions from scratch.
- The current reducers materialize a complete state with all current fields set.
- The next cache write stores that complete state with the current schema version.

This avoids special defaults and stale-field assumptions. The only persistent
source of truth remains the action logs; the IndexedDB cache is an optimization
for a specific schema version.

## Testing Plan

Unit tests:

- `create_label` inserts the new id at the top of `visibleLists`.
- `create_label` records `listIdToType[id] === 'label'`.
- Cache loading discards cached state when `schemaVersion` is missing.
- Cache loading discards cached state when `schemaVersion` differs from
  `CURRENT_SCHEMA_VERSION`.
- Cache loading accepts cached state only when `schemaVersion` matches.
- Replaying from scratch after cache discard materializes `listIdToType`,
  `listIdToLastKnownInfo`, and label query state through current reducers.
- Label reducer can replay `set_label_query` into a query state.
- `add_label_predicate` is idempotent.
- `remove_label_predicate` is idempotent.
- Query compilation for `or` plus `id` matches the expected list ids.
- Built-in All, Starred, Today, By Date, and Completed views can be represented as
  predefined query view specs over the same compiler primitives.
- Query compilation preserves inaccessible `id` references as placeholder groups.
- Revoking access removes the id from current visibility but preserves
  last-known list metadata for inaccessible placeholders.

Component or route tests:

- The list edit dialog creates a new label containing the current list.
- The list edit dialog adds/removes the current list from an existing label by
  dispatching actions to the label document stream.
- The sidebar displays labels from `visibleLists` and navigates labels to the
  label route.
- The label route renders tasks from all matched accessible sources and shows
  source names.
- The label route shows `Inaccessible List` placeholders for referenced lists the
  user cannot currently access.
- Sharing a label shares the label document without implicitly sharing every list
  referenced by the label query.

Manual verification:

- Create label from list A.
- Add list B to that label.
- Open the label and confirm tasks from A and B appear.
- Confirm the label appears at the top of the same sidebar list.
- Share the label with another user and confirm accessible referenced lists render
  while inaccessible references show placeholders.
- Reorder the sidebar and confirm labels participate in the visible order once
  reordering is implemented for mixed document types.

## Open Questions

- Should `create_label` directly write the initial label-document action, or
  should the UI dispatch the global creation action and the initial query action
  as two explicit writes?
- Should mixed label/list drag reordering be part of the first implementation, or
  can labels render at the top while still being stored in `visibleLists`?
