# Android task-lifecycle E2E test

`AndroidTaskLifecycleE2ETest` runs the app in the pinned API 36 emulator and mirrors
the browser scenario in `tests/e2e/005-task-lifecycle`:

1. sign in through the Firebase Auth emulator;
2. create a list and three tasks through the Android UI;
3. star one task and complete another;
4. reveal completed tasks in the list; and
5. verify the Starred, Completed, and All views.

Each verified state is captured after the WebView becomes pixel-stable. The test crops
dynamic Android system bars, then compares every ARGB pixel with the corresponding PNG
in `assets/android-e2e`. The permitted difference is exactly zero pixels.

From the Nix development shell, run:

```bash
npm run android:test:emulator
```

Actual images and magenta pixel-diff images from failures are copied to
`test-results/android-emulator/screenshots`. To accept an intentional visual change,
run the following command and review every updated PNG before committing it:

```bash
npm run android:test:emulator -- --update-screenshots
```
