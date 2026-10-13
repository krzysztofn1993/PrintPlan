# Carbon Terminal Dashboard and Collections — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Extend Carbon Terminal from filament stock to Planned Prints and Dashboard using one shared frame. Apply compact collection rows and consistent inline panels while preserving existing data and workflows.

## Starting Point

Global monospace typography (Phase 1) is complete. Stock, prints and dashboard still repeat the workspace/Topbar/header frame; both collections use card grids. Carbon tokens, Button and FormField already exist, and the planned-prints feature is merged.

## Desired End State

All three dashboard routes share a desktop sidebar and visible wrapping navigation above phone content. Stock and Planned Prints use dense rows and matching form/feedback surfaces. Stock quantities and print requirements keep their distinct meanings, and existing actions, focus and recovery behavior remain available.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Scope | Full stock and Planned Prints restyle, plus Dashboard shell adoption | Consistent navigation and collection presentation now | User, 2026-10-13 |
| Mobile | Always-visible wrapping links, identity and sign-out | Accessible without menu state or an extra opening action | User, 2026-10-13 |
| Shell | Shared DashboardShell above base Layout; reuse Topbar navigation | Existing routes repeat this frame | Research / Plan |
| State ownership | Keep loaders, islands and controllers in current modules | Print conflicts/refresh differ from stock recovery | Research / Plan |
| Typography | Preserve completed system monospace mapping | Phase 1 already delivered the font preference | Existing plan / Research |
| Progress | Keep all existing IDs, titles and completed rows; append criteria | Preserve implementation history and status | Plan |
| Visual gate | Three-route screenshots and collection states; temporary fixture removed | Reuse must be demonstrated across views and client operations | Plan |

## Scope

**In scope:**

- Shared shell on `/dashboard/spools`, `/dashboard/prints` and `/dashboard`.
- Full terminal rows/forms/confirmation/feedback restyle for stock and prints.
- Dashboard welcome and both management links within the new shell.
- Desktop and 390px/320px review, seven-state matrix, retained screenshots and UI guidance.

**Out of scope:**

- Auth layouts, analytics, prototype data/features, database/API/reservation changes and palette changes.
- Generic CRUD controllers, new fonts/dependencies/browser runner or permanent demo fixtures.
- Repair of the author-skipped print refresh/write overlap (review F1).

## Architecture / Approach

Build DashboardShell around Layout and an opt-in Topbar presentation, then adopt all three routes. Share row/panel presentation while each collection keeps its handlers and fields. Preserve print ID/version keys, conflict inputs, discard consent and uncertainty guards; stock continues using its existing reload recovery.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Global Monospace Token — complete | Existing system monospace mapping and recorded checks | Preserve completed history |
| 2. Shared Terminal Shell and Collections | Three-route shell and complete stock/print restyle | Narrow layout and lifecycle/focus preservation |
| 3. State Matrix, Visual Gate and UI Rule | Expanded state screenshots, final checks and reuse guidance | Initial SSR N/A must not hide client pending states |

**Prerequisites:** Existing tokens, shared controls, merged prints behavior and available HTML reference; Phase 1 is complete. Preserve the supplied research edit and any later unrelated work.
**Estimated effort:** Several focused implementation/review sessions for the two remaining phases; visual iterations may change the total.

## Open Risks & Assumptions

- Long labels, full print IDs and emails must wrap with the sidebar and at 320px.
- Initial SSR loading is N/A; stock Saving/Deleting and print Refreshing/Saving/Deleting require review.
- The accepted F1 refresh/write overlap remains; this change preserves F2's corrected discard confirmation.
- Phone navigation occupies several lines; screenshots must demonstrate reachable controls.

## Success Criteria (Summary)

- The three selected routes share the terminal frame and both collections retain real data, actions and recovery.
- Existing deployment verification and scoped styling scans pass; keyboard and responsive reviews pass.
- State evidence includes print conflicts/uncertainty and client loading, fixtures are removed, and the author accepts the final visuals.

## References

- [Research follow-up](research.md#follow-up-2026-10-13--reuse-the-terminal-structure-in-planned-prints), [full plan](plan.md) and [accepted prints review](../personal-planned-prints/reviews/impl-review.md).
- `src/styles/global.css`, `src/components/Topbar.astro`, the three dashboard routes and the stock/print collection components.
