---
date: 2026-11-02T18:37:33+01:00
researcher: Codex
git_commit: 9d3c71793f51616a3042dd81b3ee27b2d43f688d
branch: landing-page
repository: PrintPlan
topic: "Application landing page following established UI standards"
tags: [research, landing-page, routing, carbon-terminal]
status: complete
last_updated: 2026-11-02
last_updated_by: Codex
---

# Research: Application landing page

## Research Question

What existing routing, product and presentation contracts affect creating an application landing page in accordance with established UI standards? The request comes from `context/changes/landing-page/change.md:12`.

## Summary

The application currently has a redirect at `/`, so adding a public landing page changes an existing entry contract (`src/pages/index.ts:3`). The existing Carbon tokens and public auth-page primitives provide a visual foundation; the dashboard sidebar is a separate presentation concern (`src/styles/global.css:180`, `src/pages/auth/signin.astro:20`, `src/layouts/DashboardShell.astro:15`).

The grounded product message is helping hobbyists check estimated filament availability, reserve material for planned prints, and record actual consumption. It must preserve the distinction between manually entered estimates and physical stock (`context/foundation/prd.md:16`, `:91`, `:100`, `:119`). Planning still needs to select signed-in root behavior and the landing page's content and CTA hierarchy; this research does not select them.

## Detailed Findings

### Entry route and authentication

- `GET /` redirects according to `locals.user`: signed-in users go to `/dashboard`, otherwise to `/auth/signin` (`src/pages/index.ts:3`). The anonymous smoke startup expects the sign-in redirect followed by HTML (`scripts/smoke.mjs:490`). A landing response at `/` requires revising that expectation.
- Successful sign-in returns to `/`; browser auth setup expects the resulting destination to be `/dashboard` (`src/pages/api/auth/signin.ts:46`, `tests/e2e/auth.setup.ts:17`). Retaining the authenticated root redirect would preserve this chain. Showing the landing page to signed-in users would require considering these consumers.
- Email confirmation and sign-out also return to `/`, making the new page relevant to those journeys (`src/pages/auth/confirm.ts:33`, `src/pages/api/auth/signout.ts:11`).
- Dashboard protection is owned by middleware independently of `/`. Protected dashboard requests receive the recovery response when authentication is unavailable, or a sign-in redirect when no user is present (`src/lib/auth-middleware.ts:53`).
- The session lookup also runs for root requests when a client exists. Middleware distinguishes an unavailable auth service from a missing session; unexpected session errors are thrown (`src/lib/auth-middleware.ts:20`, `:30`, `:40`). Public account navigation should respect `authUnavailable` if it displays status. Existing `Topbar` implements that distinction (`src/components/Topbar.astro:57`).

### Presentation contract and reuse

- `Layout` imports global styles, supplies the document, activates dark mode, and renders configuration banners. Its title defaults to starter branding, so a product page needs an explicit title (`src/layouts/Layout.astro:2`, `:10`, `:14`, `:22`). The inspected head exposes a title prop but no description or social metadata props (`:6`, `:15`).
- Semantic colours and Carbon geometry live in `global.css`; the current font aliases use monospace (`src/styles/global.css:6`, `:51`, `:165`). Reuse the token-backed workspace grid, panels, highlighted edges, labels, numeric values and LED decoration (`:180`, `:185`, `:194`, `:202`, `:208`). Sign-in provides a public-view precedent using these primitives (`src/pages/auth/signin.astro:20`).
- Shared buttons provide variants and visible focus treatment; existing navigation classes provide token-backed link treatment and control sizing (`src/components/ui/button.tsx:7`, `:34`, `src/styles/global.css:265`, `:365`).
- `DashboardShell` combines account navigation with dashboard headings and terminal geometry; its desktop styles introduce a sidebar grid (`src/layouts/DashboardShell.astro:15`, `src/styles/global.css:723`). Using the base layout and shared visual primitives allows a public composition without imposing that dashboard structure. This is an architectural inference from those inspected owners.
- Collection tables and record workbenches represent table records and editing/context panels. Their semantics do not establish a landing feature-card component (`src/components/ui/CollectionTable.tsx:40`, `src/components/ui/CollectionRecordWorkbench.tsx:25`).

### Product content boundaries

- The primary audience is a hobbyist checking material before a specific print, using manual data entry (`context/foundation/prd.md:18`, `:24`).
- Stock, planned prints, best-fit or eligible manual spool selection, safety margin and actual-consumption settlement are documented capabilities (`context/foundation/prd.md:84`, `:86`, `:91`, `:100`, `:105`). Current UI explains matching spool eligibility, margin and held grams (`src/components/prints/ReservationPanel.tsx:115`), exposes recorded/reserved/available stock (`src/components/spools/SpoolInventory.tsx:437`), and accepts actual consumption during settlement (`src/components/prints/SettlementPanel.tsx:97`, `:141`).
- Landing examples must label recorded, reserved and available amounts distinctly. Reservation holds material rather than consuming it, and best-fit depends on entered estimates (`context/foundation/prd.md:119`, `:123`; `src/components/prints/ReservationPanel.tsx:120`).
- Avoid promises of guaranteed physical sufficiency, automatic printer tracking or file import: estimate limitations and the manual workflow are explicit product boundaries (`context/foundation/prd.md:92`, `:135`, `:136`).

## Architecture Insights

The route, document layout, visual primitives and authenticated dashboard shell have distinct owners. The landing request can be planned around those existing boundaries. No domain mutation is implied by the request (`context/changes/landing-page/change.md:12`). Any illustrative stock display should keep example data clearly identifiable and preserve the product terminology described above.

## Historical Context

The Carbon theme's approved amendment deliberately retained the root redirects and removed the earlier landing deliverable (`context/archive/2026-10-12-carbon-terminal-theme/plan.md:240`). That historical route decision is supported by the current endpoint. It establishes the baseline this new change will revise, rather than blocking the new request.

The earlier theme plan's sans-serif body direction was superseded by the later explicit monospace decision, which agrees with current CSS (`context/archive/2026-10-12-carbon-terminal-theme/plan.md:23`; `context/archive/2026-10-12-carbon-terminal-spools/plan.md:61`; `src/styles/global.css:165`). Existing dashboard screenshot evidence documents dashboard surfaces, not a completed public landing view (`context/archive/2026-10-12-carbon-terminal-spools/verification.md:4`).

## Code References and Related Research

- `src/pages/index.ts:3` — current root contract.
- `src/lib/auth-middleware.ts:53` — dashboard protection.
- `scripts/smoke.mjs:490` — anonymous root acceptance assumption.
- `src/layouts/Layout.astro:2` and `src/styles/global.css:180` — document and shared public presentation primitives.
- [Earlier Carbon research](../../archive/2026-10-12-carbon-terminal-theme/research.md) — historical theme analysis; interpret landing references using the later approved amendment.
- [Shared dashboard research](../../archive/2026-10-12-carbon-terminal-spools/research.md) — dashboard presentation ownership and component reuse.

## Open Questions for Planning

- Should signed-in visitors to `/` continue to enter the dashboard, or see the landing page? This affects sign-in and confirmation destinations and browser setup expectations.
- What content hierarchy and primary CTA should be adopted? Existing account destinations are `/auth/signup` and `/auth/signin` (`src/components/Topbar.astro:63`). The change note does not specify sections or exact copy.
- Does this change include description/social metadata and a product illustration? Those deliverables are unspecified in the change note; their absence is not a research blocker.

## Coverage and Limitations

Inspected the active request, lessons register, PRD, stack record, root/document/auth paths, shared presentation sources, product-facing reservation/settlement/stock copy, smoke and browser setup assumptions, and relevant Carbon history. Two read-only workers covered routing and design; both completed before synthesis. The existing lesson concerns commit messages rather than landing behavior (`context/foundation/lessons.md:5`).

This is static repository research at the revision recorded above, with the active change directory initially untracked. No builds, tests or browser checks ran. Archived screenshots were referenced through their evidence index and were not visually inspected. Runtime accessibility, responsive appearance and deployment behavior remain implementation verification work. No external framework API question required a documentation lookup.
