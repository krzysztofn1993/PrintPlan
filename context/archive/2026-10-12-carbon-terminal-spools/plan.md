# Carbon Terminal Dashboard and Collections Implementation Plan

## Overview

Extend the Carbon Terminal presentation from filament stock to Planned Prints and the dashboard landing page. Share a responsive dashboard shell and collection presentation while retaining each collection's current data, actions and recovery behavior. Global monospace typography is already implemented; continue from Phase 2.

## Current State Analysis

Stock and Planned Prints repeat a centered workspace, Topbar and introductory header before mounting their own React collection islands (`src/pages/dashboard/spools.astro:37-75`; `src/pages/dashboard/prints.astro:37-73`). Dashboard repeats the same outer frame and provides a welcome plus two management links (`src/pages/dashboard.astro:8-36`). No shared dashboard shell exists yet. `Layout.astro` owns the document, theme and configuration banners (`src/layouts/Layout.astro:13-36`).

Both collections currently use card grids and inline create/edit/delete surfaces (`src/components/spools/SpoolInventory.tsx:178-381`; `src/components/prints/PrintList.tsx:305-577`). Topbar owns signed-in identity, route links, active-route semantics and POST sign-out, including unavailable/unsigned-in states (`src/components/Topbar.astro:2-65`). Shared Button and FormField primitives already own control styling and field associations.

Phase 1 is complete: `--font-sans` and `--font-mono` both reference `--carbon-font-mono` (`src/styles/global.css:156-166`). The stock plan's original staged/unstaged prints warning is historical: current source includes the merged prints feature, and the only initial worktree modification is the supplied research follow-up. Preserve that research modification and inspect any new diff before implementation.

The reference is a visual prototype, with analytics and fields unavailable in PrintPlan. Stock exposes recorded/reserved/available grams, with reserved currently zero. Prints exposes optional name, material, colour, required grams, identity, version and timestamps; requirements exclude a future safety margin and do not reserve or consume stock (`src/lib/spools.ts:13-39`; `src/lib/prints.ts:16-25`; `src/pages/dashboard/prints.astro:46-48`).

## Desired End State

`/dashboard/spools`, `/dashboard/prints` and `/dashboard` use one terminal shell, with a desktop sidebar and visible wrapping navigation above content at phone widths. Identity, active links and sign-out remain reachable; Dashboard retains its welcome and both management links. The system monospace fonts and existing Carbon palette remain the design source.

Stock and Planned Prints show compact rows at desktop widths and readable stacked fields/actions on phones. Stock retains material, colour, identity and recorded/reserved/available grams. Prints retains optional name or the existing requirement fallback, material, colour, required grams and identity. Create/edit forms and delete confirmations remain inline, with current validation, focus restoration, alerts, pending states and recovery controls.

The visual gate covers default, hover, focus-visible, disabled, loading, error and empty for both collections. Only initial SSR list loading is N/A; stock Saving/Deleting and print Refreshing/Saving/Deleting are applicable loading states. Print conflict and uncertain outcomes receive explicit review. Retain desktop and 390px/320px screenshots and notes for all three routes, and obtain final author visual acceptance.

### Key Discoveries:

- Shared shell extraction can replace duplicated markup without moving either authenticated loader or private-response handling (`src/pages/dashboard/spools.astro:8-33`; `src/pages/dashboard/prints.astro:8-33`).
- Add/Refresh actions belong to their React collection islands; the Astro shell does not own mutation state (`src/components/spools/SpoolInventory.tsx:178-212`; `src/components/prints/PrintList.tsx:305-340`).
- Print edit forms are keyed by ID/version, preserve inputs on HTTP 409, and explicitly confirm before reading the latest print (`src/components/prints/PrintList.tsx:498-515`; `src/components/prints/PrintForm.tsx:202-231`).
- Successful validated print refresh clears uncertainty; failed refresh must keep it. Stock recovery uses page reload links, while prints uses its client refresh (`src/components/prints/PrintList.tsx:173-228`; `src/components/spools/SpoolForm.tsx:309-315`).
- The prints review's F1 refresh/write overlap was explicitly skipped by the author; F2 discard-warning bypass was fixed. Presentation reuse preserves these accepted boundaries (`context/changes/personal-planned-prints/reviews/impl-review.md:26-48`).

## What We're NOT Doing

- Restyling authentication pages or the standalone auth-outage HTML, adding dashboard analytics, or changing the Carbon palette/theme mode.
- Adding prototype brand/location, stock totals, usage history, material breakdown, low-stock thresholds, export, search, filters, sorting controls or node/version/online claims.
- Changing schemas, DTOs, API contracts, ownership rules, stock math, print requirements, reservations, safety margins or settlement.
- Changing collection ordering, duplicate handling, optional-name behavior, expected-version edits or mutation/recovery policies; repairing the author-skipped prints F1 overlap remains outside this change.
- Adding external fonts, UI libraries, a browser runner, a production demo route, a permanent fixture or a generic CRUD controller.

## Implementation Approach

Keep completed Phase 1 intact. During Phase 2 establish `src/layouts/DashboardShell.astro` using the current base Layout and a terminal presentation variant of Topbar. Adopt it in all three dashboard routes. Add shared presentation styles/components only where both collection designs demonstrate the same need, then adapt stock and prints rows and inline surfaces independently. Server loaders and client state stay with their current owners. Phase 3 verifies the expanded state matrix, retains screenshots and records the reusable contract in AGENTS.md.

## Critical Implementation Details

PrintForm must retain its ID/version key and entered values on a conflict until the user accepts the existing discard prompt; do not move it into a shell-owned island or a shared state controller. Generic print refresh retry continues to call the normal `refreshList()` path, so unsaved input confirmation is preserved. Initial SSR loading N/A does not apply to client operations.

## Phase 1: Global Monospace Token

### Overview

Completed before this revision. Preserve the existing font mapping and recorded verification; no reimplementation is required.

### Changes Required:

#### 1. Shared font alias

**File**: `src/styles/global.css`

**Intent**: Keep the author's selected monospace typography consistent across application pages.

**Contract**: `--font-sans` and `--font-mono` reference the existing `--carbon-font-mono` system stack. Preserve that implemented mapping without external fonts or per-page overrides.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes.
- `npm run build` completes with the updated Tailwind font mapping.

#### Manual Verification:

- Layout-backed auth, dashboard, prints and stock pages render their body text in monospace and remain readable at desktop width; only the stock page receives a structural restyle in this plan.

**Implementation Note**: Criterion 1.3 retains its historical title and completed result: only typography changed during Phase 1. Its original stock-only structural boundary is superseded by the approved Phase 2 expansion; it does not constrain later phases.

## Phase 2: Shared Terminal Shell and Collections

### Overview

Create the shared presentation contract, adopt it in the three selected routes, and restyle both collections. Work in order: shell/navigation, stock rows, print rows and inline panels, then dashboard adoption and integrated verification.

### Changes Required:

#### 1. Shared shell and navigation

**Files**: `src/layouts/DashboardShell.astro` (new), `src/components/Topbar.astro`, `src/styles/global.css`

**Intent**: Replace repeated workspace markup with one responsive terminal frame, so stock, prints and dashboard share navigation and hierarchy.

**Contract**: DashboardShell composes the existing Layout, accepts document title, page heading, optional eyebrow/description content and page content, and owns a single main landmark. Topbar retains one source for account links, current-route state, email, auth-unavailable/unsigned-in display and POST sign-out, with an opt-in terminal presentation; its default presentation stays available. Desktop uses a sidebar; phone navigation wraps visibly above content without a toggle, drawer or new menu state. All sizing, wrapping and shell styles use the existing token source; add reusable styles there rather than view-local literals.

#### 2. Route adoption and server error surfaces

**Files**: `src/pages/dashboard/spools.astro`, `src/pages/dashboard/prints.astro`, `src/pages/dashboard.astro`

**Intent**: Adopt the shared frame while retaining each page's heading, explanatory copy and recovery behavior.

**Contract**: Stock and prints keep their current loaders, redirects, status codes, private headers and `client:load` collection props. Page-load errors remain named alerts with the existing retry destinations. Preserve the stock estimate/quantity explanations and print no-margin/no-reservation explanation. Dashboard retains the welcome, signed-in identity and both management links; add no new data reads or metrics.

#### 3. Shared collection presentation

**Files**: `src/styles/global.css`, `src/components/ui/` (small presentation components only where common markup is needed)

**Intent**: Define reusable row, action, inline-panel, empty and feedback framing used by stock and prints, to prevent separate layout conventions.

**Contract**: Shared pieces/styles accept content and presentation options, preserving caller-supplied IDs, labels, roles, refs and callbacks. Keep Button and FormField as the existing control source. Collections own data fields, handlers, lists and state; forms own inputs. No generic collection controller or duplicated palette. Use one row treatment with domain-specific field content and accessible labelled quantities, and allow wrapping/stacking on phones.

#### 4. Stock rows and forms

**Files**: `src/components/spools/SpoolInventory.tsx`, `src/components/spools/SpoolForm.tsx`

**Intent**: Make spools easier to compare in compact terminal rows, extending the same framing to create/edit/delete surfaces.

**Contract**: Preserve material, colour, existing identity presentation, recorded/reserved/available grams, independent records and current ordering. Keep all CRUD/cancel/confirmation actions, status/error feedback, validation associations, form keys, focus behavior, pending guards and uncertain-outcome page reload links. Do not imply implemented reservation calculations or convert text colour labels to guessed swatches.

#### 5. Planned print rows and forms

**Files**: `src/components/prints/PrintList.tsx`, `src/components/prints/PrintForm.tsx`

**Intent**: Apply the complete terminal collection presentation to Planned Prints, including forms, feedback and recovery surfaces.

**Contract**: Preserve optional-name fallback, material, colour, required grams before safety margin, full identity and existing ordering/independent duplicates. Preserve create/edit/delete/cancel, Refresh list, pending labels, status/alert roles, focus targets and accessible names. Keep `expectedVersion`, ID/version form keys, retained conflict inputs, Read latest print and its discard confirmation. Ordinary refresh/retry must warn before discarding unsaved inputs; failed refresh retains current entries and uncertainty guard, while successful validated refresh follows the current reset. Transport/unreadable-success/500–599 uncertainty paths and disabled mutation guards remain in their current owners. Keep the accepted F1 exception; do not claim reads/writes have become fully serialized.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass with the restyled view.
- The hardcoded-value scan returns zero candidate matches for the four scoped stock-view files.
- `npm run verify:deploy` passes for the shared shell and both collections.
- The expanded hardcoded-value scan returns zero candidate matches across all three dashboard routes, Topbar, DashboardShell and the stock/print collection and form components, including any new shared presentation components.

#### Manual Verification:

- Add/edit/cancel/delete, page-load error, empty and populated states preserve current behavior and quantities.
- Desktop and 390px/320px phone review confirms reachable controls, wrapping and no horizontal overflow.
- Account navigation/sign-out work on the stock view and other `Topbar` consumers retain their presentation.
- Planned Prints preserves named and unnamed entries, independent duplicates, ordering, CRUD, refresh/discard confirmation, retained conflict inputs and uncertain-outcome recovery.
- Dashboard uses the shared terminal shell and retains its welcome, signed-in identity and both management links.

**Implementation Note**: Existing Progress IDs 2.1–2.5 retain their titles. The four-file scan in 2.2 remains the original stock route/inventory/form/Topbar scope; 2.9 adds the expanded scope. In 2.5, default Topbar presentation is preserved for callers outside the three explicitly migrated routes. Criteria 2.4 and 2.7–2.8 cover the selected routes; long unbroken labels, IDs and emails must wrap without losing accessible actions. After automated verification, obtain human confirmation of manual criteria before Phase 3.

## Phase 3: State Matrix, Visual Gate and UI Rule

### Overview

Review the shared presentation across routes and states, remove any temporary fixture, retain evidence and document the contract.

### Changes Required:

#### 1. Expanded local state review and evidence

**Files**: `context/changes/carbon-terminal-spools/reviews/`, `context/changes/carbon-terminal-spools/verification.md` (new), temporary local-only fixture removed after review

**Intent**: Demonstrate the new layout and feedback states for both collections and Dashboard, with evidence reviewers can inspect later.

**Contract**: Review default, hover, focus-visible, disabled, loading, error and empty states. Initial SSR list loading is N/A only; explicitly show stock Saving/Deleting and print Refreshing/Saving/Deleting, field errors, conflict with retained inputs, refresh discard confirmation and uncertain-outcome recovery. Use local disposable data/controlled failures to demonstrate states without shipping demo content. Retain Chrome/Firefox desktop evidence plus 390px/320px phone evidence for all selected routes, with state/browser/viewport notes and final author acceptance. Preserve existing Phase 1 typography screenshots; remove fixture code and record its removal.

#### 2. Repository UI guidance

**File**: `AGENTS.md`

**Intent**: Make future dashboard changes adopt the shared shell, tokens and presentation primitives.

**Contract**: Outside the generated 10x CLI block, name `src/styles/global.css`, `src/layouts/DashboardShell.astro` and `src/components/ui/` as the design contract. Require checking shared components before creating new ones, forbid literal colours/arbitrary sizing in views, and link to retained review evidence. State that shell/presentation reuse preserves each collection's data meanings and controller ownership.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass after fixture removal and UI-rule update.
- The hardcoded-value scan still returns zero candidate matches for the four scoped files.
- `npm run verify:deploy` passes after fixture removal, and the expanded hardcoded-value scan returns zero candidate matches.

#### Manual Verification:

- The kitchen-sink review shows default, hover, focus-visible, disabled, error and empty; loading is marked N/A with the SSR reason.
- Confirm every control has an accessible name and visible keyboard focus, and the delete warning and error/success feedback remain distinguishable.
- Desktop and phone screenshots and review notes are retained; author gives final visual acceptance.
- The state review shows stock Saving/Deleting and print Refreshing/Saving/Deleting, field errors, retained conflict inputs and uncertain-outcome recovery.
- Chrome and Firefox desktop review and phone-width review at 390px and 320px cover stock, Planned Prints and Dashboard with long labels, IDs and account emails; there is no horizontal page overflow.

**Implementation Note**: Existing Progress IDs 3.1–3.5 retain their titles. Loading N/A in 3.3 refers only to initial SSR loading; 3.7 requires visible client pending states. The four-file scan in 3.2 is supplemented by the expanded final scan in 3.6. Final visual acceptance is required before completion.

## Testing Strategy

### Automated Verification

Use the existing `npm run verify:deploy` gate for auth/stock/prints contracts, sync, lint, Astro check and build; it includes existing lint/build criteria, so do not rerun them unnecessarily. No new permanent test suite or browser runner is required for this presentation change. Run the existing 10x UI hardcoded-value candidate scan on the original stock files and the expanded route/shell/collection scope; keep literal values centralized in the token source.

### Manual Verification

1. Visit all three routes signed in; check active navigation, account identity, sign-out and preserved error/retry states.
2. Exercise stock add/edit/cancel/delete, empty/populated state, field errors, pending controls and uncertain-outcome recovery; verify all three gram values and estimates remain accurate.
3. Exercise named/unnamed prints, independent duplicates, CRUD/cancel and refresh with unsaved fields. Reproduce a version conflict and verify inputs remain until explicit discard consent; verify failed refresh retains uncertainty and successful validated refresh follows the existing recovery.
4. Review keyboard focus and names, row IDs and quantity labels, create/edit/delete surfaces, errors/success/warnings and loading labels. This verifies presentation of existing behavior and does not assert the excluded F1 overlap is fixed.
5. Capture current Chrome and Firefox desktop screenshots and phone layouts at 390px/320px, including long labels, IDs and emails. Record browsers/viewports and final author acceptance.

## Performance Considerations

Keep the existing SSR reads and collection hydration boundaries. The shell/navigation is server-rendered and introduces no new client controller, data queries, polling, charts or font requests. Shared presentation does not replace the collections' existing list semantics.

## Migration Notes

No database migration, API rollout or deployment step is required. Roll back Phase 2 presentation by reverting route/shell and collection markup/styles together while retaining the already accepted Phase 1 font mapping. Preserve existing DTOs, private-response handling, client controllers and any unrelated working edits. This planning revision preserves status `implementing`, all completed rows and every existing Progress ID/title; only new criteria are pending.

## References

- Current research and reuse handoff: `context/changes/carbon-terminal-spools/research.md`, follow-up dated 2026-10-13.
- Visual reference: `/home/ubuntu/05-carbon-terminal.html`; use composition rather than prototype data/features.
- Product and stack: `context/foundation/prd.md`; `context/foundation/tech-stack.md`.
- Shell candidates: `src/pages/dashboard/spools.astro:37-75`; `src/pages/dashboard/prints.astro:37-73`; `src/pages/dashboard.astro:8-36`; `src/layouts/Layout.astro:13-36`.
- Navigation and typography: `src/components/Topbar.astro:2-65`; `src/styles/global.css:156-205`.
- Stock data/interactions: `src/lib/spools.ts:13-39`; `src/components/spools/SpoolInventory.tsx:30-381`; `src/components/spools/SpoolForm.tsx:125-353`.
- Print data/interactions: `src/lib/prints.ts:16-25`; `src/components/prints/PrintList.tsx:173-303,305-577`; `src/components/prints/PrintForm.tsx:125-231,345-386`.
- Shared controls: `src/components/ui/button.tsx`; `src/components/ui/FormField.tsx`.
- Accepted print review decisions: `context/changes/personal-planned-prints/reviews/impl-review.md:26-48`.
- Existing verification gate: `package.json`, `verify:deploy`; existing hardcoded-value scan: `.agents/skills/10x-ui/SKILL.md:117-124`.

## Progress

> Completed steps retain their implementation commit identifiers for traceability.

### Phase 1: Global Monospace Token

#### Automated

- [x] 1.1 `npm run lint` passes.
- [x] 1.2 `npm run build` completes with the updated Tailwind font mapping.

#### Manual

- [x] 1.3 Layout-backed auth, dashboard, prints and stock pages render their body text in monospace and remain readable at desktop width; only the stock page receives a structural restyle in this plan.

### Phase 2: Shared Terminal Shell and Collections

#### Automated

- [x] 2.1 `npm run lint` and `npm run build` pass with the restyled view. — dc651ca
- [x] 2.2 The hardcoded-value scan returns zero candidate matches for the four scoped stock-view files. — dc651ca
- [x] 2.6 `npm run verify:deploy` passes for the shared shell and both collections. — dc651ca
- [x] 2.9 The expanded hardcoded-value scan returns zero candidate matches across all three dashboard routes, Topbar, DashboardShell and the stock/print collection and form components, including any new shared presentation components. — dc651ca

#### Manual

- [x] 2.3 Add/edit/cancel/delete, page-load error, empty and populated states preserve current behavior and quantities. — dc651ca
- [x] 2.4 Desktop and 390px/320px phone review confirms reachable controls, wrapping and no horizontal overflow. — dc651ca
- [x] 2.5 Account navigation/sign-out work on the stock view and other `Topbar` consumers retain their presentation. — dc651ca
- [x] 2.7 Planned Prints preserves named and unnamed entries, independent duplicates, ordering, CRUD, refresh/discard confirmation, retained conflict inputs and uncertain-outcome recovery. — dc651ca
- [x] 2.8 Dashboard uses the shared terminal shell and retains its welcome, signed-in identity and both management links. — dc651ca

### Phase 3: State Matrix, Visual Gate and UI Rule

#### Automated

- [x] 3.1 `npm run lint` and `npm run build` pass after fixture removal and UI-rule update. — c864aac
- [x] 3.2 The hardcoded-value scan still returns zero candidate matches for the four scoped files. — c864aac
- [x] 3.6 `npm run verify:deploy` passes after fixture removal, and the expanded hardcoded-value scan returns zero candidate matches. — c864aac

#### Manual

- [x] 3.3 The kitchen-sink review shows default, hover, focus-visible, disabled, error and empty; loading is marked N/A with the SSR reason. — c864aac
- [x] 3.4 Confirm every control has an accessible name and visible keyboard focus, and the delete warning and error/success feedback remain distinguishable. — c864aac
- [x] 3.5 Desktop and phone screenshots and review notes are retained; author gives final visual acceptance. — c864aac
- [x] 3.7 The state review shows stock Saving/Deleting and print Refreshing/Saving/Deleting, field errors, retained conflict inputs and uncertain-outcome recovery. — c864aac
- [x] 3.8 Chrome and Firefox desktop review and phone-width review at 390px and 320px cover stock, Planned Prints and Dashboard with long labels, IDs and account emails; there is no horizontal page overflow. — c864aac
