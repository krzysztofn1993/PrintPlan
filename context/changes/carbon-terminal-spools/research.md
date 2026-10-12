---
date: 2026-10-12T20:51:17+02:00
researcher: Codex
git_commit: 792ded249ccd9f9785a375e95dd6f35991784800
branch: master
repository: PrintPlan
topic: "Adapt the filament stock view to the Carbon Terminal reference"
tags: [research, codebase, spools, ui, carbon-terminal]
status: complete
last_updated: 2026-10-12
last_updated_by: Codex
last_updated_note: Linked the prior Carbon theme research and planned-prints research after reviewing related artifacts.
---

# Research: Adapt the filament stock view to the Carbon Terminal reference

**Date**: 2026-10-12T20:51:17+02:00  
**Researcher**: Codex  
**Git Commit**: 792ded249ccd9f9785a375e95dd6f35991784800  
**Branch**: master  
**Repository**: PrintPlan

## Research Question

Can the current PrintPlan views adopt the presentation of `/home/ubuntu/05-carbon-terminal.html`, starting with `/dashboard/spools`, while using the author's preferred monospace typography?

## Summary

Yes. The existing Carbon tokens and shared controls provide a base for a stock-view restyle. The selected first view can take the reference's terminal framing and denser inventory presentation while keeping PrintPlan's authenticated stock data, create/edit/delete flows, and empty/error handling (`src/pages/dashboard/spools.astro:8-33,37-73`; `src/components/spools/SpoolInventory.tsx:178-381`).

The author's preference is monospace typography throughout the interface. The current `font-sans` alias points to `--carbon-font-sans`, and the page body consumes that alias (`src/styles/global.css:51-52,156-166`). Changing the alias would therefore affect any page consuming `font-sans`; the exact consumer set should be checked when planning that global token change. The prototype's demo data and controls are not a source for product behavior: the inspected `SpoolDto` carries material, colour, dates and gram amounts, while the prototype renders additional fields and demo analytics (`src/lib/spools.ts:13-22`; `/home/ubuntu/05-carbon-terminal.html:92-94,100-132`).

## Detailed Findings

### Page structure and inventory

- The inspected route wraps stock in a centered `max-w-5xl` column, places `Topbar` above a descriptive header, and renders `SpoolInventory` below it (`src/pages/dashboard/spools.astro:37-75`). This leaves a narrower, vertically stacked hierarchy than the reference's sidebar, utility header, hero and inventory section (`/home/ubuntu/05-carbon-terminal.html:92-93`); adapting the shell could make the stock list the visual focus.
- The inventory currently renders two-column cards with material, colour, spool identifier, recorded/reserved/available grams and per-spool actions (`src/components/spools/SpoolInventory.tsx:223-295`). The reference uses dense horizontal inventory rows (`/home/ubuntu/05-carbon-terminal.html:92-93,117-122`); adopting that pattern could make multiple spools easier to scan, provided the existing actions and responsive wrapping remain accessible.
- The selected route performs a server-side authenticated read and renders either a load error or the interactive inventory (`src/pages/dashboard/spools.astro:8-33,54-73`). A visual rewrite should keep these entry states and the existing navigation/sign-out behavior (`src/components/Topbar.astro:6-44`).

### Typography and design-system contract

- `--carbon-font-sans` and `--carbon-font-mono` are defined in the shared stylesheet, and Tailwind's `--font-sans` currently maps to the sans token (`src/styles/global.css:51-52,156-157`). The base body applies `font-sans` (`src/styles/global.css:160-166`), so the author's requested monospace treatment belongs at the shared token alias if intended across the interface.
- The Carbon label and value utilities already use the mono token; quantities also use tabular numerals (`src/styles/global.css:185-198`). Existing Carbon panel, workspace and LED classes are in that same stylesheet (`src/styles/global.css:170-205`).
- Shared `Button` variants provide semantic styles and focus treatment (`src/components/ui/button.tsx:7-25`), while `FormField` connects labels, hints, errors and input state (`src/components/ui/FormField.tsx:28-65`). The spool inventory and form already import these shared controls (`src/components/spools/SpoolInventory.tsx:1-4`; `src/components/spools/SpoolForm.tsx:1-3`).
- The pre-audit hardcoded-value scan returned zero candidate matches across `spools.astro`, `SpoolInventory.tsx`, `SpoolForm.tsx` and `Topbar.astro`. This result applies to those four inspected files and the scan patterns in the 10x UI workflow; it does not cover other routes or inline reference styles.

### Data and workflow boundary

- `SpoolDto` exposes `id`, `material`, `colour`, `createdAt`, `updatedAt`, `recordedGrams`, `reservedGrams` and `availableGrams` (`src/lib/spools.ts:13-22`). In the current mapper, reserved grams are set to zero and available grams equal recorded grams (`src/lib/spools.ts:29-39`); the UI must not imply reservation calculations that are not present in this path.
- The prototype includes brand/location search, stock totals, recent-use charts, material breakdown, sorting/filtering, export messaging and demo-only add behavior (`/home/ubuntu/05-carbon-terminal.html:92-94,100-132`). Those are visual prototype features; the inspected stock DTO and route do not provide those fields or analytics (`src/lib/spools.ts:13-22,48-56`). Use the prototype for composition and visual language, not as authorization to invent product data.
- Current inventory behavior includes adding, correcting and deleting spools, confirmation/error states and refresh guidance after uncertain or stale outcomes (`src/components/spools/SpoolInventory.tsx:120-176,198-221,297-379`). The page also provides load-failure recovery (`src/pages/dashboard/spools.astro:54-69`). These behaviors and their semantics are part of the restyle boundary.

## Charges

1. **Page shell and hierarchy** — `src/pages/dashboard/spools.astro:37-52,71-75` uses a narrow centered column, top navigation and introductory panel; the reference uses a sidebar and utility header before the inventory (`/home/ubuntu/05-carbon-terminal.html:92-93`). The user must reach the stock list through a clearer, denser hierarchy while retaining account navigation.
2. **Inventory scan density** — `src/components/spools/SpoolInventory.tsx:223-295` presents each spool as a card with separate quantity blocks; the reference's row layout (`/home/ubuntu/05-carbon-terminal.html:117-122`) gives the user a denser way to compare recorded, reserved and available stock.
3. **Typography token** — `src/styles/global.css:51-52,156-166` maps body text through the sans alias despite the author's explicit monospace preference. Using the mono alias at the shared font token makes typography consistent across pages consuming `font-sans` and reduces per-view overrides.
4. **Prototype data mismatch** — `/home/ubuntu/05-carbon-terminal.html:92-94,100-132` shows demo brand/location fields, analytics and controls; `src/lib/spools.ts:13-22` defines the stock data available to this view. Reproducing those demo fields as real metrics would mislead users, so the visual treatment must be built around supported stock data.
5. **Existing shared controls and states** — `src/components/spools/SpoolForm.tsx:1-3` and `src/components/spools/SpoolInventory.tsx:1-4` already consume shared `FormField` and `Button`; `src/components/spools/SpoolInventory.tsx:198-221,297-379` contains create, empty, edit and delete paths. Reusing the shared components and preserving those paths keeps visual consistency and functional feedback.

## Code References

- `src/pages/dashboard/spools.astro:8-33` - Authenticated server-side stock read and load failure mapping.
- `src/pages/dashboard/spools.astro:37-75` - Current page shell, header, retry state and inventory mount.
- `src/components/spools/SpoolInventory.tsx:178-381` - Inventory heading, create action, empty state, cards, edit form and deletion confirmation.
- `src/components/spools/SpoolForm.tsx:1-3,95-101` - Form composition and current field state.
- `src/lib/spools.ts:13-22,29-39,48-56` - Stock data shape, derived gram values and owner-filtered list query.
- `src/components/Topbar.astro:6-44` - Account navigation and sign-out action.
- `src/styles/global.css:51-52,156-205` - Font tokens, Tailwind aliases and shared Carbon classes.
- `src/components/ui/button.tsx:7-25` - Shared button variants.
- `src/components/ui/FormField.tsx:28-65` - Shared accessible input, hint and error presentation.
- `/home/ubuntu/05-carbon-terminal.html:92-94,100-132` - Reference composition and its demo-only controls/data.

## Architecture Insights

The repo already has a token-backed Carbon layer and shared controls, so this change can extend those sources rather than introduce a second palette or control implementation. The `font-sans` alias is consumed through shared base styling; changing it is a cross-view typography decision. The new page layout should retain current Astro authentication boundaries and React inventory mutations.

## Historical Context (from prior changes)

- `context/archive/2026-10-12-carbon-terminal-theme/plan.md:44-48,130-136` recorded an earlier decision to keep body copy and form labels sans-serif and to exclude sidebar/chart UI from that broader theme change. That accurately records the prior scope; the current user explicitly prefers monospace and selected the stock view as the first restyle, so those two decisions are superseded for this change. The archived plan also said its HTML reference was unavailable at that time (`plan.md:44`); the reference is available and inspected in this task.
- `context/changes/personal-planned-prints/plan-brief.md:11-14` records that Carbon shared styles were already present while the remaining page restyle was separate from print persistence. This supports keeping the current restyle separate from the planned-prints feature work.

## Related Research

- [Carbon theme research](../../archive/2026-10-12-carbon-terminal-theme/research.md) - documents the shared token integration and earlier typography/scope choices; current monospace preference supersedes its earlier sans body decision for this change.
- [Planned prints research](../personal-planned-prints/research.md) - records that page restyling is separate from print persistence and flags shared theme edits as an overlap to reread before implementation.

## Open Questions

- The visual design can use a sidebar motif, but the plan should decide how to fit the existing account navigation and sign-out into a narrow-screen layout without copying prototype-only labels or status claims.
- A global mono alias affects all views consuming `font-sans`; the planning pass should inspect those consumers and decide whether to update their wrapping/spacing in this same token phase or record any resulting view-specific follow-up.
