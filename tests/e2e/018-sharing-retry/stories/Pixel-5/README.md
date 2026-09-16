# Scenario: Sharing search and atomic retry

A long directory supports search and missing display names. A denied recipient prevents the whole save; retry creates exactly one request per selected person.

## Steps

### Step 001: search_keeps_selection

**Verifications:**
- [x] Filtering preserves both selections and missing names fall back to wrapped email

![search_keeps_selection](screenshots/001-search-keeps-selection.png)

### Step 002: sharing_batch_rejected

**Verifications:**
- [x] One denied target sends neither invitation and leaves both selections available for retry

![sharing_batch_rejected](screenshots/002-sharing-batch-rejected.png)

### Step 003: retry_sends_once

**Verifications:**
- [x] Retry sends exactly one invitation to each recipient and pending rows cannot be selected again

![retry_sends_once](screenshots/003-retry-sends-once.png)
