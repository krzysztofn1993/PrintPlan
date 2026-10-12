# Carbon Terminal Filament Stock View Implementation Plan

## Overview

Restyle `/dashboard/spools` using the Carbon Terminal reference's terminal framing and denser inventory layout. Route body typography through the existing monospace token across the app, while keeping this change's structural restyle limited to the stock view and preserving its current data and workflows.

## Current State Analysis

The stock route uses a centered `max-w-5xl` column, top navigation, an introductory panel and a React inventory island (`src/pages/dashboard/spools.astro:37-75`). The inventory uses per-spool cards with recorded, reserved and available gram values, inline edit forms and delete confirmations (`src/components/spools/SpoolInventory.tsx:223-379`). The route performs its authenticated read on the server and has a load-error retry state (`src/pages/dashboard/spools.astro:8-33,54-73`).

The shared stylesheet defines Carbon font tokens, `carbon-*` utilities and Tailwind aliases. The body currently consumes `font-sans`, which maps to `--carbon-font-sans` (`src/styles/global.css:51-52,156-205`). Shared `Button` and `FormField` primitives are already used by stock actions and fields (`src/components/ui/button.tsx:7-25`; `src/components/ui/FormField.tsx:28-65`).

The supplied prototype contains demo-only analytics and brand/location fields that the current stock DTO does not expose (`src/lib/spools.ts:13-22`; `/home/ubuntu/05-carbon-terminal.html:92-94,100-132`). The existing worktree also contains staged and unstaged planned-prints changes, including a staged `Topbar.astro` change; implementation must preserve that work and build on the current index/worktree state.

## Desired End State

The body font alias uses the existing monospace stack, so application pages using `Layout.astro` inherit the author's preferred typography. The stock view has a terminal-inspired desktop shell and dense, responsive spool rows; its account navigation, real stock values, server authentication, empty/error handling, and create/edit/delete behavior remain intact.

The visual review covers default, hover, focus-visible, disabled, error and empty states. Loading is marked N/A in the review fixture because the stock page awaits its server-side list read before rendering and the client island receives that result as its initial data (`src/pages/dashboard/spools.astro:21-33,71-73`). Desktop and phone screenshots are retained with the change evidence, and the repository rules point future UI work to the shared tokens and components.

### Key Discoveries:

- The body consumes `font-sans`; its alias is defined in `src/styles/global.css:156-166`.
- `SpoolDto` has material, colour, timestamps and gram quantities, but no brand/location or analytics fields (`src/lib/spools.ts:13-22`).
- `Topbar.astro` owns account navigation and sign-out (`src/components/Topbar.astro:6-44`); use its existing behavior in the selected page shell.
- The shared control directory already contains the button and field components used by the stock form (`src/components/spools/SpoolForm.tsx:1-3`).

## What We're NOT Doing

- Restyling dashboard, authentication or planned-prints page layouts in this change; they inherit the global body font only.
- Adding brand, location, total-spool, usage-history, material-breakdown, export, search or filter features from the prototype.
- Changing database schema, API contracts, stock math, authentication, mutation semantics or reservation behavior.
- Adding a font download, UI library, browser test runner, production demo route or permanent test fixture.
- Changing the Carbon color palette or dark/light mode behavior.

## Implementation Approach

First switch the shared `font-sans` alias to `--carbon-font-mono` and check the cross-view typography impact. Then adapt the stock page shell and inventory using the existing semantic tokens and repo components. Reuse `Topbar.astro` through a page-specific presentation variant if needed, leaving its default presentation intact on other routes. Keep the stock DTO and mutation flows unchanged. Finish with a temporary local state fixture for the UI kitchen-sink screenshots, remove the fixture after review, and add a concise UI contract to the existing `AGENTS.md` outside the generated 10x CLI block.

## Critical Implementation Details

The current worktree has unrelated staged and unstaged planned-prints edits, and `Topbar.astro` is staged. Inspect the working diff before touching shared navigation; preserve the index and existing planned-prints behavior. The old Carbon theme plan's sans body-copy choice is superseded by the author's current monospace preference, while its system-font/no-external-font direction remains compatible.

## Phase 1: Global Monospace Token

### Overview

Keep the current environment and dependencies; no font package or external asset is needed. Apply the agreed font choice through the existing token mapping without changing page structure.

### Changes Required:

#### 1. Shared font alias

**File**: `src/styles/global.css`

**Intent**: Route the shared body font utility to the existing Carbon monospace stack so the author's preference applies consistently across application pages.

**Contract**: Keep `--carbon-font-mono` as the single font value source; change the `--font-sans` mapping to reference it. Keep `--font-mono` mapped to the same token. Do not add per-page font overrides or external font requests.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes.
- `npm run build` completes with the updated Tailwind font mapping.

#### Manual Verification:

- Layout-backed auth, dashboard, prints and stock pages render their body text in monospace and remain readable at desktop width; only the stock page receives a structural restyle in this plan.

## Phase 2: Terminal Stock Shell and Dense Inventory

### Overview

Adapt the selected view's hierarchy and stock presentation to the reference while preserving real data and current interactions.

### Changes Required:

#### 1. Stock page shell and account navigation

**Files**: `src/pages/dashboard/spools.astro`, `src/components/Topbar.astro`

**Intent**: Replace the narrow centered shell with a terminal-inspired workspace and clearer inventory hierarchy. Keep the signed-in identity, route links and sign-out action available at desktop and phone sizes.

**Contract**: Apply any navigation presentation variant only to `/dashboard/spools`; existing `Topbar` callers retain their current layout. Do not copy prototype node/version claims, fake online indicators or unrelated navigation destinations.

#### 2. Spool rows and forms

**Files**: `src/components/spools/SpoolInventory.tsx`, `src/components/spools/SpoolForm.tsx`, `src/styles/global.css`

**Intent**: Replace spacious per-spool cards with compact, readable rows inspired by the reference, and carry the Carbon treatment into create/edit and delete surfaces.

**Contract**: Display existing material, colour, spool identifier, recorded grams, reserved grams and available grams. Keep create/edit/delete controls, confirmation copy, success/error feedback, pending guards, field associations and focus behavior. Continue using `Button`, `FormField` and semantic tokens; do not add demo data or one-off color literals.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass with the restyled view.
- The 10x UI hardcoded-value scan returns zero candidate matches for `spools.astro`, `SpoolInventory.tsx`, `SpoolForm.tsx` and `Topbar.astro`.

#### Manual Verification:

- A signed-in user can still add, edit, cancel, confirm deletion and recover from the existing page-load error path; empty and populated inventories retain their correct messages and quantities.
- Account navigation and sign-out remain reachable; other `Topbar` consumers keep their existing presentation.
- Review a desktop screenshot and phone screenshots at 390px and 320px; long material/colour labels wrap, controls remain reachable and the page has no horizontal overflow.

## Phase 3: State Matrix, Visual Gate and UI Rule

### Overview

Review the designed states together, retain screenshot evidence and document the token/component contract for future UI work.

### Changes Required:

#### 1. Local visual fixture and evidence

**Files**: `context/changes/carbon-terminal-spools/` and a temporary local-only fixture, removed after review

**Intent**: Render the selected stock view's visual states together for a compact screenshot review without shipping a demo route or fake product data.

**Contract**: Show default, hover, focus-visible, disabled, error and empty examples. Mark loading N/A with the reason from the SSR loading contract in Desired End State. Save desktop and phone screenshots under the change's review evidence and remove temporary fixture code before completion.

#### 2. Repository UI guidance

**File**: `AGENTS.md`

**Intent**: Help future changes reuse the Carbon token source and shared UI primitives instead of adding local styling conventions.

**Contract**: Outside the generated `@przeprogramowani/10x-cli` block, name `src/styles/global.css` as the token source and `src/components/ui/` as the shared component location; require checking shared components before creating new ones and avoiding literal colors/arbitrary values in views; point to the retained kitchen-sink evidence location.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass after the temporary fixture is removed and the UI rule is added.
- The scoped hardcoded-value scan still returns zero candidate matches for the four stock-view files.

#### Manual Verification:

- Review the seven-state matrix: default, hover, focus-visible, disabled, error and empty are shown; loading is explicitly N/A because the route renders after its server-side read.
- Confirm every control has an accessible name and visible keyboard focus, and the delete warning and error/success feedback remain distinguishable.
- Retain desktop and phone screenshots with notes for any deferred visual issue; the author gives final visual acceptance before the change is considered done.

## Testing Strategy

- Use the repository's existing lint and production build commands; do not add a browser runner or a permanent test suite for this visual change.
- Run the 10x UI hardcoded-value scan on the four scoped view files after visual work.
- Use a temporary local fixture for the kitchen-sink screenshot gate, then remove it and retain screenshots/review notes in the change folder.
- Manually exercise the existing stock flows and keyboard states in the running app, with desktop and 390px/320px phone-width review.

## Performance Considerations

The change adds no network font requests or runtime data queries. Keep the page's existing SSR list read and client hydration path; do not introduce charts, polling, animation or demo data.

## Migration Notes

No data migration or API rollout is required. Reverting the shared font alias restores the previous body stack; reverting the page-specific shell restores the prior stock presentation. Preserve current uncommitted planned-prints work during either operation.

## References

- Research: `context/changes/carbon-terminal-spools/research.md`.
- User-provided visual reference: `/home/ubuntu/05-carbon-terminal.html`.
- Existing Carbon tokens and classes: `src/styles/global.css:51-52,156-205`.
- Stock route/data contract: `src/pages/dashboard/spools.astro:8-75`; `src/lib/spools.ts:13-22`.
- Stock interactions and shared controls: `src/components/spools/SpoolInventory.tsx:178-381`; `src/components/spools/SpoolForm.tsx:1-3`; `src/components/ui/button.tsx:7-25`; `src/components/ui/FormField.tsx:28-65`.
- Current worktree overlap: `src/components/Topbar.astro` and `context/changes/personal-planned-prints/`.
- Prior Carbon decisions: `context/archive/2026-10-12-carbon-terminal-theme/plan.md:44-48,130-136` (monospace preference supersedes the earlier body-font decision for this change).

## Progress

> Completed steps retain their implementation commit identifiers for traceability.

### Phase 1: Global Monospace Token

#### Automated

- [x] 1.1 `npm run lint` passes.
- [x] 1.2 `npm run build` completes with the updated Tailwind font mapping.

#### Manual

- [x] 1.3 Layout-backed auth, dashboard, prints and stock pages render their body text in monospace and remain readable at desktop width; only the stock page receives a structural restyle in this plan.

### Phase 2: Terminal Stock Shell and Dense Inventory

#### Automated

- [ ] 2.1 `npm run lint` and `npm run build` pass with the restyled view.
- [ ] 2.2 The hardcoded-value scan returns zero candidate matches for the four scoped stock-view files.

#### Manual

- [ ] 2.3 Add/edit/cancel/delete, page-load error, empty and populated states preserve current behavior and quantities.
- [ ] 2.4 Desktop and 390px/320px phone review confirms reachable controls, wrapping and no horizontal overflow.
- [ ] 2.5 Account navigation/sign-out work on the stock view and other `Topbar` consumers retain their presentation.

### Phase 3: State Matrix, Visual Gate and UI Rule

#### Automated

- [ ] 3.1 `npm run lint` and `npm run build` pass after fixture removal and UI-rule update.
- [ ] 3.2 The hardcoded-value scan still returns zero candidate matches for the four scoped files.

#### Manual

- [ ] 3.3 The kitchen-sink review shows default, hover, focus-visible, disabled, error and empty; loading is marked N/A with the SSR reason.
- [ ] 3.4 Confirm every control has an accessible name and visible keyboard focus, and the delete warning and error/success feedback remain distinguishable.
- [ ] 3.5 Desktop and phone screenshots and review notes are retained; author gives final visual acceptance.
