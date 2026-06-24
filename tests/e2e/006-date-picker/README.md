# Scenario: Date Picker Dialog

Documents the "Edit Task" dialog used to set a due date and repeat schedule on a task. The due date is chosen with a Material-styled calendar that matches the rest of the app.

## Steps

### Step 001: task_added

A task has been added to the list and is ready to be edited.

**Verifications:**
- [x] Task is visible in the list

![task_added](screenshots/001-task-added.png)

### Step 002: dialog_opened

The "Edit Task" dialog is open. The due date is initially disabled: the checkbox is unchecked and the Material date field is greyed out.

**Verifications:**
- [x] Dialog title "Edit Task" is visible
- [x] Due date checkbox is unchecked
- [x] Material date field is disabled

![dialog_opened](screenshots/002-dialog-opened.png)

### Step 003: due_date_enabled

Checking the box enables the due date controls.

**Verifications:**
- [x] Due date checkbox is checked
- [x] Material date field is now enabled

![due_date_enabled](screenshots/003-due-date-enabled.png)

### Step 004: calendar_opened

The Material-styled calendar popover opens, matching the app theme (month navigation, weekday headers, and a grid of selectable days).

**Verifications:**
- [x] Calendar is visible
- [x] Days are selectable

![calendar_opened](screenshots/004-calendar-opened.png)

### Step 005: due_date_selected

Choosing a day closes the calendar and shows the formatted due date in the field.

**Verifications:**
- [x] Date field shows the selected date

![due_date_selected](screenshots/005-due-date-selected.png)

### Step 006: selection_highlighted

Reopening the calendar shows the chosen day filled in the theme colour, updated reactively without needing to change months.

**Verifications:**
- [x] Exactly one day is highlighted as selected
- [x] The highlighted day is the one that was chosen

![selection_highlighted](screenshots/006-selection-highlighted.png)

### Step 007: repeat_options_open

The repeat selector is open, showing the available schedules: Doesn't repeat, Daily, Weekly, Monthly, Yearly, and Every Weekday.

**Verifications:**
- [x] Weekly option is available

![repeat_options_open](screenshots/007-repeat-options-open.png)

### Step 008: repeat_configured

A "Weekly" repeat is selected and configured to recur every 2 weeks.

**Verifications:**
- [x] Repeat interval is set to 2

![repeat_configured](screenshots/008-repeat-configured.png)

### Step 009: saved

After saving, the task shows its due date chip.

**Verifications:**
- [x] A due date chip is shown on the task

![saved](screenshots/009-saved.png)

### Step 010: reopened

Reopening the dialog shows the saved values: the due date is enabled and preserved, and the repeat interval is retained.

**Verifications:**
- [x] Due date checkbox is checked
- [x] Saved due date is preserved
- [x] Saved repeat interval is preserved

![reopened](screenshots/010-reopened.png)

