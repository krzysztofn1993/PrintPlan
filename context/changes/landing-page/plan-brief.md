# Landing Page — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)
> Selected reference: [C with Filament stock preview](prototypes/index.html?variant=extended&illustration=panel)

## What & Why

Give PrintPlan a public entry that explains its value before asking visitors to create an account. The author selected **C — Full presentation with FAQ** and **Filament stock preview** after comparing three content scopes with and without an illustration.

## Starting Point

Today `/` redirects to sign-in or the dashboard. The application already has Carbon Terminal styling, functioning account flows and stock management; the new page builds on those contracts.

## Desired End State

Both guests and signed-in visitors can read the landing page. Guests see Create an account and Sign in; members see Open dashboard. Successful sign-in and email confirmation go directly to the dashboard; sign-out returns to the public landing page.

The page presents the hero, actual inventory preview, three workflow steps, feature explanations, estimate caveat, practical FAQ, final CTA and footer. Title: **PrintPlan — Plan your next print**. Description: **Track your estimated filament stock, reserve material for planned prints, and record actual consumption with PrintPlan.**

## Key Decisions Made

| Decision             | Choice                                                   | Why                                                                   | Source                     |
| -------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------- |
| Root behavior        | Landing for guests and members                           | The author wants the product page accessible while signed in.         | Plan                       |
| Guest CTA            | Create an account primary; Sign in secondary             | Direct new visitors to the existing registration flow.                | Plan                       |
| Member navigation    | Open dashboard                                           | Keep a clear route back to working data.                              | Plan                       |
| After authentication | Direct `/dashboard`; sign-out to `/`                     | Preserve the current effective destination after making root public.  | Research + approved phases |
| Content              | C, including feature explanations and FAQ                | Selected after prototype review.                                      | Plan                       |
| Illustration         | Actual Filament stock screenshots with fictional records | The original abstract panel did not resemble the inventory interface. | Plan correction            |
| Metadata             | Explicit product title and description                   | Provide basic SEO without social artwork.                             | Plan                       |
| Presentation         | Existing Carbon tokens and monospace typography          | Match established application standards.                              | Research                   |
| Product promises     | Manual estimates; reservation differs from consumption   | Avoid implying guaranteed physical stock or printer automation.       | PRD + research             |

## Scope

**In scope:** public SSR entry, visitor-aware navigation, successful auth redirect updates, C content, responsive product screenshots, basic metadata, focused smoke/browser acceptance and visual evidence.

**Out of scope:** live inventory on the landing page, domain/database changes, abstract replacement artwork, prototype controls, social cards, tracking, new dependencies, deployment and merge.

## Architecture / Approach

Replace `src/pages/index.ts` with `index.astro`, using the base Layout and existing Carbon surfaces. Add an optional description prop. Session-aware navigation uses private/no-store HTML and preserves cookie handling and auth-unavailable distinctions. Promote the reviewed desktop/mobile captures to `public/landing/`; use responsive sources, descriptive alt text and a sample/static-preview caption. Use native links and FAQ disclosure without hydration.

## Phases at a Glance

| Phase                                           | What it delivers                                                                                       | Key risk                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1. Public entry and account navigation          | Root HTML, account states, metadata, direct successful auth destinations and matching smoke assertions | Leaving login dependent on the removed root redirect.     |
| 2. Full presentation and Filament stock preview | Selected C copy/layout, actual-component screenshots and responsive visual evidence                    | Reintroducing an invented UI or unreadable phone preview. |
| 3. Entry and presentation acceptance            | Browser journeys, HTTP/auth regression checks and final human-review evidence                          | Treating prototype checks as deployed-app acceptance.     |

**Prerequisites:** repository Node/npm setup; local Supabase for browser acceptance; local Supabase, Mailpit and built preview for HTTP smoke. Reviewed screenshot assets already exist.
**Estimated effort:** roughly 2–3 focused implementation sessions across the three phases, plus author visual review; this is a planning estimate.

## Open Risks & Assumptions

- Screenshots need recapture when inventory presentation changes; render the real component with fictional data, preserving the selected appearance.
- The preview shows PLA/Coral at 150 g recorded, 88 g reserved and 62 g available, plus PETG/Black at 420 g recorded/available and 0 g reserved. It is static, not a live account view.
- Root navigation depends on session lookup; preserve unavailable-status handling and private/no-store responses rather than introducing shared caching.
- Prototype checks passed 18 viewport combinations; implementation checks and author visual acceptance remain pending. No database migration is required.

## Success Criteria (Summary)

- Guests and members can read `/`; account links, successful authentication and sign-out lead to the agreed destinations, with dashboard protection intact.
- The page matches C and the real stock preview, explains manual estimates accurately and remains usable at 320/390/1440 px with keyboard-accessible FAQ.
- `npm run verify:deploy`, `npm run test:e2e` and `npm run smoke` pass in their required local environments, and manual acceptance is recorded separately.

## References

- [Full plan and canonical Progress](plan.md), [research](research.md), [prototype notes](prototypes/README.md) and [prototype-only checks](prototypes/verification.json).
- `src/pages/index.ts`, `src/pages/api/auth/signin.ts`, `src/pages/auth/confirm.ts`, `src/layouts/Layout.astro` and `src/components/spools/SpoolInventory.tsx` are the principal affected contracts.
