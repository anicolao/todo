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
- The only difference is that its actions construct a label query instead of a
  task list.

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

Label ids should be stored in `visibleLists` alongside ordinary list ids. The app
will need enough metadata to know whether a visible id is an ordinary task list
or a label document, but labels should not get a separate `visibleLabels` order.

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

Old cached states will not have `listIdToType`. During cache loading, missing
types should default to `'list'` for every id in `visibleLists`.

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

## Query Language

The query language should be general enough to grow, even though the first UI
workflow only needs a label that includes specific lists.

Represent a label query as a boolean expression:

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

If we prefer a more explicit predicate name, use `type: 'is_id'` instead of
`type: 'id'`. Pick one spelling before implementation and use it consistently.

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
{ type: 'due_today' }
{ type: 'text_contains', text: '...' }
```

The first implementation only needs to compile `or` and `id`/`is_id` into a
`listIdMatcher` for `ItemList`.

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
`visibleLabels` structure.

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

The sidebar row should use a label icon for `type === 'label'` and the existing
list/shared-list icons for ordinary lists.

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
- Use `ItemList` with a `listIdMatcher` compiled from the label query.
- Show incomplete items by default, matching ordinary list/search behavior.
- Use `showListName=true` so tasks reveal their source list.

For the first implementation, label views should not allow cross-list drag
reordering. Reordering across multiple underlying list action logs is ambiguous.

## Loading and Cache Behavior

Because labels are entries in `visibleLists`, startup should include them in the
same document refresh policy as ordinary lists. A visible label id should be
watched/loaded so its query can be replayed from `lists/{labelId}/actions`.

Opening a label view requires two layers of loaded state:

1. The label document actions, so the app knows the query.
2. The ordinary list documents matched by that query, so the app can render the
   tasks.

Once the label query is known, the route should ensure the matched ordinary list
ids are loaded or watched using the existing list refresh path. Labels should not
introduce a second watch system; they should ask the existing document watch
machinery to load the ids selected by the query.

## Sharing Semantics

Labels are private user metadata unless we deliberately add shared labels later.

For the first implementation:

- `create_label` is in the user's global action stream.
- Label query actions are in `lists/{labelId}/actions`.
- The label document should only be readable/writable by the user who created it.
- Adding someone else's shared list to your label does not change that
  collaborator's state.

If a shared list is revoked, the list id may still appear in an old label query
action log. At render time, the compiled label matcher should only match ids that
are currently present in `visibleLists` and have `listIdToType[id] === 'list'`.
This avoids needing destructive cleanup actions when access changes.

## Migration

Existing cached and replayed state will not have `listIdToType`. Cache loading
should normalize missing values by treating every existing visible id as a normal
list:

```ts
listIdToType[id] ?? 'list'
```

There is no `visibleLabels` migration because labels intentionally participate in
`visibleLists`.

## Testing Plan

Unit tests:

- `create_label` inserts the new id at the top of `visibleLists`.
- `create_label` records `listIdToType[id] === 'label'`.
- Existing cached state without `listIdToType` treats visible ids as ordinary
  lists.
- Label reducer can replay `set_label_query` into a query state.
- `add_label_predicate` is idempotent.
- `remove_label_predicate` is idempotent.
- Query compilation for `or` plus `id`/`is_id` matches the expected list ids.
- Query compilation ignores ids that are not currently visible ordinary lists.

Component or route tests:

- The list edit dialog creates a new label containing the current list.
- The list edit dialog adds/removes the current list from an existing label by
  dispatching actions to the label document stream.
- The sidebar displays labels from `visibleLists` and navigates labels to the
  label route.
- The label route renders tasks from all matched ordinary lists and shows list
  names.

Manual verification:

- Create label from list A.
- Add list B to that label.
- Open the label and confirm tasks from A and B appear.
- Confirm the label appears at the top of the same sidebar list.
- Reorder the sidebar and confirm labels participate in the visible order once
  reordering is implemented for mixed document types.

## Open Questions

- Should the predicate spelling be `type: 'id'` or `type: 'is_id'`?
- Should `create_label` directly write the initial label-document action, or
  should the UI dispatch the global creation action and the initial query action
  as two explicit writes?
- Should mixed label/list drag reordering be part of the first implementation, or
  can labels render at the top while still being stored in `visibleLists`?
