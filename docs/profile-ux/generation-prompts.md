# Profile UX mock-up generation prompts

These are the exact final prompts used with the built-in image generation tool. The resulting boards are design concepts; `PROFILE_UX.md` governs behavior and copy when image typography or geometry differs.

## 01-profile-appearance.png

```text
Use case: ui-mockup
Asset type: review board for a mobile Todo app UX design document
Primary request: Create one polished landscape design board containing exactly three tall iPhone-style screens, numbered with headings above them: “1 · Profile overview”, “2 · Item spacing”, and “3 · Background”. This is a high-fidelity product UX concept, not a photograph.
Scene/backdrop: warm off-white review-board background with generous spacing; each phone has a very light warm neutral app canvas, thin gray outline, subtle shadow, black home indicator, and simple 9:41 status bar.
Style/medium: crisp modern mobile settings UI; warm neutral palette; white grouped cards; dark brown-black typography; restrained terracotta accent (#B9513A); subtle cream circular icon wells; no gradients except a natural photo preview; visually consistent across all three screens.
Composition/framing: landscape board, three equal phones side by side, all fully visible, no hands or surrounding objects. Baseline phone layout around 390 × 844 CSS pixels. Use 16px side padding, 8px rhythm, 17px body text, 48px minimum rows.

Screen 1 exact content:
- centered navigation title “Profile”
- read-only identity block with a circular fictional avatar containing initials “AK”, name “Alex Kim”, email “alex@example.com”, and small text “Signed in”
- section label “APPEARANCE”
- one white grouped card with two navigation rows:
  - circular spacing icon, primary “Item spacing”, secondary “Comfortable”, right chevron
  - circular image icon, primary “Background”, secondary “Custom image”, right chevron
- section label “ORGANIZATION”
- white navigation row: tag icon, primary “Label visibility”, secondary “1 hidden · 1 fully hidden”, right chevron
- helper text “Choose where labels and their lists appear.”
- section label “ACCOUNT”
- white navigation row in restrained red/terracotta: sign-out icon, primary “Sign out…”, secondary “alex@example.com”, right chevron
- natural empty space below; no edit-profile control, no global Save button

Screen 2 exact content:
- back navigation “Profile”, centered title “Item spacing”
- helper text “Choose how much room each task uses.”
- section label “SPACING”
- grouped white choice list with two large radio rows:
  - selected terracotta radio/check, primary “Comfortable”, secondary “Larger controls and more breathing room”
  - unselected radio, primary “Compact”, secondary “Fit more tasks on screen”
- section label “PREVIEW”
- white preview card showing two simple todo rows: “Water the plants” and “Send the invoice”; the rows use the comfortable spacing
- wide terracotta bottom button “Save”
- no keyboard

Screen 3 exact content:
- back navigation “Profile”, centered title “Background”
- section label “PREVIEW”
- rounded landscape preview card showing a quiet, subtle leafy green photograph beneath a translucent sample Todo card
- section label “IMAGE URL”
- outlined text field containing “https://example.com/leaves.jpg”
- helper text “Todo requests this image from its host.”
- outlined secondary button “Use default background”
- wide terracotta bottom button “Save”
- no keyboard

Text (verbatim): use only the UI strings specified above; spell all labels correctly.
Constraints: accurate legible English typography; coherent alignment; clear row dividers; no clipped phone edges; do not imply account editing, themes, notification settings, or password controls; fictional identity only; no logos or watermarks.
Avoid: extra screens, duplicate controls, malformed text, decorative illustrations, blue/purple accent colors, glassmorphism, dense desktop UI.
```

## 02-labels-signout.png

```text
Use case: ui-mockup
Asset type: review board for a mobile Todo app UX design document
Primary request: Create one polished landscape design board containing exactly three tall iPhone-style screens, numbered with headings above them: “4 · Label visibility”, “5 · Visibility choice”, and “6 · Confirm sign out”. This is a high-fidelity product UX concept, not a photograph.
Scene/backdrop: warm off-white review-board background with generous spacing; each phone has a very light warm neutral app canvas, thin gray outline, subtle shadow, black home indicator, and simple 9:41 status bar.
Style/medium: crisp modern mobile settings UI; warm neutral palette; white grouped cards; dark brown-black typography; restrained terracotta accent (#B9513A); subtle cream circular icon wells; visually consistent with a companion board containing Profile, Item spacing, and Background screens.
Composition/framing: landscape board, three equal phones side by side, all fully visible, no hands or surrounding objects. Baseline phone layout around 390 × 844 CSS pixels. Use 16px side padding, 8px rhythm, 17px body text, 48px minimum rows.

Screen 4 exact content:
- back navigation “Profile”, centered title “Label visibility”
- search field with search icon and placeholder “Search labels”
- helper text “Changes affect everyone who edits these labels.”
- section label “LABELS”
- grouped white navigation rows, each with cream circular tag icon and right chevron:
  - primary “Archive”, secondary “Hidden”
  - primary “Private”, secondary “Fully hidden”
  - primary “Work”, secondary “Visible”
- information card at bottom with exact text “Visibility changes navigation and aggregate views. It is not privacy or access control.”
- no global Save button

Screen 5 exact content:
- back navigation “Labels”, centered title “Visibility”
- context line “Archive”
- helper text “Choose where this label and its lists appear.”
- section label “VISIBILITY”
- grouped white radio list with three large rows:
  - primary “Visible”, secondary “Show normally and include in aggregate views”, unselected
  - primary “Hidden”, secondary “Keep in Lists; exclude its lists from aggregate views”, selected with terracotta radio/check and a very subtle selected background
  - primary “Fully hidden”, secondary “Show only in Profile settings; exclude its lists from aggregate views”, unselected
- small warning/information text “This is not a privacy setting.”
- wide terracotta bottom button “Save”
- no keyboard

Screen 6 exact content:
- back navigation “Profile”, centered title “Sign out”
- circular fictional avatar containing initials “AK”
- large heading “Sign out of Todo?”
- name “Alex Kim”
- email “alex@example.com”
- body text “You can sign in again to return to your synced lists.”
- smaller text “Make sure recent changes have finished syncing first.”
- outlined wide button “Keep me signed in”
- solid restrained red/terracotta wide button “Sign out”
- generous empty space below; no Save button

Text (verbatim): use only the UI strings specified above; spell all labels correctly.
Constraints: accurate legible English typography; coherent alignment; clear row dividers; no clipped phone edges; explain shared label-setting scope and non-privacy semantics; fictional identity only; no logos or watermarks.
Avoid: extra screens, duplicate controls, malformed text, label checkboxes on the overview, a root Save button on Label visibility, password controls, account deletion, notification preferences, blue/purple accent colors, glassmorphism, dense desktop UI.
```
