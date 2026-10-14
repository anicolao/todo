# Animation lab

Run the review surface:

```sh
nix develop .#animationLab -c npm run dev:animations
```

The focused Nix development shell supplies the pinned Node and Java toolchains
without downloading the Android or iOS development stacks. The command starts
isolated Firebase Auth and Firestore emulators as well as the Vite server. Open
<http://127.0.0.1:5190/dev/animations>. The lab creates and signs into a local
review account, seeds deterministic lists, tasks, a label and a second user,
then loads the real Todo app in the selected viewport.

The scenario picker covers the portrait drawer, landscape navigation, opening,
closing and drilling into the real task/list/profile editors, desktop
navigation, and reduced motion. Triggering a scenario clicks the same controls
as a user; there is no parallel screen implementation.

Use slow playback, Pause, and the timeline to inspect the paired incoming and
outgoing screens. “Looks right” and “Needs changes” are stored in local storage
for review convenience. Product writes, subscriptions and replay use only the
ephemeral emulators and cannot touch production data.

The iframe is the real product shell: application layout, routes, components,
dialogs, store, Firestore listeners and animation code. The harness is limited
to fixture setup, viewport selection, real-control driving and animation
inspection. Once motion is accepted here, screenshot/E2E coverage should be
updated to match the reviewed scenarios.
