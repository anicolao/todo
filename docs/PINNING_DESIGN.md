# Label Pinning and Sidebar Expansion Design

**Status:** Approved — 2026-08-12.

This document refines the sidebar interaction described in
[`LABELS_DESIGN.md`](LABELS_DESIGN.md). It separates three concepts that the
current implementation conflates:

- selecting a label view;
- expanding a label as a folder in the sidebar;
- pinning that folder open across navigation and application reloads.

## Accepted Requirements

The following requirements are the starting point for this design:

1. Clicking a label row expands the label in the sidebar and loads the label
   view in one action.
2. Clicking a label row never pins or unpins it.
3. Pinning is a separate, explicit action performed through a pin control.
4. Pinning is persisted per user.
5. Unpinning is also a separate, explicit action. It persists the unpinned state
   and immediately recalculates expansion from the current URL and remaining
   pins.
6. The pin control is available only while a label is expanded. Closed labels do
   not show pin controls.
7. List navigation records an explicit parent-label context as
   `/lists?listId=X&via=Y`. Without `via`, every visible label containing the
   selected list expands.

## Terminology

- **Selected label:** the label whose `/labels?labelId=...` view is loaded.
- **Expanded label:** the label's child lists are currently visible in the
  sidebar.
- **Pinned label:** the user has explicitly requested that the label remain
  expanded across navigation and application reloads.
- **Route-expanded label:** the current URL requires the label to be expanded.
  This state is not persisted as a user preference.
- **Via label:** the label id in a list route's optional `via` query parameter.
  It identifies the label through which the user navigated to that list.

Selection, expansion, and pinning are separate concepts. Pinning or unpinning a
label must not select it or navigate away from the current view. Expansion is
always derived from the current URL and persisted pins, so unpinning collapses a
label when the URL does not independently require it to be open.

## State Model

### Persisted state

Pinning is a user-specific sidebar preference, not label-document data. It should
therefore be stored in the user's global action stream alongside `visibleLists`
and other per-user sidebar metadata. It must not be stored in the shared label
document, because two users may pin the same shared label differently.

The materialized state is:

```ts
interface ListsState {
	// Existing fields omitted.
	pinnedLabelIds: string[];
}
```

The idempotent global actions are:

```ts
pin_label({ id });
unpin_label({ id });
```

`pin_label` adds a visible label id if it is not already pinned. `unpin_label`
removes it if present. Replaying either action more than once must be harmless.

Adding this materialized field requires incrementing `CURRENT_SCHEMA_VERSION` so
older IndexedDB caches are discarded and rebuilt from the action logs.

### Route-derived expansion

Unpinned expansion is derived from the current URL rather than stored in an
ambiguous session-only “context” variable:

```text
/labels?labelId=Y         -> expand Y
/lists?listId=X&via=Y     -> expand Y
/lists?listId=X           -> expand every visible label containing X
all other routes          -> no route-expanded labels
```

For `via=Y` to be valid, `Y` must identify a visible label whose resolved query
contains list `X`. If the parameter is stale or invalid, treat it as absent and
expand every visible label containing `X`. The URL remains usable even after
label membership changes.

The effective expanded set is:

```text
pinnedLabelIds UNION routeExpandedLabelIds
```

There is no session-only expanded-label state. The same URL and persisted pin
state must always produce the same expanded set.

The current implementation derives some expansion from membership and silently
adds pin state when a row is clicked. That model should be replaced with
explicit persisted pin actions and the deterministic URL-derived rules above.

## Primary Interactions

### Clicking a label row

Clicking any part of the label row other than its pin control should perform one
user action with two visible results:

1. Navigate to `/labels?labelId=ID`.
2. Expand the label because it is selected by the resulting route.

The click must not modify `pinnedLabelIds`.

If the label is already expanded or already selected, clicking it should still
select its label view. It should not collapse the folder and should not toggle
the pin.

On a modal/mobile drawer, normal content navigation may close the drawer. When
the drawer is reopened, the selected label should still be expanded for the
current route.

### Clicking a nested list

Clicking list `X` inside expanded label `Y` should navigate to:

```text
/lists?listId=X&via=Y
```

The `via` parameter makes the parent relationship explicit. Label `Y` remains
expanded to reveal the selected list, while other unpinned labels containing
`X` remain closed. Persisted pinned labels remain open as usual.

Clicking or otherwise opening list `X` without a known parent label should
navigate to `/lists?listId=X` without `via`. In that case, every visible label
containing `X` expands so the sidebar reveals all known locations of the selected
list.

### Clicking Pin on an open, unpinned label

An expanded label shows a separate pin button inside its row. Clicking it should:

1. Dispatch `pin_label({ id })` to the user's global action stream.
2. Preserve the label's current expanded state.
3. Leave the current route and selected content unchanged.
4. Keep the drawer open.

Pinning is therefore available after the user opens a label. Pinning itself does
not expand, select, or navigate to a label.

### Clicking Unpin on a pinned label

Clicking the active pin control should:

1. Dispatch `unpin_label({ id })` to the user's global action stream.
2. Remove the label only from persisted pin state.
3. Recalculate expansion from the current URL and remaining persisted pins.
4. Leave the current route and selected content unchanged.
5. Keep the drawer open.

After unpinning, the label remains open only if the current URL requires it. For
example, unpinning the selected label on `/labels?labelId=Y` leaves it open,
while unpinning label `Y` on `/profile` collapses it immediately.

## Navigation Behavior

Expansion is recalculated from persisted pins and the destination URL after each
navigation. The `via` parameter is the context; no hidden navigation-context
state needs to be inferred.

| Starting state            | User action                              | Resulting sidebar state                                       | Resulting view/URL      |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------- | ----------------------- |
| Closed, unpinned label Y  | Click label row                          | Y opens, unpinned                                             | `/labels?labelId=Y`     |
| Open, unpinned label Y    | Click label row                          | Y remains open, unpinned                                      | `/labels?labelId=Y`     |
| Open, unpinned label Y    | Click Pin                                | Y remains open, pinned                                        | Current URL unchanged   |
| Open, pinned label Y      | Click Unpin                              | Y follows the current URL; it closes if open only due to pin  | Current URL unchanged   |
| Open label Y containing X | Click nested list X                      | Y remains open; other unpinned parents of X close             | `/lists?listId=X&via=Y` |
| Any route                 | Open list X without `via`                | Every visible label containing X opens                        | `/lists?listId=X`       |
| Any route                 | Open label Z                             | Z and all pinned labels open; unrelated unpinned labels close | `/labels?labelId=Z`     |
| Any route                 | Open Profile, Search, or a built-in view | Only pinned labels remain open                                | Destination route       |
| Any route                 | Reload                                   | Pins and URL-derived expansion are restored                   | Current URL unchanged   |

## Direct Navigation and Browser History

The behavior for direct navigation and history is:

- Opening, refreshing, or returning to `/labels?labelId=Y` loads the label view
  and expands `Y` without pinning it.
- Opening, refreshing, or returning to `/lists?listId=X&via=Y` loads list `X`
  and expands valid parent label `Y` without pinning it.
- Opening, refreshing, or returning to `/lists?listId=X` without `via` loads list
  `X` and expands every visible label containing it.
- Browser Back and Forward naturally restore the prior expansion context because
  `via` is part of the history entry.
- An invalid `via` falls back to the no-`via` behavior rather than hiding the
  selected list's valid parent labels.

None of these navigation cases changes persisted pin state.

## Multiple Labels and Overlapping Membership

- Any number of labels may be pinned simultaneously.
- Pinned labels remain independently expanded.
- Selecting one label does not unpin or close another pinned label.
- A list may belong to multiple labels.
- Navigating to such a list without `via` opens every visible containing label
  but does not pin any of them.
- Navigating through a particular label's nested row keeps that label open for
  the resulting list view by recording that label in `via`. It does not open the
  other unpinned labels containing the same list.

These rules use explicit navigation when a parent is known and membership-based
expansion when it is not.

## Pin Control and Accessibility

The control behavior is:

- Show the pin button only when a label is expanded. Closed labels show no pin
  control, reducing sidebar noise.
- Keep the pin visible for an expanded label rather than revealing it only on
  hover or keyboard focus.
- Use a visually distinct pinned and unpinned state; reduced opacity alone should
  not be the only indicator.
- Use accessible names `Pin label NAME` and `Unpin label NAME`.
- Give the label row `aria-expanded` based on effective expansion state.
- Ensure the row and pin button are separate keyboard targets.
- Activating the pin button must stop propagation so it never selects the label
  view accidentally.

## Lifecycle Cases

### New label

A newly created label is unpinned. Its expansion is derived from the current
URL, like every other label. For example, when it is created from list `X` while
the current route is `/lists?listId=X` without `via`, it opens once its query
resolves to include `X`. Creation itself does not select or pin the label.

### Empty label

An empty label may be selected or pinned. Its expanded state should be visible,
but it has no nested rows. Pin state still persists.

### Rename

Renaming a label does not affect pin state because pins are keyed by label id.

### Reorder

Reordering labels and lists does not affect pin state. Expanded child rows move
with their parent label.

### Delete, hide, or lose access

Special cleanup of pin preferences when a label is deleted, hidden, or becomes
inaccessible is outside the scope of this implementation. Labels absent from
`visibleLists` are not rendered; their stale ids may remain in persisted pin
state.

### Sharing

Pin state is never shared. The sender and recipient independently pin or unpin a
shared label through their own global action streams.

## Failure and Synchronization Behavior

- Apply pin and unpin optimistically so the sidebar responds immediately.
- Rebase the local action normally when its Firebase action-log write is
  acknowledged.
- If persistence fails, surface the same synchronization/error mechanism used by
  other global sidebar actions; do not silently present a pin as durable.
- Concurrent sessions for the same user converge according to global action-log
  order. A later pin or unpin action wins.
- Cache restoration replays the idempotent pin/unpin history even when those
  actions predate the general cache boundary. This keeps the action log
  authoritative if a cache write races with a nearby navigation action.

## Test Plan

### Reducer tests

- Pinning adds one id and is idempotent.
- Unpinning removes the id and is idempotent.
- Pin actions for ordinary list ids are rejected or ignored consistently.
- Cache replay restores pins with the current schema version.
- A stale schema cache is discarded and pin state is rebuilt from actions.
- Pin state remains user-specific for shared labels.

### Component and E2E tests

- One label-row click both expands the label and loads its label view.
- A label-row click never changes persisted pin state.
- Pin is a separate keyboard- and pointer-accessible control shown only for open
  labels.
- Closed labels do not render a pin control.
- Pinning an open label keeps it open without navigating.
- Unpinning keeps the current route and selected content unchanged.
- Unpinning immediately recalculates expansion from pins and the current URL.
- A label open only because it was pinned collapses immediately when unpinned.
- A route-expanded label remains open when unpinned.
- A nested-list click adds the correct `via` label to the list URL.
- A valid `via` expands only that unpinned parent label.
- A missing `via` expands every visible label containing the selected list.
- An invalid `via` falls back to the missing-`via` behavior.
- Pinned labels remain open across unrelated navigation and reloads.
- Direct label URLs expand but do not pin the label.
- Direct list URLs without `via` expand every containing label without pinning
  them.
- Browser Back and Forward restore the `via` context and corresponding expansion.
- Overlapping labels use only the explicit `via` parent when one is present.
- Mobile drawer navigation closes the drawer while preserving sidebar state.
- Pin state is independent for two users sharing the same label.
