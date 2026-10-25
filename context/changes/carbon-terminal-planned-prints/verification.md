# Carbon Terminal planned prints — verification evidence

Status: follow-up built-route evidence is prepared at revision `34488c8`. The author reports that all manual reviews are complete; the source and limits of that report are recorded below.

## Original capture provenance (677ce82)

- Built route revision: `677ce82` (`Prints naming and contextual guidance`). The checked-in application source was unchanged during capture; the local preview used the existing production build on `127.0.0.1:4322` because port 4321 was occupied by the development server.
- Browser: Google Chrome 155.0.8059.39. The capture window was 1440 × 1000, 390 × 844, or 320 × 844 CSS pixels as listed in the evidence index. The capture scripts recorded the revision, browser, viewport, state, and horizontal overflow for each screenshot.
- Routes: authenticated, hydrated `/dashboard/prints` and `/dashboard/spools` from the built app. A temporary local Supabase account and generated records were used. The records were removed through the application API, the account was deleted, and no password, cookie, fixture ledger, or auth-state file was retained. Screenshots include the generated local account label in the navigation.
- Interception labels: reservation-preview and list-refresh loading captures held the request briefly, then continued to the real API. The controlled 503 capture is an intentionally intercepted error. The exact-edit retry capture committed the first real update and intentionally aborted its reply before retrying the same command. These are labeled separately from ordinary API-backed captures.

## Before and after geometry

The Phase 1 baseline captures are retained here: [print edit, 1440px](reviews/phase-1/before-print-edit-1440.png), [print edit, 390px](reviews/phase-1/before-print-edit-390.png), [stock edit, 1440px](reviews/phase-1/before-spool-edit-1440.png), and [stock edit, 390px](reviews/phase-1/before-spool-edit-390.png). Current built-route examples are [print edit, 1440px](reviews/phase-3/prints.edit-panel.chrome.1440.png), [print edit, 390px](reviews/phase-3/prints.edit-panel.chrome.390.png), [stock edit, 1440px](reviews/phase-3/spools.edit-panel.chrome.1440.png), and [stock edit, 390px](reviews/phase-3/spools.edit-panel.chrome.390.png).

Direct browser geometry readings for print and stock edit details are in [geometry-measurements.json](reviews/phase-3/geometry-measurements.json). At 320, 390, 1279, 1280, and 1440px, both detail rows began at the summary bottom (0px gap), the detail surface stayed inside its record with 16–17px side insets, and the surface occupied 0.8702–0.9713 of record width. No horizontal overflow was measured in these ten probes.

## Chrome route and panel captures

Each item links to a real built-route screenshot. Phone means 390px; the additional 320px examples exercise the narrowest layout.

| Surface | 1440px | 390px | 320px |
| --- | --- | --- | --- |
| Mixed prints collection | [default](reviews/phase-3/prints.default.chrome.1440.png) | [default](reviews/phase-3/prints.default.chrome.390.png) | [default](reviews/phase-3/prints.default.chrome.320.png) |
| Create print | [panel](reviews/phase-3/prints.create-panel.chrome.1440.png) | [panel](reviews/phase-3/prints.create-panel.chrome.390.png) | — |
| Edit planned print | [panel](reviews/phase-3/prints.edit-panel.chrome.1440.png) | [panel](reviews/phase-3/prints.edit-panel.chrome.390.png) | — |
| Edit reserved print | [recalculation guidance](reviews/phase-3/prints.reserved-edit-guidance.chrome.1440.png) | [recalculation guidance](reviews/phase-3/prints.reserved-edit-guidance.chrome.390.png) | — |
| Delete planned print | [confirmation](reviews/phase-3/prints.delete-confirmation.chrome.1440.png) | [confirmation](reviews/phase-3/prints.delete-confirmation.chrome.390.png) | — |
| Delete completed print | [no-refund warning](reviews/phase-3/prints.completed-delete-warning.chrome.1440.png) | [no-refund warning](reviews/phase-3/prints.completed-delete-warning.chrome.390.png) | — |
| Reservation preview | [panel](reviews/phase-3/prints.reservation-preview.chrome.1440.png) | [panel](reviews/phase-3/prints.reservation-preview.chrome.390.png) | [panel with duplicate spool choices](reviews/phase-3/prints.reservation-preview.chrome.320.png) |
| Reservation management | [panel](reviews/phase-3/prints.reservation-management.chrome.1440.png) | [panel](reviews/phase-3/prints.reservation-management.chrome.390.png) | — |
| Settlement input | [panel](reviews/phase-3/prints.settlement-input.chrome.1440.png) | [panel](reviews/phase-3/prints.settlement-input.chrome.390.png) | — |
| Settlement result/review | [panel](reviews/phase-3/prints.settlement-review.chrome.1440.png) | [panel](reviews/phase-3/prints.settlement-review.chrome.390.png) | — |
| Stock edit | [panel](reviews/phase-3/spools.edit-panel.chrome.1440.png) | [panel](reviews/phase-3/spools.edit-panel.chrome.390.png) | — |
| Stock delete | [confirmation](reviews/phase-3/spools.delete-confirmation.chrome.1440.png) | [confirmation](reviews/phase-3/spools.delete-confirmation.chrome.390.png) | — |

## Seven-state matrix and recovery evidence

| State | Indexed representative |
| --- | --- |
| Default | Mixed planned, reserved, and completed records with long labels at [1440px](reviews/phase-3/prints.default.chrome.1440.png), [390px](reviews/phase-3/prints.default.chrome.390.png), and [320px](reviews/phase-3/prints.default.chrome.320.png). |
| Hover | Enabled row action ([Edit](reviews/phase-3/states.hover.print-row-action.chrome.1440.png)), toolbar action ([Add a print](reviews/phase-3/states.hover.toolbar-add-print.chrome.1440.png)), and destructive confirmation ([Confirm deletion](reviews/phase-3/states.hover.destructive-confirmation.chrome.1440.png)). The destructive action was not activated. |
| Focus-visible | [Edit action reached by keyboard Tab](reviews/phase-3/states.focus-visible.print-row-action.chrome.1440.png). The browser recorded a dark 2px and light 5px `box-shadow` focus ring; the computed `outline-style` was `none`. This is a browser observation, not a human contrast or assistive-technology review. |
| Disabled | A held save shows the disabled `Saving…` button and disabled form controls at readable viewport scale ([390px crop](reviews/phase-3/states.disabled.pending-save-controls.chrome.390.png)); [full route](reviews/phase-3/states.disabled.pending-print-save.chrome.390.png) also shows disabled collection actions. The POST was held locally and later returned a controlled 503 without creating a record. |
| Loading | Client list refresh ([1440px](reviews/phase-3/states.loading.print-refresh.chrome.1440.png)) and reservation preview ([390px](reviews/phase-3/prints.reservation-preview.loading.chrome.390.png)). Both requests continued to the real API after capture. |
| Error | Real validation feedback ([390px](reviews/phase-3/states.error.print-create-validation.chrome.390.png)); explicitly controlled 503 ([390px](reviews/phase-3/states.error.controlled-print-503.chrome.390.png)); stale edit warning with retained draft ([390px](reviews/phase-3/states.error.conflict-retained-draft.chrome.390.png)); uncertain captured edit with same-attempt retry ([390px](reviews/phase-3/states.uncertain-exact-edit-retry.chrome.390.png)). |
| Empty | A fresh temporary account had zero print records. [1440px](reviews/phase-3/states.empty.prints.chrome.1440.png) and [390px](reviews/phase-3/states.empty.prints.chrome.390.png) show “No prints yet”; the `Add a print` action was verified enabled before capture. |

Additional outcome evidence preserves the workflow consequences: a [successful no-fit reserved edit](reviews/phase-3/states.success.no-fit-edit.chrome.1440.png) and [phone view](reviews/phase-3/states.success.no-fit-edit.chrome.390.png), [detached settlement review after completed-print deletion](reviews/phase-3/prints.detached-settlement-review.chrome.390.png), and [historical receipt/current stock quantities](reviews/phase-3/prints.settlement-review.chrome.1440.png). The completed deletion warning is shown before the delete action in the panel index above. [Duplicate spool choices](reviews/phase-3/prints.reservation-preview.chrome.320.png) visibly retain matching material, colour, and available grams while showing distinct short record IDs; the full ID remains available through its accessible text and tooltip in the UI.

The exact-retry browser observation confirms that the first edit and retry POST bodies were byte-for-byte equal; the body itself was not retained. That observation is recorded in [measurements.json](reviews/phase-3/measurements.json). The [focused state captures](reviews/phase-3/interaction-measurements.json) and [consequence captures](reviews/phase-3/consequence-measurements.json) record the additional hover and readable pending-save view.

## Browser measurements from the original capture

Across 53 recorded page measurements, horizontal overflow was 0px. The separate ten-point detail geometry sample also measured 0px detail gap and no horizontal overflow. The screenshots and [measurements.json](reviews/phase-3/measurements.json), [geometry-measurements.json](reviews/phase-3/geometry-measurements.json), [interaction-measurements.json](reviews/phase-3/interaction-measurements.json), and [consequence-measurements.json](reviews/phase-3/consequence-measurements.json) record browser, viewport, revision, state, and measured widths. Focus-ring CSS values are recorded for the keyboard sample; no contrast ratio was calculated.

At the time of this original capture, no human acceptance was recorded, Firefox was unavailable, and no screen-reader/browser combination was available. The follow-up below supersedes the browser-availability and author-status notes for the current revision. It does not replace a human screen-reader review with screenshots or browser automation.

The Phase 3 automated gates (`verify:deploy`, the complete Chromium suite, and authenticated HTTP smoke) were not run by this evidence-preparation pass; the main `/goal` run owns those gates. Screenshots and browser measurements do not imply that those gates passed.

The shared dashboard record/detail rule is in [AGENTS.md](../../../AGENTS.md#structure-and-conventions).

## Follow-up captures after the workbench layout change (34488c8)

The following images refresh the changed desktop and phone layouts. They supplement the Phase 1 before captures and the earlier seven-state evidence above; they do not overwrite historical screenshots.

- Built preview from revision `34488c8` at `http://127.0.0.1:4324`; the development server on port 4321 remained running.
- 42 full-page captures: 29 in Chrome 156.0.8078.4 and 13 in Firefox 157.0, at 1440 × 1000, 390 × 844 and 320 × 844 CSS pixels.
- Every capture recorded 0px horizontal overflow. No captured state showed the transient “The settlement is saved. Both current collections must be read” banner.
- A temporary local test account and records were created for the capture and removed by the fixture teardown. No password, cookie or auth-state file was retained.
- Full per-image metadata is in [capture-index.json](reviews/phase-3/follow-up-34488c8/capture-index.json).

| Surface | Chrome | Firefox |
| --- | --- | --- |
| Prints default | [1440px](reviews/phase-3/follow-up-34488c8/prints.default.chrome.1440.png), [390px](reviews/phase-3/follow-up-34488c8/prints.default.chrome.390.png), [320px](reviews/phase-3/follow-up-34488c8/prints.default.chrome.320.png) | [1440px](reviews/phase-3/follow-up-34488c8/prints.default.firefox.1440.png), [390px](reviews/phase-3/follow-up-34488c8/prints.default.firefox.390.png), [320px](reviews/phase-3/follow-up-34488c8/prints.default.firefox.320.png) |
| Print edit | [1440px](reviews/phase-3/follow-up-34488c8/prints.edit-panel.chrome.1440.png), [390px](reviews/phase-3/follow-up-34488c8/prints.edit-panel.chrome.390.png) | [1440px](reviews/phase-3/follow-up-34488c8/prints.edit-panel.firefox.1440.png) |
| Planned and completed print deletion | [planned, 1440px](reviews/phase-3/follow-up-34488c8/prints.planned-delete-confirmation.chrome.1440.png), [planned, 390px](reviews/phase-3/follow-up-34488c8/prints.planned-delete-confirmation.chrome.390.png), [completed, 1440px](reviews/phase-3/follow-up-34488c8/prints.completed-delete-warning.chrome.1440.png), [completed, 390px](reviews/phase-3/follow-up-34488c8/prints.completed-delete-warning.chrome.390.png) | — |
| Reservation preview and management | [preview, 1440px](reviews/phase-3/follow-up-34488c8/prints.reservation-preview.chrome.1440.png), [390px](reviews/phase-3/follow-up-34488c8/prints.reservation-preview.chrome.390.png), [320px](reviews/phase-3/follow-up-34488c8/prints.reservation-preview.chrome.320.png); [management, 1440px](reviews/phase-3/follow-up-34488c8/prints.reservation-management.chrome.1440.png), [390px](reviews/phase-3/follow-up-34488c8/prints.reservation-management.chrome.390.png) | [preview, 390px](reviews/phase-3/follow-up-34488c8/prints.reservation-preview.firefox.390.png) |
| Settlement input, confirmation and review | [input, 1440px](reviews/phase-3/follow-up-34488c8/prints.settlement-input.chrome.1440.png), [390px](reviews/phase-3/follow-up-34488c8/prints.settlement-input.chrome.390.png), [320px](reviews/phase-3/follow-up-34488c8/prints.settlement-input.chrome.320.png); [confirmed, 390px](reviews/phase-3/follow-up-34488c8/prints.settlement-confirmed.chrome.390.png); [review, 1440px](reviews/phase-3/follow-up-34488c8/prints.settlement-review.chrome.1440.png), [390px](reviews/phase-3/follow-up-34488c8/prints.settlement-review.chrome.390.png), [320px](reviews/phase-3/follow-up-34488c8/prints.settlement-review.chrome.320.png) | [review, 320px](reviews/phase-3/follow-up-34488c8/prints.settlement-review.firefox.320.png) |
| Stock default | [1440px](reviews/phase-3/follow-up-34488c8/spools.default.chrome.1440.png), [390px](reviews/phase-3/follow-up-34488c8/spools.default.chrome.390.png) | [1440px](reviews/phase-3/follow-up-34488c8/spools.default.firefox.1440.png), [390px](reviews/phase-3/follow-up-34488c8/spools.default.firefox.390.png), [320px](reviews/phase-3/follow-up-34488c8/spools.default.firefox.320.png) |
| Stock edit and delete | [edit, 1440px](reviews/phase-3/follow-up-34488c8/spools.edit-panel.chrome.1440.png), [390px](reviews/phase-3/follow-up-34488c8/spools.edit-panel.chrome.390.png); [delete, 1440px](reviews/phase-3/follow-up-34488c8/spools.delete-confirmation.chrome.1440.png), [390px](reviews/phase-3/follow-up-34488c8/spools.delete-confirmation.chrome.390.png) | [edit, 1440px](reviews/phase-3/follow-up-34488c8/spools.edit-panel.firefox.1440.png), [390px](reviews/phase-3/follow-up-34488c8/spools.edit-panel.firefox.390.png); [delete, 1440px](reviews/phase-3/follow-up-34488c8/spools.delete-confirmation.firefox.1440.png), [390px](reviews/phase-3/follow-up-34488c8/spools.delete-confirmation.firefox.390.png) |

### Manual review attribution

On 2026-10-25, the author reported that the planned manual requirements had been completed and that screenshots were the remaining task. The plan checkboxes record that author report. This capture run generated the indexed images but did not repeat the human keyboard, screen-reader, contrast or 200% zoom/reflow review. The author did not provide the screen-reader/browser pairing or measurement notes in this run, so this document does not claim to have independently recorded those details.
