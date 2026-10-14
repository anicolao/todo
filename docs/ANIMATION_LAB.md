# Animation lab

Run the review surface without signing in or starting Firebase:

```sh
npm run dev:animations
```

Open <http://127.0.0.1:5190/dev/animations/>. The scenario picker covers the
portrait drawer, horizontal route navigation, landscape list ordering, opening,
closing and drilling into task/list/profile details, desktop navigation, and
reduced motion.

Use slow playback, Pause, and the timeline to inspect the paired incoming and
outgoing screens. “Looks right” and “Needs changes” are stored in local storage
for review convenience; they do not write application or Firebase state.

The lab deliberately uses the same movement offsets, duration, and easing
constants as the application. Its content is deterministic review geometry,
not a second Todo client. Once motion is accepted here, production integration
and screenshot/E2E coverage should be updated to match the reviewed scenarios.
