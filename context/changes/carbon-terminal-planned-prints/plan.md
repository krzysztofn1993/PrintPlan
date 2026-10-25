# Carbon Terminal Prints Implementation Plan

## Overview

Improve the existing mixed collection of planned and completed prints while preserving the accepted Carbon Terminal Data Table. Repair expanded-panel layout and accessibility, make the collection's names and guidance consistent, and retain current reservation, settlement, draft and recovery behavior.

Planning was approved on 2026-10-25: MEDIUM complexity, four substantive questions, and the three phases below. The author selected all four recommendations: consistent Prints naming, contextual help, short spool IDs, and plain-language messages without visible version numbers. This document authorizes no implementation by itself.

## Current State Analysis

- The authenticated route already renders a Prints heading, shared dashboard shell and hydrated collection; its introductory paragraph explains nearly every workflow before the collection (`src/pages/dashboard/prints.astro:36`).
- The author accepted the shared Data Table for prints and stock on 2026-10-23. Preserve that later baseline rather than restoring the older card presentation (`context/archive/2026-10-20-edit-reserved-print/verification.md:22`).
- At `80rem`, the mobile-wide cell reset overrides the full-row span intended for print and stock panels. Research reproduced this with isolated source-CSS markup, not the complete built route (`src/styles/global.css:508`, `:672`, `:725`; `research.md`, G1).
- Expanded forms currently append a spanning cell to the ordinary accessible row. Edit/delete also omit the Actions cell while open; a structural correction must retain five logical summary columns (`src/components/ui/CollectionTable.tsx:53`; `src/components/prints/PrintList.tsx:1953`; `src/components/spools/SpoolInventory.tsx:413`).
- The visible desktop heading says Reserved, while its accessible/mobile label says Reservation / result and completed records show actual consumption (`src/components/prints/PrintList.tsx:1896`, `:1935`, `:1943`).
- Eligible-spool descriptions can be identical. Version numbers and versioned-command terminology appear in ordinary edit and recovery UI (`src/components/prints/ReservationPanel.tsx:22`, `:60`; `src/components/prints/PrintForm.tsx:347`; `src/components/prints/PrintList.tsx:320`).
- Existing browser fixtures exercise real authenticated APIs, drafts, exact retries and settlement receipts. The suite runs one Chromium worker against a built preview; failure screenshots are not a reviewed visual baseline (`tests/e2e/fixtures.ts:147`; `playwright.config.ts:16`, `:25`, `:29`).

## Desired End State

- Navigation and table are named Prints; the collection eyebrow is Your prints and its empty heading is No prints yet. Dashboard and stock links use the same destination name. Descriptions may still say planned prints when that specific state is intended.
- Each record has a five-cell summary row and optional separate detail rows, visually grouped together. Every detail surface fills the record's content width on desktop and phones, with valid table relationships and usable keyboard navigation.
- The desktop heading, accessible heading and mobile label all say Reservation / result. Required estimates, held reservations and actual consumption retain their existing meanings and DTO bindings.
- A short introduction leads into the collection. Workflow panels explain consequences before confirmation, including margin freshness, releasing without consumption, actual settlement, automatic cancellations and deleting completed records without refunding stock.
- Manual spool selection distinguishes otherwise identical records with short IDs and accessible full IDs. Print edit and recovery guidance describes the situation and next action without exposing numeric versions or versioned-command jargon.
- Fresh built-route evidence covers seven interaction states, desktop and narrow layouts, Chrome and Firefox, and the shared stock-panel dependency. Human accessibility and visual acceptance are recorded separately from passing automation.

### Key Discoveries:

- The shared body currently owns one rowgroup; per-record groups must replace that semantic layer rather than nest within it (`src/components/ui/CollectionTable.tsx:47`).
- Existing tests find panel controls inside summary-row locators. Separate details require explicit record-scoped helpers, not weaker assertions (`tests/e2e/helpers/ui.ts:51`, `:58`; `tests/e2e/settlement-recovery.spec.ts:25`).
- The edit form resets through an explicit counter after an accepted latest read. The older recommendation to key it by backend version is obsolete (`src/components/prints/PrintList.tsx:1211`, `:2048`).
- Renaming the empty state also affects authenticated HTTP smoke assertions (`scripts/print-smoke.mjs:252`, `:461`).

## What We're NOT Doing

- No new tabs, filtering, sorting, collection membership rules, routes or printer integrations.
- No replacement of the accepted Data Table, palette, shell or general dashboard design.
- No database migrations, RPC/API changes, reservation recalculation work, margin changes, settlement policy changes or recovery-state redesign. Current code and later acceptance establish that reserved-print editing already exists despite stale repository-guide wording.
- No extraction of a generic collection/workflow controller; collection state, handlers and mutations remain in their existing owners.
- No physical spool labels, new identity fields, authentication restyle, browser-test framework replacement or screenshot-comparison infrastructure.
- No rewrite of historical research, screenshots or archived acceptance. No deployment or publication.

## Implementation Approach

Repair the shared presentation contract first and migrate both consumers together. A presentation-only record group contains its ordinary summary row and separate detail rows. Keep the header rowgroup, remove the redundant semantic body group, and give each detail row one cell spanning the five logical columns. Mobile's two-track visual arrangement remains a projection of those same columns. Detail geometry must not depend on a utility whose span resets at the desktop breakpoint.

Then apply the four approved presentation choices and update dependent browser/HTTP assertions. Use existing tokens, controls, forms and workflow components. Add focused browser checks for the actual geometry and record/detail relationships; reuse the established recovery suites for behavior. Finish with the normal deploy gate, complete Chromium suite, HTTP smoke and fresh human-reviewed browser evidence.

## Critical Implementation Details

### State and identity

Keep record groups keyed by full print/spool ID and preserve existing form mounting conditions and reset keys, including `editFormResetVersion`. Do not reset a draft because a collection read or backend version changes; a stable key alone does not preserve state if a form is moved between conditional parent structures during interaction.

### Recovery wording

Changing explanatory strings must preserve each branch's certainty. An obsolete or unreadable response can leave the original edit, release or settlement applied; never describe it as unapplied, suggest a new attempt, or imply an ordinary GET resolves an exact captured attempt before the existing resolver permits that conclusion.

## Phase 1: Shared detail-panel contract

### Overview

Correct the shared structure and geometry while retaining the accepted table appearance and all workflow ownership.

### Changes Required:

#### 1. Shared table primitives and geometry

**Files**: `src/components/ui/CollectionTable.tsx`, `src/styles/global.css`.

**Intent**: Model expanded details as separate rows and make their width independent of the desktop reset. Preserve aligned summaries, compact phone rows and token-based presentation.

**Contract**: Add shared presentation boundaries for a labelled record rowgroup and a detail row with one five-column cell. Keep the header group; make the body layout wrapper semantically neutral. Do not nest rowgroups or append detail cells to summary rows. Summary rows retain five logical cells even when action controls are hidden. Apply record borders/separation to the appropriate group and keep detail width correct below, at and above `80rem` without view-local geometry overrides.

#### 2. Print and stock consumers

**Files**: `src/components/prints/PrintList.tsx`, `src/components/spools/SpoolInventory.tsx`.

**Intent**: Adopt the shared contract for print edit/delete/reservation/settlement and stock edit/delete. Capture a representative built-route baseline before changing the structure, supplementing the research's isolated CSS probe.

**Contract**: Group summary and details by full record identity; retain current conditions, DTO bindings, form reset keys, action IDs, live regions, disabled states and focus targets. Keep detached settlement recovery outside the table when its print disappears. Give mounted disclosure triggers, including Reserve/Manage and Settle/Review, accurate expanded/control relationships to stable panel IDs. Edit/Delete controls may retain their current hidden-while-open behavior. Do not move fetches, handlers or state into shared primitives.

When the user closes a reservation panel, restore focus after unmount to that print’s current Reserve/Manage trigger. Ensure reservation-panel changes activate focus restoration. Keep internal panel cleanup separate so opening another workflow does not steal focus.

#### 3. Structural and geometry regression coverage

**Files**: new `tests/e2e/collection-table-presentation.spec.ts`; `tests/e2e/helpers/ui.ts`; affected imports/calls in existing `tests/e2e/*.spec.ts`.

**Intent**: Verify the real rendered defect and keep existing behavior suites scoped to the complete owning record after details become siblings of the summary.

**Contract**: Introduce explicitly named record-scoped helpers such as `printRecord`/`spoolRecord`, using full identity; retain explicit summary/detail row selection for structural checks. Replace affected old row-helper calls without removing behavior assertions. New checks cover all print panel types, completed review, stock edit/delete, five summary cells, one spanning cell per detail row, valid ownership, disclosure relationships and focus restoration. Measure surface bounds and vertical placement at 320, 390, 1279, 1280 and 1440 CSS pixels with default root sizing. Assert no document horizontal overflow with long labels/full IDs; demonstrate that the geometry check detects the pre-fix wide-screen defect rather than merely checking a class name.

### Success Criteria:

#### Automated Verification:

- Presentation regressions pass: `npm run test:e2e -- tests/e2e/collection-table-presentation.spec.ts`.
- Existing print, stock and settlement recovery pass: `npm run test:e2e -- tests/e2e/print-recovery.spec.ts tests/e2e/spool-recovery.spec.ts tests/e2e/settlement-recovery.spec.ts`.
- Lint passes: `npm run lint`.

#### Manual Verification:

- Before/after built-route captures at 1440px and 390px confirm full-width details remain visibly associated with their owning print and stock records.

## Phase 2: Prints naming and contextual guidance

### Overview

Apply the four author-approved choices while preserving all quantity meanings, operation semantics and safeguards.

### Changes Required:

#### 1. Consistent collection and destination names

**Files**: `src/components/Topbar.astro`, `src/pages/dashboard.astro`, `src/pages/dashboard/prints.astro`, `src/components/prints/PrintList.tsx`, `src/components/spools/SpoolInventory.tsx`, `src/components/spools/SpoolForm.tsx`.

**Intent**: Describe the mixed collection consistently and align the result heading with its contents.

**Contract**: Use Prints for navigation and the table's accessible name, Your prints for the collection eyebrow, No prints yet for its empty heading, Manage prints for the dashboard destination and Manage reservations in prints for stock recovery links. Align desktop/mobile/accessible result labels to Reservation / result. Preserve routes, current-route semantics, collection membership and legitimate references to the planned state, including creation and active reservations.

#### 2. Contextual help and plain-language recovery

**Files**: `src/pages/dashboard/prints.astro`, `src/components/prints/PrintList.tsx`, `src/components/prints/PrintForm.tsx`, `src/components/prints/ReservationPanel.tsx`, `src/components/prints/SettlementPanel.tsx`.

**Intent**: Shorten the introduction and explain consequences where the user makes each decision. Replace visible version numbers and command terminology with the situation, retained entries and permitted next action.

**Contract**: Preserve these explanations in the relevant existing surfaces:

- Creation/collection: required grams are an estimate before the margin; creating a print does not reserve stock.
- Reservation preview: best-fit uses entered estimates, manual choices obey the same eligibility and current account margin, and changed amounts require a fresh confirmation. Keep a contextual Settings link and clarify that held grams are not consumed.
- Reserved editing: every save recalculates using the current margin, including name-only edits; retain an eligible manual spool, otherwise try best-fit, and explain a successful save without reservation when none fits.
- Release: only availability changes; consumed material needs a separate stock correction subject to its guardrail. Explain a changed print as a need to review current information, without numeric versions.
- Settlement: actual consumption is recorded once and releases the exact reservation; 0 g still completes the print. Explain newest-first cancellations, exceeded estimates without claiming physical emptiness, and historical receipt versus current stock.
- Completed deletion: consumption remains recorded and stock is not refunded, including when detached review remains available.

Keep full record identities available. Remove the ordinary edit-version display and simplify UI-facing edit/release/settlement recovery literals, including messages passed into panels. For example, an uncertain edit may say, "Your edit may have completed. Retry this same attempt to resolve the outcome." Preserve the distinction between that state, a definitively rejected attempt and a safe latest-read action; exact captured requests, guards and response handling stay unchanged. Do not modify API validation messages or account-settings behavior as part of this copy work.

#### 3. Distinguishable spool choices

**File**: `src/components/prints/ReservationPanel.tsx`.

**Intent**: Let users distinguish eligible records that share material, colour and available grams.

**Contract**: Add a visible short spool ID to every eligible option using the existing eight-character identity convention; extend colliding prefixes until candidates are distinct. Make the full ID available in accessible text and a tooltip while retaining material, colour, available grams and the best-fit indication. This identifies an application record, not a physical spool. Radio values, selection state, eligibility, best-fit ordering and confirmation payloads remain based on the existing full IDs.

#### 4. Dependent verification updates

**Files**: `tests/e2e/helpers/ui.ts`, `tests/e2e/collection-table-presentation.spec.ts`, `tests/e2e/print-recovery.spec.ts`, `tests/e2e/exact-command-recovery.spec.ts`, `tests/e2e/reserved-print-editing.spec.ts`, `tests/e2e/reservation-recovery.spec.ts`, `tests/e2e/spool-recovery.spec.ts`, `scripts/print-smoke.mjs`.

**Intent**: Keep existing behavior checks meaningful after naming, structure and copy changes; prove the new manual-selection distinction.

**Contract**: Update table/link/empty-state expectations and affected recovery text. Replace numeric-version UI assertions with retained-draft, refreshed-field and original expected-version request assertions, preserving existing API version checks. Add a real-API case with two identically described spools, select the non-suggested ID and verify its reservation. A controlled preview-only response may exercise equal short prefixes without submitting fabricated IDs; label that bounded evidence separately from persisted selection. Check reserved/completed result labels and the shortened introduction's contextual help without creating snapshots for every sentence.

In `exact-command-recovery.spec.ts`, update copy-dependent recovery expectations while preserving identical retry payload and original `expectedVersion` assertions.

### Success Criteria:

#### Automated Verification:

- Presentation and affected print/reservation scenarios pass: `npm run test:e2e -- tests/e2e/collection-table-presentation.spec.ts tests/e2e/print-recovery.spec.ts tests/e2e/reserved-print-editing.spec.ts tests/e2e/reservation-recovery.spec.ts`.
- Updated source passes lint: `npm run lint`.
- Exact-command recovery scenarios pass: `npm run test:e2e -- tests/e2e/exact-command-recovery.spec.ts`.

#### Manual Verification:

- Mixed-collection names, contextual consequences, distinguishable spool choices and version-free recovery guidance are clear on desktop and phone without losing warnings or full record identity.

## Phase 3: Verification and retained review evidence

### Overview

Verify the final built view, retain current evidence and document the shared contract for future changes.

### Changes Required:

#### 1. Current browser and accessibility evidence

**Files**: new `context/changes/carbon-terminal-planned-prints/verification.md`, captures/measurements under `context/changes/carbon-terminal-planned-prints/reviews/phase-1/` and `reviews/phase-3/`.

**Intent**: Establish acceptance of the current workflows and repaired shared presentation using the real built app. Historical screenshots remain reference material.

**Contract**: Index before/after geometry, the seven-state matrix below, Chrome/Firefox default and expanded-panel samples at 1440px, 390px and 320px, and wide/phone examples of every print panel type plus stock edit/delete. A full Cartesian screenshot matrix is unnecessary, but each required combination must have an indexed representative. Record browser/version, viewport, revision, state, measured overflow and focus/contrast findings. Use generated local records and real hydrated routes; label intercepted pending/error responses. Inspect contrast on actual rendered surfaces, focus visibility, 200% zoom/reflow and one documented screen-reader/browser combination. Preserve warnings, no-fit success, drafts, exact-retry controls, detached review and historical/current quantities. Do not retain credentials, cookies or fixture ledgers, or treat generated screenshots as human acceptance.

#### 2. Durable guidance

**File**: `AGENTS.md`, dashboard design-contract paragraph.

**Intent**: Keep future dashboard changes using the repaired shared record/detail presentation instead of recreating the faulty combination in a view.

**Contract**: Add a concise rule pointing to the shared record/detail primitives and this change's verification. Require five logical summary cells, separate spanning detail rows, token-based geometry and collection-owned state. Preserve unrelated instructions; this phase does not reopen repository-wide documentation cleanup.

### Success Criteria:

#### Automated Verification:

- Deploy verification passes: `npm run verify:deploy`.
- The complete built-preview Chromium suite passes: `npm run test:e2e`.
- Authenticated HTTP acceptance passes against a separately started built preview: `BASE_URL=http://localhost:4321 npm run smoke`.

#### Manual Verification:

- The author accepts indexed seven-state desktop/phone evidence and Chrome/Firefox default and expanded-panel review, including stock panels, long labels and distinct historical/current quantities.
- Keyboard, focus restoration, one recorded screen-reader/browser combination, rendered contrast and 200% zoom/reflow checks pass for summaries, details and recovery controls.

## Testing Strategy

### Unit Tests:

Reuse the existing native contracts through `verify:deploy`. No new unit tests are needed for text replacements or token/class wiring; new browser assertions target user-visible geometry, semantics and selection behavior.

### Integration Tests:

- Use existing disposable-account fixtures and real API-created records. Keep cleanup/settings restoration intact and use a free `E2E_PORT`; the browser runner owns and rebuilds its preview.
- Geometry covers print edit/delete, reservation preview/management, settlement input/review and stock edit/delete at 320/390/1279/1280/1440px. Compare against record content bounds with a small rounding tolerance, verify details start below summaries, and check overflow rather than asserting a particular CSS declaration.
- Exercise unchanged conflict drafts, explicit latest-read reset, no-fit successful edits, uncertain edit/release attempts, failed paired reads, settlement retry/null-receipt guards, and completed deletion with detached review. Reuse `print-recovery`, `reserved-print-editing`, `reservation-recovery`, `exact-command-recovery`, `settlement-recovery` and `spool-recovery` suites rather than duplicating their state machines.
- Retain `PrintDto.requiredGrams`, reservation grams, settlement actual grams and the independent recorded/reserved/available spool bindings. A result-column heading change must not move or substitute quantities.
- Run final smoke after the E2E-owned preview exits; start `npm run preview -- --host 127.0.0.1 --port 4321` separately, or substitute its actual free port in `BASE_URL`. Local Supabase and Mailpit are required for smoke; no database reset is part of this change.

### Manual Testing Steps:

Use Chrome at wide and phone widths for all seven states, and Chrome/Firefox at 1440px, 390px and 320px for default and expanded samples. Include every panel type in the wide/phone evidence set; no need to repeat every error in every browser.

| State         | Required current evidence                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Default       | Mixed unreserved/reserved/completed records; long names/material/colour/full IDs; clear result quantities.               |
| Hover         | Enabled toolbar, row and destructive-confirmation actions after transitions finish; readable labels.                     |
| Focus-visible | Real keyboard traversal from row actions into details and back; visible indicators and no clipped controls.              |
| Disabled      | Held save, release or settlement request; unavailable actions remain disabled and readable.                              |
| Loading       | Client refresh and reservation/review fetches; initial collection loading is server-rendered and is N/A.                 |
| Error         | Validation focus, stale retained draft, retryable read error and uncertain captured attempt; no false success treatment. |
| Empty         | A genuinely empty collection with No prints yet and a usable create action.                                              |

1. Review the mixed collection, create/edit/delete surfaces and each reservation/settlement detail with long labels and IDs; check no horizontal document overflow.
2. Use keyboard and the recorded assistive-technology combination to identify the owning print, traverse summary/details, hear spool identities and close panels with correct focus restoration.
3. Review no-fit saves, uncertain commands, completed deletion and settlement history/current stock. Confirm the explanation does not promise physical stock or a refund.
4. Review the indexed state matrix and supported browser/viewport samples, then record author acceptance and any fixes before marking manual Progress rows complete.

## Performance Considerations

This is a presentation change. Reuse existing data and requests; add no collection reads, polling, dependencies or broader state subscriptions to render labels/details. Keep long content wrappable and existing responsive breakpoints. No new latency target or speculative optimisation is required.

## Migration Notes

No data migration or release flag is needed. Normal deployment publishes the presentation and related tests; reverting its code restores the previous presentation without undoing saved prints, reservations or settlements. Do not deploy during planning.

Execution prerequisites are Node 24.21.0 from `.nvmrc`, installed dependencies, Chromium, a free preview port and configured local Supabase with current migrations; HTTP smoke additionally needs Mailpit. Chrome/Firefox and an assistive-technology environment must be available for human review. Record unavailable checks as pending rather than substituting screenshots or DOM roles for them.

## References

- [Research and G1–G4 handoff](research.md), baseline commit `29b69ff6c1437174d9ff5b233f3310ffd8a0a7af`.
- [PRD](../../foundation/prd.md), FR-003–FR-008, Business Logic and Non-Functional Requirements; [test stack](../../foundation/test-stack.md).
- [Accepted Data Table baseline](../../archive/2026-10-20-edit-reserved-print/verification.md); [historical seven-state evidence](../../archive/2026-10-12-carbon-terminal-spools/verification.md).
- Shared contract: `src/components/ui/CollectionTable.tsx:30`, `src/styles/global.css:454`, `src/layouts/DashboardShell.astro:15`.
- Current recovery/state anchors: `src/components/prints/PrintList.tsx:237`, `:594`, `:714`, `:1157`, `:1211`, `:2048`, `:2164`; `src/components/prints/SettlementPanel.tsx:219`, `:278`.
- [WAI-ARIA table pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/) and [column span](https://www.w3.org/TR/wai-aria-1.2/#aria-colspan), checked 2026-10-25 for row/cell relationships. The proposed grouping is a design derived from that guidance and current consumers; screen-reader behavior still requires the planned review.
- [React: preserving and resetting state](https://react.dev/learn/preserving-and-resetting-state) and [rendering lists](https://react.dev/learn/rendering-lists), fetched through Context7 on 2026-10-25 for component identity and keyed record grouping.

## Progress

### Phase 1: Shared detail-panel contract

#### Automated

- [ ] 1.1 Presentation regressions pass: `npm run test:e2e -- tests/e2e/collection-table-presentation.spec.ts`.
- [ ] 1.2 Existing print, stock and settlement recovery pass: `npm run test:e2e -- tests/e2e/print-recovery.spec.ts tests/e2e/spool-recovery.spec.ts tests/e2e/settlement-recovery.spec.ts`.
- [ ] 1.3 Lint passes: `npm run lint`.

#### Manual

- [ ] 1.4 Before/after built-route captures at 1440px and 390px confirm full-width details remain visibly associated with their owning print and stock records.

### Phase 2: Prints naming and contextual guidance

#### Automated

- [ ] 2.1 Presentation and affected print/reservation scenarios pass: `npm run test:e2e -- tests/e2e/collection-table-presentation.spec.ts tests/e2e/print-recovery.spec.ts tests/e2e/reserved-print-editing.spec.ts tests/e2e/reservation-recovery.spec.ts`.
- [ ] 2.2 Updated source passes lint: `npm run lint`.
- [ ] 2.4 Exact-command recovery scenarios pass: `npm run test:e2e -- tests/e2e/exact-command-recovery.spec.ts`.

#### Manual

- [ ] 2.3 Mixed-collection names, contextual consequences, distinguishable spool choices and version-free recovery guidance are clear on desktop and phone without losing warnings or full record identity.

### Phase 3: Verification and retained review evidence

#### Automated

- [ ] 3.1 Deploy verification passes: `npm run verify:deploy`.
- [ ] 3.2 The complete built-preview Chromium suite passes: `npm run test:e2e`.
- [ ] 3.3 Authenticated HTTP acceptance passes against a separately started built preview: `BASE_URL=http://localhost:4321 npm run smoke`.

#### Manual

- [ ] 3.4 The author accepts indexed seven-state desktop/phone evidence and Chrome/Firefox default and expanded-panel review, including stock panels, long labels and distinct historical/current quantities.
- [ ] 3.5 Keyboard, focus restoration, one recorded screen-reader/browser combination, rendered contrast and 200% zoom/reflow checks pass for summaries, details and recovery controls.
