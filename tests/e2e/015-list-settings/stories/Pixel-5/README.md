# Scenario: List settings

Name and labels save independently; discarding a later setting preserves earlier saves. Deletion requires its own confirmation.

## Steps

### Step 001: settings_overview

**Verifications:**
- [x] Overview has Close, no Save, and a regular delete settings row

![settings_overview](screenshots/001-settings-overview.png)

### Step 002: independent_save

**Verifications:**
- [x] Discarding Labels preserves the already saved name and creates no label

![independent_save](screenshots/002-independent-save.png)

### Step 003: inline_label

**Verifications:**
- [x] Label creation uses the Labels Save button and retains entered text

![inline_label](screenshots/003-inline-label.png)

### Step 004: membership_removed

**Verifications:**
- [x] Removing membership saves independently and updates the overview

![membership_removed](screenshots/004-membership-removed.png)

### Step 005: delete_confirmation

**Verifications:**
- [x] Delete opens a separate confirmation with Keep list focused

![delete_confirmation](screenshots/005-delete-confirmation.png)
