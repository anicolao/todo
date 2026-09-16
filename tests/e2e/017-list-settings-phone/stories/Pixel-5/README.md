# Scenario: Phone list settings

Small viewport, enlarged text, keyboard focus, system Back and label deletion that preserves source tasks. Software keyboard appearance still needs device review.

## Steps

### Step 001: large_text_short_viewport

**Verifications:**
- [x] Save stays reachable with 200% text in a short viewport and no horizontal overflow

![large_text_short_viewport](screenshots/001-large-text-short-viewport.png)

### Step 002: label_settings

**Verifications:**
- [x] Label editor identifies its type and omits recursive membership controls

![label_settings](screenshots/002-label-settings.png)

### Step 003: source_tasks_preserved

**Verifications:**
- [x] Deleting a label preserves its source list and task after reload

![source_tasks_preserved](screenshots/003-source-tasks-preserved.png)

### Step 004: dark_landscape

**Verifications:**
- [x] Dark landscape retains Close and scrollable settings with no root Save

![dark_landscape](screenshots/004-dark-landscape.png)
