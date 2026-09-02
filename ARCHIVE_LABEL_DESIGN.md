# Archive and Label Visibility Design

**Status:** Proposed — revised 2026-09-02

## Summary

Every label has one persisted visibility value:

```ts
type LabelVisibility = 'visible' | 'hidden' | 'fully_hidden';
```

- `visible` is current label behavior.
- `hidden` excludes the label's concrete source lists from Search, All, Today,
  Starred, By Date, Completed, and other aggregate label queries. The label
  remains in the list-of-lists so the user can open it intentionally.
- `fully_hidden` has the same query exclusion and also removes the label from
  normal UI. It remains available in the Configure Hidden Lists dialog so the
  setting is reversible.

Visibility belongs to the label id, not its display name. An Archive label may
be renamed to Someday without becoming visible, and an unrelated label renamed
to Archive does not become hidden. Duplicate label names are unambiguous because
each row in settings changes one label id.

Archive is therefore a conventional use of an ordinary label: create a label,
call it Archive (or anything else), and set its visibility to Hidden. The name
`Archive` is not reserved and has no runtime behavior.

## Goals

- Make hiddenness a durable property of every label.
- Preserve that property across renames, duplicate names, sharing, reordering,
  pinning, and label-query edits.
- Exclude hidden sources consistently from every aggregate query.
- Allow a hidden Archive label to remain visible and directly browsable.
- Allow a fully hidden label to disappear from normal UI while remaining
  recoverable from settings.
- Keep configuration to one three-state control per label.
- Define the label action-log contract precisely before it is persisted.

## Non-goals

- Security, encryption, permissions, or protection from somebody who already
  has a direct concrete-list URL or Firestore access.
- Automatically creating an Archive label.
- Inferring visibility from a label's current or historical name.
- Hiding an ordinary task list because it is named Archive or Private.
- Per-query or per-task visibility overrides.
- Rewriting stored label expressions whenever visibility changes.

## State Model

Visibility is stored with the label's query state:

```ts
export type LabelVisibility = 'visible' | 'hidden' | 'fully_hidden';

export interface LabelState {
	query: LabelQuery;
	visibility: LabelVisibility;
}
```

Every label has a visibility even if no visibility action exists in its log.
The materialized default is `visible`. This preserves the behavior of existing
labels and old action logs.

The three-state enum is preferable to two booleans such as `hiddenFromSearch`
and `hiddenFromLists`. It makes the supported states explicit and prevents the
nonsensical combination “absent from the UI but included in aggregate search.”
The ordering is conceptual, not numeric:

```text
visible      -> searchable and shown in UI
hidden       -> not searchable, shown in UI
fully_hidden -> not searchable, not shown in normal UI
```

`visibility` is label-document state rather than a global map or a property of
`visibleLists`. A shared label therefore has the same visibility for everyone
who can access it, just as it has the same query for everyone. A collaborator
with permission to edit a label can change its visibility for all collaborators.
This follows the revised requirement that visibility is a property of the
label, rather than a personal preference associated with a name.

## Query Semantics

### Source exclusion

A **hidden source list** is an accessible concrete task list reached by
resolving the query of a label whose visibility is `hidden` or `fully_hidden`.
Nested label queries are resolved recursively using the existing cycle
detection.

For an aggregate query, source selection is conceptually:

```text
eligible source lists
  = accessible concrete task lists selected by the user query
  MINUS concrete task lists selected by hidden or fully-hidden labels
```

Exclusion wins. If list X is selected by both Archive and Work, and Archive is
hidden, X does not appear in Work or in a built-in aggregate view. Removing X
from Archive or changing Archive to Visible makes X eligible immediately; Work's
stored query is not modified.

This policy applies to:

- text Search;
- All;
- Today;
- Starred;
- By Date;
- Completed;
- ordinary saved label views;
- future aggregate views unless they explicitly declare themselves direct
  source views.

Filtering happens at source selection, before item predicates, grouping,
sorting, counts, or empty-state calculation. Filtering rendered rows afterward
could leak group headings, list names, or result counts.

### Direct-view exceptions

Two direct views intentionally bypass part of the aggregate policy:

1. `/lists?listId=ID` renders that concrete list. Direct access preserves
   bookmarks and lets a user edit or remove archived work.
2. Directly opening a `hidden` label renders the lists selected by that label
   without applying that label's own exclusion. This is how a user browses an
   Archive label. Exclusions from other hidden labels still apply.

For example, when directly viewing hidden label A, the compiler subtracts the
hidden sources for every other hidden label but not A. If one of A's lists is
also selected by fully-hidden label B, B still excludes it.

A `fully_hidden` label is not a direct-view exception. Navigating to its label
URL replaces the route with `/profile` without rendering its name, title, or
contents. The user must change it to Hidden or Visible in Configure Hidden Lists
before opening it. A direct concrete-list URL remains usable, emphasizing that
fully hidden is a UI feature rather than an access-control boundary.

### Expression-language integration

The currently implemented persisted `LabelQuery` supports `or` and `id`. The
broader design anticipates `and` and `not`, but this feature does not require a
new persisted predicate. The smallest implementation is a shared selector:

```ts
function selectExcludedSearchListIds(
	lists: ListsState,
	labels: LabelsState,
	bypassLabelId?: string
): Set<string>;
```

The selector:

1. Finds label ids with `visibility !== 'visible'`.
2. Omits `bypassLabelId`, if supplied for a directly opened hidden label.
3. Resolves each remaining label query using the existing cycle-safe resolver.
4. Keeps accessible concrete task-list ids, not label ids or inaccessible
   placeholders.
5. Returns the union of those ids.

All aggregate routes must obtain source ids through one shared query/source
selector and subtract this set. The existing route-specific calls to
`ItemList` should not each implement their own visibility check.

Once the general compiler supports the required runtime operations, the policy
can be represented internally as:

```text
USER_QUERY
  AND NOT LabelId=hidden-label-id-1
  AND NOT LabelId=fully-hidden-label-id-2
```

The id predicate is important: a name predicate would reintroduce the rename
bug this revision removes. This composed expression is ephemeral. It must not be
written into a label query or any action log.

### Loading

The visibility and query of every internally visible label must be known before
an aggregate view is declared loaded. Do not briefly display unfiltered results
while label document actions are still loading. Keep the existing loading UI
until the eligible source set can be published atomically.

Inaccessible references contribute no source ids and remain durable query
references. Cycles contribute no source ids beyond concrete lists resolved
safely before cycle detection. Visibility does not change watcher, permission,
sharing, or deletion behavior.

## Minimal UX

The Profile screen currently contains TODO's settings. Add one secondary button
there rather than adding permanent controls to the sidebar:

```text
+------------------------------------------+
| Profile                                  |
|                                          |
| Todo Item Spacing        [High Density v]|
| Background image URL     [_____________] |
|                                          |
| [ Configure Hidden Lists ]               |
+------------------------------------------+
```

The button opens a modal dialog on desktop and a full-screen dialog on narrow
mobile layouts. It lists every accessible label, including fully-hidden labels:

```text
+--------------------------------------------------+
| Configure Hidden Lists                       [x] |
|                                                  |
| Choose how each label appears in TODO.           |
|                                                  |
| Archive                         [Hidden       v] |
| Private                         [Fully hidden v] |
| Work                            [Visible      v] |
| Shared errands · alex@example   [Visible      v] |
|                                                  |
| Hidden labels stay in Lists so you can open      |
| them. Fully hidden labels appear only here.      |
| This changes UI and search, not permissions.     |
|                                          [Done]  |
+--------------------------------------------------+
```

Each select has these options and descriptions:

```text
Visible       Show normally and include in searches
Hidden        Show in Lists, exclude from searches
Fully hidden  Show only in this dialog
```

Interaction details:

- Changing a select persists immediately and updates other open sessions through
  the label action stream. Done only closes the dialog.
- Opening/closing the dialog and pressing Done do not write actions.
- Rows are keyed by label id even though the id is not normally displayed.
- Use the existing `visibleLists` order so a label returns to its previous place
  after being restored. Fully-hidden rows are not removed from that internal
  array.
- Duplicate display names get separate controls. Existing owner/share context is
  shown as secondary text where necessary to distinguish them; an advanced
  copy-id affordance may be used if names and owner context are both identical.
- Empty state: `No labels yet. Create a label from a list, then return here to
  configure it.` Do not add another label-creation workflow to this dialog.
- Every select has an accessible label such as `Visibility for Archive`.
- The explanatory text must say this is not privacy or access control, especially
  because users may choose a name such as Private.

### Archive workflow

There is no magical Archive name and no automatic label creation. The minimal
workflow is:

1. Create an ordinary label named Archive using the existing list-edit dialog.
2. Open Profile -> Configure Hidden Lists.
3. Set Archive to Hidden.

From that point onward, Archive is excluded from aggregate queries by default
but remains in Lists. Renaming it later does not change the Hidden value.

If reducing this one-time setup becomes important, a future label-creation UI
may include an initial visibility select. It should persist the same
`set_label_visibility` action described below; it must not infer a value from
the entered name.

## Fully-Hidden UI Behavior

A fully-hidden label remains in `visibleLists` as internal, ordered metadata but
is removed by a derived display selector. It is absent from:

- the top-level sidebar/list-of-lists, whether selected, expanded, or pinned;
- nested label rows;
- the Labels checkbox section of list-edit dialogs;
- label choosers, sharing shortcuts, and other normal label-discovery UI;
- route titles and label content, through the route guard above.

Configure Hidden Lists is the only normal UI that includes it. Changing its
visibility to Hidden or Visible restores the label in its previous order.
Existing label membership, query, sharing, and pin state are retained.

The sidebar currently suppresses top-level concrete lists that are members of
labels. Making the parent label fully hidden must not promote those members back
to top-level rows. If a hidden source list is also nested under a visible label,
its list row may remain a direct navigation affordance, but its tasks do not
appear in that label's aggregate view. Directly opening the concrete list works.

A fully-hidden pinned label is not expanded or rendered. Its pin id remains
persisted and becomes effective again if the label returns to Hidden or Visible.

## Persisted Action

Add exactly one new action type:

```ts
export const set_label_visibility = createAction<{
	label_id: string;
	visibility: LabelVisibility;
}>('set_label_visibility');
```

It is written to the affected label's existing document action stream:

```ts
dispatch(
	'lists',
	labelId,
	uid,
	set_label_visibility({ label_id: labelId, visibility: 'hidden' })
);
```

Its persisted action body is:

```json
{
  "type": "set_label_visibility",
  "payload": {
    "label_id": "label-uuid",
    "visibility": "hidden"
  }
}
```

The existing label-action envelope adds `creator` and a server `timestamp`.
Those transport fields are not part of the payload contract.

### Exact reducer semantics

1. `payload.label_id` must be a non-empty string.
2. `payload.visibility` must be exactly `visible`, `hidden`, or `fully_hidden`.
   An unknown value is ignored and reported through diagnostics; it is not
   coerced to Visible. This avoids an old client revealing a state it does not
   understand.
3. `payload.label_id` is the reducer's authoritative label key. The persistence
   helper must write the action to `lists/{payload.label_id}/actions` and reject
   a caller-supplied path/payload mismatch before writing. The current reducer is
   not given the Firestore source path during replay, so it must not pretend it
   can validate that path. Keeping the id in the payload matches existing label-
   query actions; a future replay adapter may attach source-path metadata for an
   additional integrity check without changing this persisted action.
4. If label state does not yet exist, the reducer creates it with
   `query: emptyLabelQuery` and the requested visibility. This makes query and
   visibility action order harmless during optimistic initialization.
5. Otherwise it replaces only `visibility`; it preserves the query exactly.
6. Replaying an identical action is a semantic no-op, so duplicate delivery is
   harmless.
7. Ordered `set_label_visibility` actions use last-action-wins semantics. There
   is no remove/reset action; returning to normal behavior is represented
   explicitly by `{ visibility: 'visible' }`.

The existing query reducers must preserve the current visibility when setting,
adding, or removing query predicates. When they create label state for an old
log with no visibility action, they assign `visible`.

### Why this action belongs in the label log

- The property survives rename because it is replayed for a stable label id.
- Sharing a label shares its visibility semantics along with its query.
- Deleting or revoking access naturally makes the setting inaccessible without
  leaving a name rule that might affect an unrelated future label.
- Query edits and visibility edits have one authoritative document history.
- No global action needs to mirror shared document state.

### Actions deliberately not added

Do not add `archive_label`, `unarchive_label`, `hide_label`,
`fully_hide_label`, or a name-based rule action. Those names encode transitions
or UI commands instead of the final durable state and make replay/conflict rules
harder.

Opening settings, calculating excluded source ids, guarding a route, or
composing the implicit `AND NOT` expression writes no action. Existing actions
continue to own label creation, query membership, rename, pinning, sharing, and
deletion. A visibility change must never dispatch a derived `set_label_query`.

### Optimism, concurrency, and old clients

- Dispatch the action optimistically and write it once to the label stream using
  the existing action dispatcher.
- Concurrent clients converge in server action-log order; the later visibility
  action wins.
- A write failure uses the existing synchronization/error UI and must not be
  silently presented as durable.
- Old clients that do not recognize `set_label_visibility` will continue to show
  the label and its tasks. Therefore fully hidden is not suitable for secrets,
  and rollout should not describe it as a security feature.
- Only collaborators already authorized to write the label stream may change
  the property. Read-only collaborators render the shared value but cannot edit
  its select; the dialog shows that control disabled with ownership context.

## Cache and Migration

Adding `visibility` to `LabelState` changes materialized state. Increment
`CURRENT_SCHEMA_VERSION` from 3 to 4 when implementing this design. A missing or
mismatched cache is discarded and rebuilt from global and label action logs.
There is no field-level cache migration.

Existing label logs contain no visibility action, so current reducers rebuild
them as Visible. No name-based conversion and no synthetic migration action is
performed for labels named Archive. This is required for stable semantics: a
replay must not change visibility because a label happened to have a particular
name at migration time.

The cache stores materialized label visibility. New visibility actions use the
normal label-action timestamp and cache-boundary handling; no special global
replay exception is required.

## Edge Cases

- **Rename:** changes only the display name; visibility remains attached to id.
- **Duplicate names:** each label keeps its independent visibility.
- **Nested hidden labels:** resolving any hidden label contributes all concrete
  descendants to the exclusion union.
- **Overlapping labels:** exclusion wins even if another visible label selects
  the same concrete list.
- **Direct hidden label:** bypasses only its own exclusion.
- **Direct fully-hidden label:** redirects to Profile without rendering content.
- **Visibility changes while open:** changing the current label to Fully hidden
  immediately replaces the route with Profile; changing it to Hidden keeps the
  direct view open.
- **Delete or revoke access:** no cleanup action is needed; the property remains
  in that label's durable log.
- **Pin:** fully hidden suppresses rendering but does not delete the pin.
- **Offline change:** local filtering updates immediately and other clients
  converge after synchronization.
- **Inaccessible descendant:** contributes no task-list id and exposes no last-
  known metadata in aggregate results.

## Test Plan

Reducer and selector tests:

- A label with no visibility action materializes as Visible.
- Each legal enum value replaces only visibility and preserves the query.
- Query actions preserve visibility and default it correctly for old logs.
- Identical visibility actions are idempotent; ordered conflicting actions use
  last-action-wins semantics.
- Invalid enum values and empty ids are ignored; the persistence helper rejects
  stream/payload id mismatches before writing.
- Rename and duplicate-name scenarios do not change or couple visibility.
- Hidden source resolution handles nesting, overlaps, inaccessible ids, and
  cycles.
- Direct-hidden bypass omits exactly one label's exclusion.
- A schema-3 or missing-version cache is rejected; schema 4 restores visibility.

Component and end-to-end tests:

- Configure Hidden Lists includes every accessible label and no ordinary list.
- Changing one duplicate-named row affects only its id.
- Rename Hidden Archive to Someday; it remains Hidden across reload and replay.
- Rename a Visible label to Archive; it remains Visible.
- Hidden labels remain in Lists and open directly, while their tasks are absent
  from every aggregate route.
- Fully-hidden labels disappear from every normal discovery surface without
  promoting their member lists.
- A direct fully-hidden label URL redirects without flashing title or content.
- Restoring visibility returns the label to its previous order and pin state.
- One select change writes exactly one `set_label_visibility` action to the
  label stream; opening, closing, and query evaluation write none.
- A shared visibility change updates two authorized sessions consistently, and
  a read-only collaborator cannot change it.
- Aggregate views stay in loading state until all label visibility/query state
  needed for filtering is ready.

## Rollout Order

1. Add `LabelVisibility`, the action/reducer behavior, cache version, and unit
   tests. Existing labels remain Visible.
2. Route every aggregate view through the shared eligible-source selector.
3. Add the Configure Hidden Lists dialog, derived navigation filter, and fully-
   hidden route guard.
4. Add rename, sharing, direct-route, and cross-view end-to-end coverage.
5. Document the three-step Archive workflow only after every aggregate route
   uses the common selector.

Do not enable the Hidden or Fully hidden controls while some aggregate routes
bypass the common selector. Partial adoption would make a label's persisted
property mean different things in different views.
