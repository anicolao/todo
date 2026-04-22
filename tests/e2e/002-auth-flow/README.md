# Scenario: Successful Login Flow

Verify that a user can sign in using the test button and view their profile.

## Steps

### Step 001: login_page

User is on the login page.

**Verifications:**
- [x] Login button is visible

![login_page](screenshots/001-login-page.png)

### Step 002: after_login

User clicked test sign in and should be redirected to profile page (via home page).

**Verifications:**
- [x] Redirected to profile page

![after_login](screenshots/002-after-login.png)

### Step 003: profile_page

User is on the profile page.

**Verifications:**
- [x] URL is /profile
- [x] Email is visible
- [x] Name is visible

![profile_page](screenshots/003-profile-page.png)

### Step 004: create_list_step

User creates a new todo list.

**Verifications:**
- [x] New list input is visible

![create_list_step](screenshots/004-create-list-step.png)

### Step 005: entering_list_name

User has entered the new list name but has not yet submitted.

**Verifications:**
- [x] Input contains the list name

![entering_list_name](screenshots/005-entering-list-name.png)

### Step 006: list_created

User created a new list and is redirected to it.

**Verifications:**
- [x] URL contains the new list ID
- [x] List title matches

![list_created](screenshots/006-list-created.png)

### Step 007: after_signout

User clicked sign out and should be redirected to login page.

**Verifications:**
- [x] Redirected to login page

![after_signout](screenshots/007-after-signout.png)

