# Scenario: Labels

Verify that a user can create a label from the list edit dialog and see list tasks through that label.

## Steps

### Step 001: source_list_created

User has created a source list.

**Verifications:**
- [x] Source list is visible

![source_list_created](screenshots/001-source-list-created.png)

### Step 002: label_creation_ui_available

User can create a label from the list edit dialog.

**Verifications:**
- [x] Labels section is visible
- [x] New label field is visible
- [x] Create label button is disabled until a name is entered

![label_creation_ui_available](screenshots/002-label-creation-ui-available.png)

### Step 003: label_created

User created a label containing the current list.

**Verifications:**
- [x] Label appears in the sidebar

![label_created](screenshots/003-label-created.png)

### Step 004: label_opened

User opened the label and sees the source list as a contained group.

**Verifications:**
- [x] URL is the label route
- [x] Source list group name is visible

![label_opened](screenshots/004-label-opened.png)

### Step 005: label_removed_from_list

User removed the current list from the label.

**Verifications:**
- [x] Label checkbox stays unchecked

![label_removed_from_list](screenshots/005-label-removed-from-list.png)

### Step 006: label_empty_after_removal

User opened the label and no longer sees the removed list.

**Verifications:**
- [x] URL is the label route
- [x] Removed source list group is absent

![label_empty_after_removal](screenshots/006-label-empty-after-removal.png)

