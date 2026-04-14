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

### Step 004: after_signout

User clicked sign out and should be redirected to login page.

**Verifications:**
- [x] Redirected to login page

![after_signout](screenshots/004-after-signout.png)

