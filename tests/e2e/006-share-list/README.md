# Scenario: Share List Between Users

Verify that one user can share a list, a second user can accept it, and both users see shared task updates.

## Steps

### Step 001: recipient_registered

Recipient signs in once so they are discoverable as a share target.

**Verifications:**
- [x] Recipient profile is visible

![recipient_registered](screenshots/001-recipient-registered.png)

### Step 002: owner_signed_in

Owner signs in and sees the application shell.

**Verifications:**
- [x] Owner profile is visible

![owner_signed_in](screenshots/002-owner-signed-in.png)

### Step 003: owner_list_created

Owner creates a list and adds the first shared task.

**Verifications:**
- [x] Owner list title is visible
- [x] Owner task is visible

![owner_list_created](screenshots/003-owner-list-created.png)

### Step 004: recipient_selected_for_share

Owner selects the recipient in the list sharing dialog.

**Verifications:**
- [x] Recipient is listed in share dialog
- [x] Recipient share checkbox is checked

![recipient_selected_for_share](screenshots/004-recipient-selected-for-share.png)

### Step 005: recipient_share_pending

Recipient receives the pending shared list with accept and reject controls.

**Verifications:**
- [x] Pending shared list is visible
- [x] Accept share control is visible
- [x] Reject share control is visible

![recipient_share_pending](screenshots/005-recipient-share-pending.png)

### Step 006: recipient_accepted_share

Recipient accepts the share and can view the owner task.

**Verifications:**
- [x] Shared list title is visible to recipient
- [x] Owner task is visible to recipient

![recipient_accepted_share](screenshots/006-recipient-accepted-share.png)

### Step 007: recipient_added_task

Recipient adds a task to the accepted shared list.

**Verifications:**
- [x] Owner task remains visible to recipient
- [x] Recipient task is visible to recipient

![recipient_added_task](screenshots/007-recipient-added-task.png)

### Step 008: owner_sees_recipient_update

Owner sees the task added by the recipient on the shared list.

**Verifications:**
- [x] Owner task remains visible to owner
- [x] Recipient task is visible to owner

![owner_sees_recipient_update](screenshots/008-owner-sees-recipient-update.png)

