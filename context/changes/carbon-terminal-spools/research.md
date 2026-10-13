---
date: 2026-10-12T20:51:17+02:00
researcher: Codex
git_commit: 792ded249ccd9f9785a375e95dd6f35991784800
branch: master
repository: PrintPlan
topic: "Adapt the filament stock view to the Carbon Terminal reference"
tags: [research, codebase, spools, ui, carbon-terminal]
status: complete
last_updated: 2026-10-13
last_updated_by: Codex
last_updated_note: Added current implementation evidence and a presentation reuse recommendation for Planned Prints; qualified superseded typography, worktree, and scope assumptions.
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

**Current follow-up:** The [2026-10-13 findings](#follow-up-2026-10-13--reuse-the-terminal-structure-in-planned-prints) answer cross-view reuse against the current code. The initial findings below retain their original snapshot; the follow-up identifies assumptions that have changed.

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

## Follow-up: 2026-10-13 — Reuse the terminal structure in Planned Prints

**Evidence snapshot:** 2026-10-13T11:43:07Z; researcher: Codex; branch: `master`; commit: `c54c0f0e56df82a7af23dbed3850635056675455`; repository: PrintPlan. `git status --short` returned no entries when gathering this snapshot. References below name local files; the earlier research metadata remains the original investigation's snapshot.

### Question and answer

The author asks whether the Carbon Terminal spool-view structure can be carried into other views immediately, specifically Personal Planned Prints.

**Yes, as a shared presentation contract built during the upcoming stock layout work.** Stock and Planned Prints already repeat the same workspace/container/navigation/header hierarchy and mount separate interactive collections after their server reads. This makes a shared dashboard shell a grounded next step (`src/pages/dashboard/spools.astro:37-75`; `src/pages/dashboard/prints.astro:37-73`). Recommended initial adopters are those two routes; the dashboard landing page is a further candidate because it repeats the workspace/container/navigation frame (`src/pages/dashboard.astro:8-36`).

The new terminal shell is still planned rather than available for direct import. Current stock markup retains its centered column and card grid, while the plan records completed typography work and pending terminal layout/state-review work (`src/pages/dashboard/spools.astro:38-41`; `src/components/spools/SpoolInventory.tsx:223-230`; `context/changes/carbon-terminal-spools/plan.md:174-209`). Adopting the new shell in Planned Prints requires extending the existing stock-only layout scope (`context/changes/carbon-terminal-spools/plan.md:5,30,38`). This research records feasibility and a recommendation, without updating that plan or implementing the expansion.

### Current foundation and reusable boundaries

- **Typography and visual tokens are ready.** `--font-sans` and `--font-mono` now reference `--carbon-font-mono`; the body uses `font-sans`. Carbon workspace, panel, label and quantity styles are defined in the shared stylesheet (`src/styles/global.css:156-198`). A subsequent shell extraction can consume this existing source. The inspected base layout owns the document, dark class, configuration banners and content slot, but contains no dashboard navigation or workspace structure (`src/layouts/Layout.astro:13-36`). A dedicated dashboard shell would fit above this base layout's document responsibilities.
- **Navigation has an existing owner.** `Topbar.astro` provides the Dashboard, Filament stock and Planned prints links, active-route semantics, signed-in email and POST sign-out; it also handles unsigned-in/auth-unavailable display (`src/components/Topbar.astro:2-65`). Recommended shell work should reuse this navigation source, with a terminal presentation variant or shared navigation renderer, to avoid duplicating routes and account behavior. The new shell can be adopted explicitly by stock and prints; the dashboard landing page can be considered separately.
- **Header and workspace structure can be shared.** Stock and prints each provide a page title, eyebrow and explanatory text before a content region (`src/pages/dashboard/spools.astro:37-52`; `src/pages/dashboard/prints.astro:37-50`). A proposed `DashboardShell.astro` can own responsive navigation/content geometry and accept page-specific heading content. This name is a recommendation, not an existing component. Interactive Add/Refresh controls should stay inside their owning collection island unless a later plan explicitly defines their communication with the shell (`src/components/spools/SpoolInventory.tsx:178-212`; `src/components/prints/PrintList.tsx:305-340,394-411`).
- **Collection presentation has reusable patterns.** Collection headings/actions, empty states, row containers, inline form surfaces and delete-confirmation surfaces occur in both collections (`src/components/spools/SpoolInventory.tsx:178-221,223-379`; `src/components/prints/PrintList.tsx:305-340,394-577`). Extract small presentation components or shared styles once the two intended row designs are compared. Keep field composition, callback ownership, IDs and state in the respective collection/form. A generic CRUD controller is unnecessary for sharing this structure.
- **Controls are already shared.** Stock and print forms import the common `Button` and `FormField`; those primitives define button variants/focus treatment and label/hint/error associations (`src/components/spools/SpoolForm.tsx:1-3`; `src/components/prints/PrintForm.tsx:1-3`; `src/components/ui/button.tsx:7-25`; `src/components/ui/FormField.tsx:29-63`). Existing primitives should remain the control source when adjusting row density and form framing.

### Planned Prints requires a distinct row and state contract

For a terminal print row, use its optional name or existing requirement fallback, material, colour, required grams, identifier and Edit/Delete actions. The stock row instead displays recorded/reserved/available quantities. These are different data meanings, even when the surrounding row and action framing look alike (`src/components/prints/PrintList.tsx:57-59,428-496`; `src/components/spools/SpoolInventory.tsx:234-295`).

In the inspected stock mapper, reserved grams are `0` and available grams equal recorded grams. In the inspected print DTO, the fields are ID, optional name, material, colour, required grams, version and timestamps; it has no assigned spool, reservation result or workflow-status field (`src/lib/spools.ts:29-39`; `src/lib/prints.ts:16-25`). Planned Prints explicitly explains that requirements exclude the future safety margin and do not reserve or consume stock (`src/pages/dashboard/prints.astro:46-48`). The terminal reference's online/node/version claims, analytics and demo controls are not evidence for adding those capabilities (`/home/ubuntu/05-carbon-terminal.html:92-94,100-132`).

The layout adaptation must preserve these inspected print behaviors:

- **Refresh and recovery:** the collection has a dedicated refresh action, error/retry feedback and an uncertainty warning. A successful validated refresh replaces the list and clears the uncertainty guard; failed reads return without reaching that reset (`src/components/prints/PrintList.tsx:173-228,317-392`). Stock currently uses page-refresh links for uncertain save/delete results (`src/components/spools/SpoolForm.tsx:309-315`; `src/components/spools/SpoolInventory.tsx:342-348`). Sharing alert framing does not make those recovery mechanisms interchangeable.
- **Competing edits:** edit submits `expectedVersion`; an edit response with status `409` retains inputs, blocks another save and offers Read latest print. Reading the latest print asks before discarding entries, and the edit form is keyed by ID/version (`src/components/prints/PrintForm.tsx:125-141,202-207,226-231,345-371`; `src/components/prints/PrintList.tsx:498-515`). Preserve that form ownership when moving it into an expanded row or shared panel.
- **Uncertain mutations:** transport failure, unreadable successful save and mutation responses with status in the range `500`–`599` invoke the print uncertainty path; form submission and confirmed deletion check that guard (`src/components/prints/PrintForm.tsx:125-134,150-190`; `src/components/prints/PrintList.tsx:158-160,239-240,277-289`). Keep the visible review/refresh action and disabled-state semantics during restyling.
- **Identity and accessibility:** matching entries remain separate records; list copy explains independence, row markup exposes identity, and deletion confirmation names the selected print. Status/alert roles and focus targets remain part of the interaction contract (`src/components/prints/PrintList.tsx:81-86,116-155,313-315,342-347,428-446,524-530`).

For the inspected print client, the new visual state review must include Refreshing and Saving/Deleting, plus conflict and uncertain-outcome recovery (`src/components/prints/PrintList.tsx:328,346-392,557-559`; `src/components/prints/PrintForm.tsx:345-386`). The stock plan's loading N/A applies to its initial server list read, not to these print client operations (`context/changes/carbon-terminal-spools/plan.md:19`; `src/pages/dashboard/spools.astro:21-33`; `src/components/prints/PrintList.tsx:213-217`). Reusing a state-review checklist requires adapting that distinction.

### Historical assertions adjudicated

- **Body font still mapped to sans: superseded.** The initial research and plan describe the previous alias. Current `global.css` maps the body alias to mono, consistent with completed Phase 1 (`src/styles/global.css:156-165`; `context/changes/carbon-terminal-spools/plan.md:174-183`). The prior decision to use system fonts remains supported by the current stacks (`src/styles/global.css:51-52`).
- **Stock-only structural restyle: still the recorded plan boundary.** The existing plan excludes structural restyling of prints/dashboard/auth and proposes a stock-specific navigation variant (`context/changes/carbon-terminal-spools/plan.md:30,38`). The author's follow-up asks whether that boundary can expand; the evidence supports sharing the shell with prints. A later planning revision should state the chosen adopters and acceptance criteria explicitly.
- **Uncommitted planned-print overlap: superseded for this snapshot.** The stock plan records staged/unstaged print edits as its starting condition (`context/changes/carbon-terminal-spools/plan.md:13,42`). The metadata-time `git status --short` result is empty. Current `Topbar` includes the prints destination (`src/components/Topbar.astro:28-33`); future shell work should build on it.
- **Planned-print input/name/order/concurrency choices are open: superseded.** Earlier print research lists those choices for planning; the later agreed plan records optional names, independent duplicate entries, creation order and version conflicts (`context/changes/personal-planned-prints/research.md:137-140`; `context/changes/personal-planned-prints/plan.md:25-32`). Reusing the view structure does not require reopening these choices. Its Carbon/shared-control reuse remains compatible with this recommendation; its earlier sans body guidance has been superseded by the shared mono alias (`context/changes/personal-planned-prints/plan.md:192`; `src/styles/global.css:156-165`).
- **Known print refresh/write overlap: still present in the inspected path.** The print review records F1 as explicitly skipped by the author and F2 discard-warning bypass as fixed (`context/changes/personal-planned-prints/reviews/impl-review.md:26-48`). Current create/edit forms receive `mutationPending`, while list refresh owns separate `refreshing` state; form submission does not receive that refresh state (`src/components/prints/PrintList.tsx:213-217,399-410,500-515`; `src/components/prints/PrintForm.tsx:125-134`). Preserve F2's ordinary `refreshList()` retry (`src/components/prints/PrintList.tsx:380-389`). Do not describe F1 as fixed by presentation reuse or silently expand the UI work into its repair.

### Planning handoff and remaining decisions

Recommended sequence: establish the shared dashboard shell while building the terminal stock layout, adopt that shell in stock and Planned Prints, then adapt each collection's rows and inline panels using common presentation pieces. Keep server loaders, authentication/private-response handling, DTOs and mutation controllers in their current modules (`src/pages/dashboard/spools.astro:8-33`; `src/pages/dashboard/prints.astro:8-33`; `src/components/spools/SpoolInventory.tsx:30-176`; `src/components/prints/PrintList.tsx:61-303`).

The next plan should resolve whether this change includes the complete print row/form restyle or initially shares its outer shell, and whether the dashboard landing page joins the initial rollout. No additional clarification is needed to conclude that sharing the shell with prints is feasible. Authentication pages have their own form-oriented structure; their controls/tokens can remain shared while adoption of dashboard navigation needs a separate view decision (`src/pages/auth/signin.astro:20-35`; `src/pages/auth/signup.astro:20-35`).

The expanded visual acceptance should cover stock and print desktop/phone layouts, long labels and identifiers, keyboard focus, CRUD/confirmation surfaces, print refresh, retained conflict inputs and uncertain-outcome recovery. Previous print acceptance at phone widths does not establish the future shell's fit (`context/changes/personal-planned-prints/plan.md:204-211`; `context/changes/carbon-terminal-spools/plan.md:104-106,140-143`).

### Coverage and limitations

Inspected the current spool route/inventory/form/DTO, base layout, Topbar, dashboard landing page, shared controls/styles, and the prints route/list/form/DTO/update path. Parallel read-only research also checked prior Carbon and planned-print artifacts and the relevant foundation requirements/roadmap. Both delegated investigations completed before synthesis. The repository's lessons register supplied no additional UI-specific constraint (`context/foundation/lessons.md:5-10`).

This follow-up uses static source inspection and existing recorded decisions. No build, test, browser or new screenshot review was performed; visual fit after extraction remains to be demonstrated during implementation. No facts JSON was requested. The recommendation changes no production code, plan progress or lifecycle state.
