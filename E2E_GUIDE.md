# E2E Testing Guide

This project uses [Playwright](https://playwright.dev/) for End-to-End testing. Our E2E tests are the primary source of truth for application correctness.

## 1. The Philosophy: "Zero-Pixel Tolerance"

We enforce a strict **Zero-Pixel Tolerance** policy for visual regression. Since visual state is the primary feedback mechanism for the user, any deviation is considered a bug.

- **Software Rendering**: Tests should use deterministic browser and rendering settings so snapshots are consistent across CI and local environments.
- **Determinism**: Tests must be deterministic. Random seeds must be fixed, Firebase emulator state must be reset, and tests should avoid depending on existing user data.

## 2. Test Structure

All E2E tests live in `tests/e2e/`. Each test case gets its own directory.

```text
tests/e2e/
├── helpers/                   # Shared utilities (TestStepHelper)
├── 001-login/                 # Scenario directory
│   ├── 001-login.spec.ts      # Main test file
│   ├── README.md              # Auto-generated verification doc
│   └── screenshots/           # Committed baseline images
```

## 3. The "Unified Step Pattern"

To prevent synchronization errors between documentation and screenshots, we use a **Unified Step API**. You must **NEVER** manually manage filenames or counters.

### The `TestStepHelper`

We use `TestStepHelper` from `tests/e2e/helpers/test-step-helper.ts` to combine documentation, verification, and screenshot capture into a single atomic operation: `step()`.

#### Usage

```typescript
import { test, expect } from '@playwright/test';
import { TestStepHelper } from '../helpers/test-step-helper';

test('user creates a todo list', async ({ page }, testInfo) => {
	const helper = new TestStepHelper(page, testInfo);
	helper.setMetadata('Create Todo List', 'Verify that a signed-in user can create a list.');

	await page.goto('/');
	await helper.step('login_page', {
		description: 'User is redirected to the login page.',
		verifications: [
			{
				spec: 'Login button is visible',
				check: async () =>
					expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible()
			}
		]
	});

	await helper.generateDocs();
});
```

This automatically:

1. Generates numbered screenshots, such as `001-login-page.png`.
2. Runs verifications before capturing the screenshot.
3. Waits for active animations and transitions before capture.
4. Generates a scenario `README.md` for the test run.

## 4. Playwright Configuration

- **Command**: Run E2E tests with `npm run playwright`.
- **Browsers**: Tests run against Desktop Chrome and Pixel 5 projects.
- **App server**: Playwright builds the app and serves it through `npm run preview`.
- **Emulators**: Playwright starts the Firebase Firestore and Auth emulators for E2E runs.
- **Timeouts**: Prefer short, condition-based waits in individual steps. Use longer timeouts only for app startup, emulator startup, login redirects, or other explicitly slow flows.
- **Waits**: `waitForTimeout` and other arbitrary waits are not allowed; always wait on real UI conditions like `expect().toBeVisible()`, `expect().toHaveURL()`, or `waitForSelector()`.

## 5. Worktree-Safe E2E Runs

Agents and developers working in separate worktrees must run E2E tests through the Nix dev shell:

```sh
nix develop -c npm run playwright:isolated
```

This command derives a stable port block from the current worktree path, generates `.e2e/firebase.json`, and runs Playwright with isolated app, Firestore, Auth, Firebase UI, and Firebase hub ports. It also uses a worktree-specific Firebase project ID such as `todo-e2e-<hash>` so emulator resets do not touch another worktree's data.

Do not run broad cleanup commands such as `pkill firebase`, `killall firebase`, or `lsof -ti :8080 | xargs kill` while other agents may be working. Isolated Playwright runs should only manage their own child processes.

If a specific port block is needed, set `E2E_PORT_BASE` before running the isolated command:

```sh
E2E_PORT_BASE=43100 nix develop -c npm run playwright:isolated
```

The generated `.e2e/` directory is local scratch state and must not be committed.
