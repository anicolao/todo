# Phone mock-up revision prompts

Mode: built-in image generation, editing the original review boards. The original assets and generation prompts remain in commit `d52d9f5`. These revisions replace the published boards to use independent setting saves and a Delete list settings row. The written specification governs behavior and exact sizing.

## Board 1

Edit target: original `01-details-sharing-labels.png` from `d52d9f5`. Output: `01-details-sharing-labels.png`.

Use case: ui-mockup. Revise attached three-phone board, preserving palette, typography, high fidelity flat phone format and overall visual style. Entire new interaction: settings hub has no Save; each child screen saves its own changes. Exact outside headings "1 · List settings", "2 · Save sharing", "3 · Save labels".
Phone1: top left "Close", centered "List details", no right action. No editable field. Group heading SETTINGS and three white full-width navigation rows: pencil icon "Name" with second line "Weekend plans" chevron; people icon "Sharing" second line "1 person · 1 pending" chevron; tag icon "Labels" second line "Personal, Summer" chevron. Helper "Open a setting to make changes." Then only 24px gap, heading "LIST ACTIONS", ordinary white settings row with red trash icon, red label "Delete list…", gray secondary "Confirmation required", chevron. This row has same geometry as other settings; NO outlined or filled destructive button, NO footer action; leave generous empty space below row through home indicator.
Phone2: title Sharing, back Details; preserve searchable known people, Morgan shared checked, Alex invitation pending read-only, Sam unchecked. Helper "Save sends invitations and removal requests." Bottom primary button "Save", replacing Done. No reference to root Save or draft applied elsewhere.
Phone3: title Labels back Details; preserve search, Personal and Summer checked Work unchecked, Create label control and source-task helper. Bottom primary button "Save", replacing Done.
Do not put Delete list on any child screen. No Done text anywhere. Keep legibility, realistic 48px targets, no owner roles or invite cancellation.

## Board 2

Edit target: original `02-create-review-recovery.png` from `d52d9f5`. Output: `02-name-label-delete.png`.

Use case: ui-mockup. Replace all three screen contents on attached board for revised Todo list settings. Preserve flat 390x844 phone scale, warm ivory/white surfaces, brown typography, terracotta primary actions, realistic touch controls and crisp exact text. Outside headings "4 · Save a name", "5 · Create within Labels", "6 · Confirm deletion".
Phone4: back "Details", title "Name". Label "LIST NAME", focused multiline field "Weekend adventures". Helper "Save updates this list's name." Wide terracotta "Save" pinned immediately above realistic iPhone alphabetic keyboard. No root save, no Delete.
Phone5: back "Details", title "Labels", context "Weekend plans". Compact white selectable rows "Personal" checked, "Work" unchecked. Below inline creation card with title "NEW LABEL", focused field "Summer", helper "Save creates this label and includes the list.", text control "Cancel new label". Single wide terracotta "Save" pinned above realistic alphabetic keyboard. No second Add to draft / Done / Save button. Inline composer is part of Labels, not another screen.
Phone6: back "Details", title "Delete list". Upper content full heading 'Delete “Weekend plans”?' with small trash icon. Body "This removes the list from navigation for people who receive this list's updates." Quiet note "Review the list name before deleting." Immediately below body (NOT pinned to bottom), prominent neutral white outlined "Keep list" button and below it clearly red "Delete list" button. Large blank lower half. This is a dedicated confirmation screen reached from a settings row, NOT the settings hub. No Save, no Done, no editable fields. Deletion is never a completion action.
All text readable, all controls fit above keyboard, no perspective or decorative content.

### Board 2 correction

Edit target: revised Board 2 above.

Change only the rightmost phone's 'Keep list' button: use dark brown/charcoal text and a light neutral gray border on white, not red text or border. Keep 'Delete list' red. Preserve every other element, text, screen, layout, keyboard and color exactly.
