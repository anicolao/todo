# Labels Design

## Goal

Labels let a user group existing lists under a named sidebar entry without moving,
renaming, duplicating, or changing the underlying lists. From the user's point of
view, the primary workflow is:

1. Open the list edit dialog from the pencil in the sidebar.
2. Create a new label that contains the current list, or add the current list to
   an existing label.
3. See that label in the list-of-lists sidebar, by default at the top.
4. Open the label to see a combined task view for the lists included in the label.

From the system's point of view, a label is a persisted query over lists. The
first supported query shape is a disjunction of list ids:

```text
id:X OR id:Y OR id:Z
```

That query has a user-visible name and an ordered position in the same sidebar
area as ordinary lists.

## Current Architecture

The existing list metadata lives in the `lists` reducer. It contains:

- `visibleLists`: ordered list ids for the sidebar.
- `listIdToList`: list id to display name.
- `listIdToTimestamp`: latest loaded list-action timestamp for cache refresh.

List metadata actions are persisted in the user's global action stream. List item
actions are persisted in each list's own action stream. Views use `ItemList` with
a `listIdMatcher` and item `filter` predicate to render tasks from one or more
lists.

Labels should follow this architecture:

- Label metadata belongs in the global action stream because labels are part of a
  user's personal sidebar organization.
- Label membership does not belong in per-list action streams because adding a
  list to a label should not affect collaborators' view of the list.
- Label rendering can reuse `ItemList` because `ItemList` already supports
  arbitrary list selection through `listIdMatcher`.

## Data Model

Add labels as a first-class part of `ListsState`:

```ts
export interface LabelQuerySpec {
	type: 'list_id_or';
	listIds: string[];
}

export interface Label {
	id: string;
	name: string;
	query: LabelQuerySpec;
}

export interface ListsState {
	visibleLists: string[];
	visibleLabels: string[];
	listIdToList: { [key: string]: string };
	labelIdToLabel: { [key: string]: Label };
	listIdToTimestamp: { [key: string]: number };
}
```

`visibleLabels` is separate from `visibleLists` so the app does not confuse label
ids with real list ids. The sidebar can interleave the two later if needed, but
for this feature labels should render above ordinary lists by default.

The first implementation should support only `type: 'list_id_or'`. That keeps the
stored representation structured and avoids needing to parse user-authored query
text. The UI can display it as label membership, while the implementation can
compile it to a predicate equivalent to:

```ts
const ids = new Set(label.query.listIds);
const listIdMatcher = (listId: string) => ids.has(listId);
```

## Actions

Add global actions:

```ts
export const create_label = createAction<{
	id: string;
	name: string;
	listIds: string[];
}>('create_label');

export const rename_label = createAction<{
	id: string;
	name: string;
}>('rename_label');

export const delete_label = createAction<string>('delete_label');

export const add_list_to_label = createAction<{
	labelId: string;
	listId: string;
}>('add_list_to_label');

export const remove_list_from_label = createAction<{
	labelId: string;
	listId: string;
}>('remove_list_from_label');

export const reorder_label = createAction<{
	id: string;
	goes_before?: string;
}>('reorder_label');
```

Reducer rules:

- `create_label` creates `labelIdToLabel[id]` with a deduplicated `listIds`
  array and inserts the label id at the front of `visibleLabels`.
- `rename_label` changes only the label name.
- `delete_label` removes the label id from `visibleLabels` and deletes
  `labelIdToLabel[id]`.
- `add_list_to_label` appends the list id if it is not already present.
- `remove_list_from_label` removes the list id. If the label becomes empty, keep
  it until the user explicitly deletes it; an empty label is a valid saved query.
- `reorder_label` mirrors `reorder_list` within `visibleLabels`.
- `delete_list` and `revoke_share` should remove the list id from all label query
  specs, since the list is no longer visible to this user.
- `accept_pending_share` does not change labels automatically.
- `signed_in`, `signed_out`, and `CACHE_LOADED@INIT` reset/restore labels along
  with the rest of `ListsState`.

All label actions should be idempotent so replaying or receiving duplicate
actions leaves the same final state.

## Sidebar UI

The sidebar should show labels above ordinary lists:

```text
Labels
  Label A
  Label B

Lists
  List X
  List Y
```

The existing list-of-lists drag behavior can remain scoped to ordinary lists for
the first pass. Label reordering can be implemented as a follow-up, or labels can
get their own drag container using the same `reorder_label` semantics.

Clicking a label navigates to:

```text
/labels?labelId=LABEL_ID
```

The active label row should show an edit affordance, analogous to the current
list pencil. Editing a label should support rename and delete. Editing label
membership can be deferred because the required first workflow starts from the
list edit dialog.

## List Edit Dialog UI

The list edit dialog should add a "Labels" section below sharing. It should be
optimized for the current list because the user entered the dialog from that
list.

Controls:

- Existing labels: show a checkbox list of labels. Checked means the current list
  is included in that label. Toggling dispatches `add_list_to_label` or
  `remove_list_from_label`.
- New label: a text field and add button. Creating a label dispatches
  `create_label({ id, name, listIds: [currentListId] })`.

Validation:

- Trim label names.
- Disable creating a label with an empty name.
- Allow duplicate names only if existing list names already allow duplicates; if
  we want stricter behavior, enforce it uniformly later.

The dialog should save label changes through persisted global actions so they
sync across the user's devices. Label changes should not be sent to collaborators.

## Label View

Add a route:

```text
src/routes/(app)/labels/+page.svelte
```

The route should:

- Read `labelId` from the URL.
- Look up the label in `labelIdToLabel`.
- Set the app icon and title from the label name.
- Use `ItemList` with a `listIdMatcher` compiled from the label query.
- Show incomplete items by default, matching ordinary list/search behavior.
- Use `showListName=true` so tasks reveal their source list.

For the first implementation, label views should not allow cross-list drag
reordering. That means pass a comparator or add an explicit `dragEnabled` prop to
`ItemList`; reordering across multiple underlying list action logs is ambiguous.

## Query Semantics

Labels are saved as structured query specs, not raw query text. The initial query
language is deliberately narrow:

```ts
{ type: 'list_id_or', listIds: ['X', 'Y', 'Z'] }
```

This corresponds to:

```text
id:X OR id:Y OR id:Z
```

The structured form leaves room for later general boolean expressions without
blocking this feature. A future `LabelQuerySpec` could add:

```ts
type: 'and' | 'or' | 'not' | 'list_id' | 'starred' | 'due_today' | 'text_contains'
```

but the label UI requested here only needs list-id disjunction.

## Loading and Cache Behavior

Because labels are derived from list ids, startup must still load the underlying
lists before the label view is complete. The current refresh behavior already
uses `visibleLists` to decide which list action streams are relevant. Labels
should not add separate list subscriptions; they should rely on the same list
loading and refresh mechanism used for ordinary list views.

If the user opens a label containing lists that are not currently being watched,
the route should trigger the same "current list opened" refresh path for each
member list or introduce a small helper such as:

```ts
ensureListsWatched(label.query.listIds)
```

That helper should reuse the existing subscription code path so labels do not
create a second watch policy.

## Sharing Semantics

Labels are private user metadata. They do not affect sharing and are not visible
to collaborators.

If a label contains a shared list, the label shows that list's items because the
user already has access to the list. If that share is revoked, the reducer removes
the list id from every label.

## Migration

Existing cached and replayed `ListsState` values will not have `visibleLabels` or
`labelIdToLabel`. The reducer should normalize missing fields to:

```ts
visibleLabels: []
labelIdToLabel: {}
```

Do this in reducer initialization and cache loading so old caches remain valid.

## Testing Plan

Unit tests:

- Creating a label inserts it at the top of `visibleLabels`.
- Creating a label deduplicates list ids.
- Adding a list to a label is idempotent.
- Removing a list from a label is idempotent.
- Deleting or revoking a list removes it from all labels.
- Reordering labels mirrors list reordering behavior.
- Signing in/out resets label state.
- Loading old cached state fills missing label fields.

Component or route tests:

- The list edit dialog creates a new label containing the current list.
- The list edit dialog adds/removes the current list from an existing label.
- The sidebar displays labels above lists and navigates to the label route.
- The label route renders tasks from all member lists and shows list names.

Manual verification:

- Create label from list A.
- Add list B to that label.
- Open the label and confirm tasks from A and B appear.
- Rename/delete list A and confirm label behavior remains consistent.
- Revoke access to a shared list and confirm it disappears from labels.

## Open Questions

- Should labels be draggable among ordinary lists, or is a separate labels section
  acceptable for the first version?
- Should empty labels be displayed, hidden, or deleted automatically?
- Should duplicate label names be allowed?
- Should label edit support changing membership directly, or is membership
  management from the list edit dialog enough for the first pass?
