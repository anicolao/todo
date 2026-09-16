# Scenario: Repeat rules and completion

All supported rules, month-end and leap-year overflow, weekdays, and early/late completion use the same schedule.

## Steps

### Step 001: daily

Every 3 days

**Verifications:**
- [x] The preview and persisted completion agree on the next date

![daily](screenshots/001-daily.png)

### Step 002: weekly

Every 2 weeks on Friday

**Verifications:**
- [x] The preview and persisted completion agree on the next date

![weekly](screenshots/002-weekly.png)

### Step 003: monthly

Every month on day 31

**Verifications:**
- [x] The preview and persisted completion agree on the next date

![monthly](screenshots/003-monthly.png)

### Step 004: yearly

Every year on Feb 29

**Verifications:**
- [x] The preview and persisted completion agree on the next date

![yearly](screenshots/004-yearly.png)

### Step 005: weekdays

Every weekday (Mon–Fri)

**Verifications:**
- [x] The preview and persisted completion agree on the next date

![weekdays](screenshots/005-weekdays.png)

### Step 006: late_completion

**Verifications:**
- [x] Late completion skips missed dates and keeps the Friday anchor

![late_completion](screenshots/006-late-completion.png)

### Step 007: stop_repeating

**Verifications:**
- [x] Removing repeat preserves the due date and hides upcoming occurrences

![stop_repeating](screenshots/007-stop-repeating.png)
