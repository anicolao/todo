# Phone mock-up generation prompts

Generated September 16, 2026 with the built-in image generation tool. Mode: fresh generation for each board, followed by a targeted edit of Board 1 to remove unsupported invitation cancellation. Written design governs exact behavior.

## Board 1: initial generation

Use case: ui-mockup. Create a high fidelity landscape design review board with THREE flat phone screens side by side, each 390x844 logical points. No perspective or hardware. Warm ivory background, white grouped cards, dark brown text, muted terracotta accent, system sans typography 17pt, 48pt touch targets. Same coherent native-feeling Todo app design throughout. Status bars and home indicators. Outside headings "1 · List details", "2 · Sharing", "3 · Labels".
Phone 1 full height editor: top bar "Cancel", "List details", filled terracotta "Save". Persistent label "LIST NAME", multiline field "Weekend plans". Group heading "ORGANIZE & SHARE". Large row people icon "Sharing", secondary "1 person · 1 pending", chevron. Large row tag icon "Labels", secondary "Personal, Summer", chevron. Helper "Changes apply when you save." Spacious lower area, separated red outlined wide button "Delete list…" near bottom.
Phone 2 top back "Details", title "Sharing". Context "Weekend plans". Search field "Search people". Helper "Choose from people already in the app." White card section "SHARED WITH": avatar ML, "Morgan Lee", "morgan@example.com", secondary "Shared", trailing checked checkbox. Second row avatar AK, "Alex Kim", "alex@example.com", text status "Invitation pending", trailing small "Cancel invite" button. Section "ADD PEOPLE": avatar SR, "Sam Rivera", "sam@example.com", trailing unchecked checkbox. Below helper "Invitations and removals apply on Save." Bottom pinned terracotta wide "Done".
Phone 3 top back "Details", title "Labels", context "Weekend plans". Search field "Search labels". Helper "Include this list in these labels." Three full width white rows with checkboxes: "Personal" checked, "Summer" checked, "Work" unchecked. Below outlined full width "+ Create label" button. Helper "Tasks stay in their original list." Bottom pinned terracotta wide "Done".
Constraints: exact legible text; realistic spacious layout, no ownership badges, no roles, no arbitrary email invite input, no drag handles, no nested floating dialog. Design proposal, not a running app screenshot.

## Board 1: correction

Input: generated Board 1. Final output: `01-details-sharing-labels.png`.

Edit this design board only in the middle Sharing phone: remove the 'Cancel invite' button completely from Alex Kim's row, leave that trailing area empty. Preserve Alex Kim, alex@example.com and Invitation pending as a read-only text status. Pending invitations cannot be cancelled in this proposal. Preserve all other text, three-screen layout, spacing, colors, and design exactly.

## Board 2

Output: `02-create-review-recovery.png`.

Use case: ui-mockup. High fidelity UX design review board THREE flat phone screens 390x844 logical points each side by side, no hardware/perspective. Warm ivory background, white cards, dark brown system sans text, muted terracotta primary buttons. 17pt body, 48pt controls, clear readable typography. Status bars, safe bottom home indicators. Outside headings "4 · Create a label", "5 · Review changes", "6 · Save needs attention".
Phone 4 full height editor top back "Labels", center "New label". Context "For Weekend plans". Field persistent label "LABEL NAME", focused input "Summer". Helper "This label will include Weekend plans when you save." Bottom primary "Add to draft" immediately above realistic iPhone alphabetic keyboard. Header and field remain visible, no modal over modal.
Phone 5 top Cancel / List details / filled Save. LIST NAME field "Weekend plans". White row "Sharing", secondary "1 person · 1 invitation to send", chevron. White row "Labels", secondary "Personal, Summer", chevron. Pale card heading "ON SAVE", lines "Invite Sam Rivera", "Create Summer and include this list". Helper "Done on a sub-screen only updates this draft." Separated red outline "Delete list…" near bottom.
Phone 6 top Cancel / List details / disabled Save. LIST NAME "Weekend plans". Rows Sharing and Labels, same style as phone5. Inline pale error card heading "Some changes need attention", body "Name saved. Sharing could not be updated.", secondary "Your remaining changes are still here.", prominent "Retry remaining changes" button. Small helper "Review changes before leaving." No keyboard, no toast-only failure, no success checkmark.
Constraints: not screenshots of running code; exact readable text; coherent restrained design; spacious production-plausible mobile forms; no arbitrary email invitations, permissions roles, unsupported data controls.
