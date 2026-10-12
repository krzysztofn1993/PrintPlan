# Carbon Terminal Filament Stock View — Plan Brief

> Full plan: `context/changes/carbon-terminal-spools/plan.md`  
> Research: `context/changes/carbon-terminal-spools/research.md`

## What & Why

Adapt the filament stock page to the terminal presentation in the supplied Carbon reference. Use monospace typography through the shared font token across application pages, and restyle the stock layout first while retaining PrintPlan's actual stock fields and workflows.

## Starting Point

`/dashboard/spools` currently uses a centered header and per-spool cards. Carbon tokens and shared Button/FormField components already exist; the prototype's analytics, brand and location data are not part of the stock model.

## Desired End State

The application body uses the preferred monospace stack, and the stock view presents an efficient terminal-inspired workspace with compact spool rows. Existing account navigation, stock CRUD, error/empty handling, focus behavior and real quantities continue to work.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Typography | Map `font-sans` to the existing `--carbon-font-mono` token | Applies the requested type choice through the shared token layer without external fonts | User / Research |
| First layout restyle | `/dashboard/spools` only | The user chose the stock view as the starting point; later views can reuse the contract | User / Change |
| Reference fidelity | Reuse its terminal shell and dense rows, not demo data/features | Current `SpoolDto` does not contain the prototype's extra fields or analytics | Research |
| Existing controls | Continue using repo `Button`, `FormField` and semantic tokens | Shared components already support the stock workflows | Research |
| Visual gate | Temporary local state fixture, then remove it; retain screenshots | No browser runner is configured, and the UI workflow needs a visible state review | Research / Plan |

## Scope

**In scope:**

- Global body typography token change to monospace.
- Terminal-style shell, navigation presentation and dense rows for `/dashboard/spools`.
- Existing forms, actions, errors, empty state and responsive behavior.
- Seven-state visual review and a short UI rule in `AGENTS.md`.

**Out of scope:**

- Structural redesign of other pages, database/API changes, new stock fields or calculations.
- Demo analytics, search/filter/export features, external fonts or a browser test framework.

## Architecture / Approach

Switch the shared font alias first, then apply the reference's visual hierarchy to the spool route using existing Carbon tokens and shared controls. Keep authenticated data loading and React mutations as they are; use a temporary local fixture only for the visual state review.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Global Monospace Token | Body typography uses the existing mono token | Other pages inherit a denser font and may need wrapping review |
| 2. Terminal Stock Shell and Dense Inventory | Responsive stock page inspired by the reference | Sidebar/navigation and long spool labels must fit narrow widths |
| 3. State Matrix, Visual Gate and UI Rule | State screenshots, review notes and reusable UI guidance | Temporary fixture must not remain in production code |

**Prerequisites:** Existing Carbon tokens, shared UI components and user-provided HTML reference are present. Preserve the current staged/unstaged planned-prints changes, especially `Topbar.astro`.  
**Estimated effort:** A few focused implementation and visual-review sessions across three phases.

## Open Risks & Assumptions

- Monospace body text affects all pages using the shared layout; this plan changes typography globally but limits structural redesign to the spool page.
- The standalone auth-outage HTML has its own inline font rules and is outside this one-view restyle.
- The reference's sample node/status labels and metrics are decorative/demo content and must not appear as PrintPlan facts.

## Success Criteria (Summary)

- The app uses the chosen monospace token and the stock page presents the reference's terminal hierarchy with real PrintPlan data.
- Stock CRUD, navigation, focus, errors, empty state and narrow-screen layout remain usable.
- The seven-state visual review and screenshots are recorded, and future UI work is pointed to the shared design contract.
