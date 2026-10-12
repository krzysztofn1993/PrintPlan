# Carbon Terminal Theme — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Apply the supplied Carbon Terminal theme throughout the existing PrintPlan interface. Replacing tokens alone would leave cosmic backgrounds and blue/purple overrides visible, so this change includes their consumers.

## Starting Point

The app already has global semantic variables and `@theme inline`, but dark mode is not activated. Auth, landing, dashboard, and stock surfaces mix those variables with fixed colors; the auth outage page has independent inline CSS.

## Desired End State

All existing pages open in dark Carbon with charcoal surfaces, coral actions, compact corners, and system fonts. Vertical lines, principal-panel top accents, monospace metadata/numbers, and one decorative heading LED give the interface a restrained terminal appearance. Existing account and stock behavior remains intact.

## Key Decisions Made

| Decision           | Choice                                                                                    | Why                                                                  | Source                  |
| ------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------- |
| Scope              | Entire rendered interface, including banners and outage HTML                              | Avoids a mixed appearance between routes.                            | Plan                    |
| Mode               | Fixed dark; light declarations retained but inactive                                      | Matches the accepted appearance without a preference feature.        | Plan                    |
| Decorations        | Vertical workspace lines, principal-panel top edge, one decorative LED per page heading   | Gives Carbon character without highlighting every nested card.       | Plan                    |
| Typography         | System sans-serif for copy/form labels; monospace for metadata and numerical stock values | Keeps forms readable and quantities easy to scan.                    | Plan                    |
| Destructive button | Opaque `#FF797F` background with `#170C0B` text                                           | Fixes the white-text contrast mismatch while preserving the palette. | Plan + Research         |
| Integration        | Merge supplied tokens and font/radius mappings into existing `@theme inline`              | Reuses the installed theme pipeline.                                 | Research                |
| Imports            | Keep Tailwind and tw-animate-css; no new shadcn dependency                                | Additional shared utilities are unnecessary for this change.         | Plan, based on Research |
| Acceptance         | Chrome, Firefox, phone widths, keyboard, contrast, screenshots, existing tests            | Covers browser requirements and theme-specific risks.                | Plan                    |

## Scope

**In scope:**

- Global theme and shared controls, navigation, banners, and auth hints.
- Landing, sign-in/up, all confirmation branches, dashboard, stock states, and standalone outage retries.
- Readable error/success/warning roles, focus states, responsive wrapping, and documented visual acceptance.

**Out of scope:**

- Light-mode rollout/toggle, external fonts, new dependencies, framework upgrades, or a browser regression suite.
- API/data/authentication changes, new features, landing-copy rewrite, broad field consolidation, and unused components.
- Full prototype reproduction, monospace body/form labels, LEDs in every panel, or animated decorations.

## Architecture / Approach

Use global semantic tokens and a small shared set of decoration classes across Astro pages and React islands. Activate dark mode in the server-rendered layout. Keep an inline Carbon subset for outage HTML so its private 503 and retry actions continue to work without external assets. Remove the cosmic utility after migrating its consumers.

## Phases at a Glance

| Phase                                       | What it delivers                                                          | Key risk                                                |
| ------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1. Theme Tokens and Shared Elements         | Palette, mappings, dark activation, reusable controls/navigation/feedback | Existing callers override defaults.                     |
| 2. All Existing Views and Standalone Errors | Complete route adoption and restrained decoration placement               | Stock focus/state contracts and independent outage CSS. |
| 3. Verification and Visual Acceptance       | Native gates, smoke, browser review, contrast evidence, screenshots       | HTTP tests cannot verify the rendered appearance.       |

**Prerequisites:** Node 24.21.0, npm dependencies, configured local Supabase/Mailpit for smoke and authenticated views, Chrome/Firefox access, and screenshot capture. Use manual browser capture if host browser tooling is unavailable; no new permanent runner is required.
**Estimated effort:** Approximately 2–3 focused implementation sessions across three phases, plus human browser acceptance; environment setup may add time.

## Open Risks & Assumptions

- The prototype HTML is unavailable; supplied CSS and agreed placement rules define the target rather than exact prototype fidelity.
- Rendered opacity/hover/focus colors need measured checks; source palette calculations alone are insufficient.
- Missing required service/browser coverage stays pending until verified. The light palette is retained but is not an accepted user-facing mode.

## Success Criteria (Summary)

- Every existing rendered surface has coherent dark Carbon styling with moderate decorations and readable enabled text/focus indicators.
- Existing auth and stock contracts pass; input retention, focus restoration, retry behavior, and mutation guards remain usable.
- Chrome/Firefox desktop and 390px/320px layouts pass review; screenshots and contrast results are recorded and the author accepts the appearance.

## References

- [Change request](change.md), [theme reference](target-theme.css), and [research](research.md).
- [Product requirements](../../foundation/prd.md) and [full plan with code references](plan.md).
