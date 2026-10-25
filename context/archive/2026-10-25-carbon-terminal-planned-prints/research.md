---
date: 2026-10-25T07:17:32+01:00
researcher: Codex
git_commit: 29b69ff6c1437174d9ff5b233f3310ffd8a0a7af
branch: docs/close-milestone-1
repository: PrintPlan
topic: "Current Planned Prints view and gaps against the Carbon Terminal contract"
tags: [research, codebase, prints, ui, carbon-terminal]
status: complete
last_updated: 2026-10-25
last_updated_by: Codex
last_updated_note: Initial source-backed investigation, including a bounded browser reproduction of the expanded-panel CSS conflict.
---

# Research: Carbon Terminal planned prints

**Date:** 2026-10-25T07:17:32+01:00  
**Researcher:** Codex  
**Git commit:** 29b69ff6c1437174d9ff5b233f3310ffd8a0a7af  
**Branch:** docs/close-milestone-1  
**Repository:** PrintPlan; working tree clean before creating this change's artifacts.

## Research Question

What does the current Planned Prints view already provide, where does it diverge from the existing Carbon Terminal contract, and which behavior and verification contracts must a subsequent presentation change preserve?

The author selected this scope after clarification: investigate the current view and its gaps as groundwork for a new change. This research does not reopen the archived restyle, approve a plan, or implement production changes.

## Summary

The current view already uses `DashboardShell`, shared Carbon styles, and `CollectionTable`. The author accepted the Data Table presentation for prints and stock on 2026-10-23, after the original terminal restyle. That later choice is the starting point for planning (`src/pages/dashboard/prints.astro:36`; `src/components/prints/PrintList.tsx:1889`; `context/archive/2026-10-20-edit-reserved-print/verification.md:22`).

The strongest confirmed gap is a shared CSS conflict: at the `80rem` breakpoint, a mobile-width reset overrides expanded panels' full-row span. A local browser probe reproduced the computed-style consequence using current source CSS and synthetic table markup. A separate confirmed copy mismatch labels the desktop result column “Reserved” even when it contains actual consumption (`src/styles/global.css:508`, `:672`, `:725`; `src/components/prints/PrintList.tsx:1896`, `:1943`).

Expanded-panel table semantics and the hierarchy of the mixed planned/completed collection need further design and accessibility review. Current full-route screenshots, screen-reader behavior, and a complete visual state review were not produced in this investigation. Those limits do not invalidate the source and isolated CSS findings below.

## Detailed Findings

### Existing presentation and ownership

- The route applies private response headers, performs the authenticated list read, and renders a retryable page error or the `PrintList` island. Its heading is “Prints” and its description covers planned and completed prints (`src/pages/dashboard/prints.astro:8`, `:14`, `:20`, `:36`, `:51`).
- `DashboardShell` owns terminal navigation, the main landmark, and heading slots; `Topbar` owns account links, identity, active-route semantics, and sign-out (`src/layouts/DashboardShell.astro:15`; `src/components/Topbar.astro:21`). The mono aliases, spacing/control tokens, collection surfaces, form layout, and warning/error treatments live in the shared stylesheet (`src/styles/global.css:54`, `:165`, `:399`, `:569`, `:592`). Shared `Button` and `FormField` remain available for controls (`src/components/ui/button.tsx:7`; `src/components/ui/FormField.tsx:29`).
- The inspected table declares Print, Material, Required, Reserved/result, and Actions columns. Planned rows expose Reserve or Manage, Edit, Delete, and Settle when reserved; completed rows expose Review and Delete (`src/components/prints/PrintList.tsx:1892`, `:1953`).
- Create renders above the table. Edit, delete confirmation, reservation, and settlement render inside the owning row; detached settlement recovery renders after the table (`src/components/prints/PrintList.tsx:1858`, `:2040`, `:2069`, `:2124`, `:2153`, `:2164`). This distribution is important when changing layout: a review confined to the default table misses the workflow surfaces.
- Keep collection state, handlers, and API mutations in their owning collection and preserve gram DTO bindings, as the repository contract requires (`AGENTS.md:39`). Sharing presentation does not require a generic workflow controller.

### G1 — Expanded panels lose their full-row span on wide screens

**Observed source conflict.** `CollectionTableCell` emits `carbon-data-table-cell-mobile-wide` when `mobileFullWidth` is set (`src/components/ui/CollectionTable.tsx:74`). Print edit, delete, reservation, and settlement cells combine that class with `carbon-data-table-panel`; edit/delete also use `carbon-row-inline-panel` (`src/components/prints/PrintList.tsx:2041`, `:2070`, `:2129`, `:2154`).

The panel selectors declare `grid-column: 1 / -1`, but the later `@media (min-width: 80rem)` mobile-wide selector declares `grid-column: auto` at the same class specificity. In that media branch the parent row has a five-track grid (`src/styles/global.css:508`, `:604`, `:672`, `:677`, `:725`). The reset therefore wins for these combined classes.

**Bounded browser confirmation.** The primary investigator ran an ephemeral headless Chromium probe with the current `src/styles/global.css` and minimal DOM matching the emitted cell classes. It included an edit row with its ordinary data cells followed by the edit panel, and a reservation row with its ordinary data/actions cells followed by the reservation panel. With the browser's default root sizing, both panel fixtures reported `grid-column-start: 1` / `grid-column-end: -1` at a 390px viewport, and `auto` / `auto` at 1280px and 1440px viewports. The edit fixture occupied the action track; the reservation fixture occupied the next row's first track. These measured conditions correspond to the source selectors above. Stylesheet SHA-256: `1cafb56f884fc8cdac378cfb6ed791a2410cab1b64c2d9557563181deae8268a`.

This probe establishes the CSS interaction, not full application appearance: it used source CSS in a style element, no compiled utility processing, app hydration, account, API requests, or saved records. No screenshot was retained. Planning should verify the complete built view before and after a fix.

**Shared impact.** Stock edit/delete cells use the same class combination (`src/components/spools/SpoolInventory.tsx:447`, `:474`). Addressing the shared span contract therefore requires checking those stock panels as well as print panels. This is a bounded dependency of the new view change, rather than grounds for reopening stock workflows.

### G2 — Expanded-panel semantics do not model a separate detail row

`CollectionTableRow` renders an article with `role="row"`, and its cell primitive emits `role="cell"` with the supplied `aria-colspan` (`src/components/ui/CollectionTable.tsx:53`, `:70`). In the inspected print markup, edit/delete panels append a cell with `ariaColSpan={5}` after the ordinary data cells; reservation/settlement append such a cell after the ordinary data and action cells (`src/components/prints/PrintList.tsx:1909`, `:2041`, `:2070`, `:2129`, `:2154`).

The panel remains a sibling cell inside the original accessible row even when CSS intends it to occupy a separate full-width visual line. Treat this as a structural accessibility gap to resolve alongside the panel contract. Screen-reader interpretation has not been exercised, so this research does not claim a particular spoken output. CSS span repair alone would leave that markup relationship in place.

### G3 — The visible result heading disagrees with its contents

The wide-screen heading reads “Reserved”; its accessible name and mobile cell label read “Reservation / result.” Completed rows render “Actual consumption” and consumed grams under that same column (`src/components/prints/PrintList.tsx:1896`, `:1935`, `:1943`). This mismatch is visible in the source without requiring a new data feature. Any revised label must preserve the distinction between required estimates, held reservation grams, and actual consumption.

### G4 — Collection hierarchy and contextual guidance need a deliberate choice

These are grounded design candidates, not demonstrated rendering failures:

- Navigation says “Planned prints,” the collection eyebrow says “Your queue,” and its empty heading says “No planned prints yet,” while the route and collection introductions include completed prints (`src/components/Topbar.astro:41`; `src/components/prints/PrintList.tsx:1717`, `:1721`, `:1883`; `src/pages/dashboard/prints.astro:36`). Decide whether the visible naming should describe the mixed collection more consistently. This does not imply new filtering, tabs, or changed membership.
- The route's description explains reservation preview, account margin, release, settlement, automatic cancellation, and completed deletion before the collection (`src/pages/dashboard/prints.astro:38`). A shorter introduction with contextual workflow help is a possible hierarchy improvement; excessive scrolling has not been measured. Preserve the explanations required by the product rules when moving them (`context/foundation/prd.md:93`, `:112`, `:113`, `:123`, `:125`).
- Eligible-spool labels use material, colour, and available grams. Distinct eligible spools sharing those values can have the same description, except for a best-fit annotation (`src/components/prints/ReservationPanel.tsx:22`, `:118`). Decide whether visible short identity would help manual selection; do not infer physical spool labels the app does not store.
- Reserved management describes the print version, and the edit form displays a version (`src/components/prints/ReservationPanel.tsx:60`; `src/components/prints/PrintForm.tsx:347`). Consider user-facing stale-view guidance while preserving versioned commands internally. The value of exposing that technical detail is a design question.

### Behavior contracts a presentation change must preserve

- **Quantities and completion:** `PrintDto` carries requirements, version, reservation, and settlement; the inspected mapper rejects a completed print with an active reservation. `SpoolDto` maps recorded, reserved, and available quantities independently (`src/lib/prints.ts:30`, `:68`; `src/lib/spools.ts:16`, `:47`). Settlement presentation distinguishes historical receipt quantities from current stock (`src/components/prints/SettlementPanel.tsx:219`, `:278`).
- **Identity and drafts:** rows use `key={print.id}`. The current edit form uses ID plus `editFormResetVersion`, with an explicit reset after a successful latest-read path (`src/components/prints/PrintList.tsx:1909`, `:2048`, `:1211`). Preserve that mechanism instead of copying the older ID/version key recommendation. Visible IDs are shortened while full identity remains available through tooltip and screen-reader text (`:1915`).
- **Edits and conflicts:** the form captures an immutable command with the original expected version and input strings; conflict recovery retains entries and offers a latest read (`src/components/prints/PrintForm.tsx:125`, `:210`, `:365`). A reserved edit with insufficient material is a successful save without a reservation (`src/components/prints/PrintList.tsx:219`).
- **Exact recovery:** uncertain edit/release paths retain the captured command, retry it without advancing to a newer version, and reconcile print and stock reads. Either read failure keeps the recovery guard active (`src/components/prints/PrintList.tsx:237`, `:331`, `:431`). Ordinary refresh routes active recovery through its resolver and asks before discarding open entries (`:1157`). A fresh GET does not replace exact-command resolution.
- **Reservation and settlement:** keep preview freshness checks and captured confirmation/cancellation inputs (`src/components/prints/PrintList.tsx:1228`, `:1335`, `:1452`). Keep settlement's captured command, unresolved-null-receipt handling, retry/status controls, and paired-read guards (`:714`, `:747`, `:594`; `src/components/prints/SettlementPanel.tsx:165`). Completed-print deletion must retain the page's detached settlement review without presenting a stock refund (`src/components/prints/PrintList.tsx:1592`, `:2164`).
- **Focus and feedback:** preserve action IDs and collection focus restoration, full print identity, status live regions, warning/error distinctions, disabled controls, and the settlement heading target (`src/components/prints/PrintList.tsx:202`, `:1050`, `:1756`, `:1760`; `src/components/prints/SettlementPanel.tsx:74`).

### Existing verification and remaining visual evidence

The inspected browser suites already cover validation focus and stale drafts, reserved edits and stale cancellation, preview freshness/manual selection, exact edit/release recovery, held requests, settlement retries, and failed reconciliation reads. Reuse these sources rather than replacing behavior checks with presentation mocks (`tests/e2e/print-recovery.spec.ts:12`, `:51`, `:134`; `tests/e2e/reserved-print-editing.spec.ts:4`, `:129`, `:166`; `tests/e2e/reservation-recovery.spec.ts:6`, `:1065`; `tests/e2e/settlement-recovery.spec.ts:17`, `:131`, `:173`; `tests/e2e/exact-command-recovery.spec.ts:7`).

The reserved-edit test checks header visibility at 1280px and its hidden state/mobile labels at 390px, but that inspected sequence does not assert expanded-panel width (`tests/e2e/reserved-print-editing.spec.ts:27`). The configured browser project is Chromium with one worker and screenshots on failure (`playwright.config.ts:16`, `:25`, `:48`). Inspection of the named print, reserved-edit, reservation, settlement, and exact-command suites found no screenshot-comparison assertions, hover exercises, or 320px viewport cases. This bounded finding does not claim absence of visual checking elsewhere.

Tests locate the queue by its table name and rows by full print identity; some assertions use material/required/result classes (`tests/e2e/helpers/ui.ts:58`; `tests/e2e/reserved-print-editing.spec.ts:31`). If table semantics change, update the affected locators to preserve their behavior assertions.

For the subsequent change, retain fresh built-view evidence for default, hover, focus-visible, disabled, loading, error, and empty states, plus reserved/completed rows and expanded panels. Include desktop and narrow layouts, long labels/IDs, conflict drafts, no-fit success, uncertain commands, and saved-result/current-stock distinction. The prior state matrix provides a useful review pattern, not current acceptance (`context/archive/2026-10-12-carbon-terminal-spools/verification.md:33`). Product usability still includes Chrome, Firefox, and phones (`context/foundation/prd.md:110`).

## Architecture Insights

The current reusable boundary is the shell, token source, controls, and collection table; the owning print collection coordinates the workflows. The first planning concern is the shared detail-panel contract, including visual span and accessible structure. Copy and information hierarchy can then be evaluated against the current mixed collection. No missing palette or requirement for a new dependency was established by this research.

## Historical Context

- **Original stock-only scope: superseded within its own change.** The initial notes selected the spool view, but the recorded revision expanded to Planned Prints and Dashboard (`context/archive/2026-10-12-carbon-terminal-spools/change.md:12`, `:16`). That archive is evidence, not the write target.
- **Original terminal acceptance: supported as historical acceptance.** The archived verification records author acceptance and desktop/phone state evidence on 2026-10-13 (`context/archive/2026-10-12-carbon-terminal-spools/verification.md:4`, `:9`, `:60`). It does not establish current workflow or layout acceptance.
- **Later Data Table choice: supported and the current baseline.** The author selected the table presentation and confirmed prints/stock layouts on desktop and phone on 2026-10-23 (`context/archive/2026-10-20-edit-reserved-print/verification.md:20`). Current `CollectionTable` usage supports the recorded adoption (`src/components/prints/PrintList.tsx:1889`; `src/components/spools/SpoolInventory.tsx:367`). Preserve that decision unless the author explicitly changes it.
- **Reservation-free DTOs and zero reserved stock: superseded.** Those observations belonged to the earlier snapshot (`context/archive/2026-10-12-carbon-terminal-spools/research.md:52`, `:119`). Current print and stock mappers carry reservation/settlement and actual stock quantities (`src/lib/prints.ts:30`, `:68`; `src/lib/spools.ts:47`). The earlier warning to preserve quantity meanings still applies (`AGENTS.md:39`).
- **Edit form keyed by ID/version: superseded.** The archived recommendation records that older key (`context/archive/2026-10-12-carbon-terminal-spools/research.md:125`); current code uses an explicit reset counter (`src/components/prints/PrintList.tsx:2048`).
- **Reserved-print recalculation still planned: stale status guidance.** `AGENTS.md:41` contains that sentence, but current code renders recalculation outcomes and the later archive records completed acceptance (`src/components/prints/PrintList.tsx:219`; `context/archive/2026-10-20-edit-reserved-print/verification.md:22`). This research does not edit the repository guide.

## Code References

- `src/styles/global.css:454`, `:508`, `:672`, `:725` — shared table geometry and conflicting span reset.
- `src/components/ui/CollectionTable.tsx:30`, `:53`, `:61` — shared table, row, and cell semantics.
- `src/components/prints/PrintList.tsx:1713`, `:1881`, `:2040`, `:2164` — collection presentation and inline/detached workflows.
- `src/components/prints/PrintForm.tsx:125`, `:246`, `:354` — captured edits, fields, and recovery feedback.
- `src/components/prints/ReservationPanel.tsx:41`, `:86` — active reservation and preview surfaces.
- `src/components/prints/SettlementPanel.tsx:73`, `:186`, `:278` — settlement input, saved result, and current stock.

## Related Research

- [Original Carbon Terminal research](../../archive/2026-10-12-carbon-terminal-spools/research.md) — historical reuse decisions, qualified above.
- [Reserved-print editing research](../../archive/2026-10-20-edit-reserved-print/research.md) — context for the later behavior baseline; current controller source is authoritative for this handoff.

## Open Questions and Handoff

Planning can proceed from G1–G3 without rediscovering the existing shell or table. It should settle the shared detail-panel representation and result-column wording, and choose how much of G4 belongs in this view change. The mixed collection's naming, placement of explanatory copy, and visibility of technical identifiers remain design choices, not approved product changes.

Current full-route geometry, contrast, keyboard appearance, and screen-reader interpretation remain unverified here. Resolve those through the subsequent view's visual/accessibility gate. Do not turn the old screenshots into acceptance for the current reservation and settlement panels.

Investigation coverage: read-only source/history work across the route, shell/navigation, stylesheet, shared controls/table, print form and workflow panels, current DTOs, relevant stock panel consumers, and named browser suites. The parallel investigations completed before synthesis. The isolated CSS probe answered G1; no app build, project test suite, authenticated browser flow, or backend mutation ran. Changes in this turn are confined to this new change's identity and research artifacts.
