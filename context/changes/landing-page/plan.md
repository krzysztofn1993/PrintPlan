# Landing Page Implementation Plan

## Overview

Create a public PrintPlan landing page at `/`, using the author's selected prototype **C — Full presentation** with **Filament stock preview**. Explain the manual inventory, reservation and settlement workflow in the existing Carbon Terminal style, and provide appropriate account navigation for guests and signed-in users.

The author approved the three phases below after comparing three content scopes, each with and without an illustration. The approved illustration is a screenshot of the actual inventory component with fictional records; it supersedes the invented reservation card in the first prototype.

## Current State Analysis

- `src/pages/index.ts:3` redirects guests to `/auth/signin` and signed-in visitors to `/dashboard`; no public home page currently renders.
- Successful password sign-in and email confirmation return to `/` (`src/pages/api/auth/signin.ts:46`, `src/pages/auth/confirm.ts:36`). Their effective destination is currently the dashboard because of the root redirect. Sign-out also returns to `/` (`src/pages/api/auth/signout.ts`).
- `scripts/smoke.mjs:491` expects the anonymous root redirect. Its successful sign-in and confirmation checks also expect `/`; those expectations must change with the corresponding endpoints. Sign-out expectations remain `/`.
- `tests/e2e/auth.setup.ts:17` signs in through the UI and expects `/dashboard`. The existing browser fixture checks successful sign-in status, rather than requiring the old root destination (`tests/e2e/fixtures.ts:138`).
- `src/lib/auth-middleware.ts` independently protects dashboard paths, refreshes cookies, and distinguishes unavailable authentication from a missing session. `src/components/Topbar.astro` already demonstrates this distinction in account navigation.
- `src/layouts/Layout.astro:6` accepts a title but no description. It owns global styles, dark mode, document language and configuration banners.
- `src/styles/global.css` supplies Carbon surfaces, geometry, monospace typography and navigation styles. The inventory renders actual shared collection tables (`src/components/spools/SpoolInventory.tsx:432`); it does not use the first prototype's spool illustration, stock bar or reservation card.
- The approved comparison artifact is `prototypes/index.html?variant=extended&illustration=panel`. Its `filament-stock-1440.png` and `filament-stock-390.png` images were captured from the actual server-rendered `SpoolInventory` with fictional data and existing compiled application CSS. The surrounding dashboard heading and navigation follow current source.
- Prototype checks passed all 18 combinations of three content scopes, two illustration choices and three viewport widths. Those checks validate the comparison artifacts only; application routing and integration verification remain pending.

## Desired End State

`GET /` returns a complete English landing page for both guests and signed-in visitors. Guests receive a primary **Create an account** link to `/auth/signup` and secondary **Sign in** navigation to `/auth/signin`. Signed-in visitors see **Open dashboard** linking to `/dashboard`, while remaining able to read the landing page.

Successful password sign-in and email confirmation redirect directly to `/dashboard`; successful sign-out returns to the public landing page. Dashboard access restrictions and failure responses retain their existing behavior. During a recognized authentication outage, public content remains readable and account status is described as temporarily unavailable, rather than confidently claiming the visitor is signed out.

The page follows prototype C: hero, actual Filament stock preview, three workflow steps, feature explanations, estimate caveat, practical FAQ, final account CTA and footer. The inventory preview uses desktop and mobile screenshots of the real component with fictional data. Its controls are visibly part of a static image, not interactive inventory actions.

The document title is **PrintPlan — Plan your next print**. Its description is **Track your estimated filament stock, reserve material for planned prints, and record actual consumption with PrintPlan.** The page works without client hydration and remains usable at 320 px, 390 px and 1440 px, with keyboard navigation and native FAQ disclosure.

### Key Discoveries:

- Making `/` public without changing successful auth destinations would leave users on the landing page after login and break the current browser setup (`src/pages/api/auth/signin.ts:46`, `tests/e2e/auth.setup.ts:17`).
- The product distinguishes recorded, reserved and available grams; reservation does not consume stock, and manual estimates cannot guarantee physical sufficiency (`context/foundation/prd.md`, Business Logic).
- The current inventory has five table columns and row-level Edit/Delete actions (`src/components/spools/SpoolInventory.tsx:432`). Preserve that appearance in the illustration instead of redesigning the inventory for marketing.
- The desktop inventory table layout starts at 80rem, so capturing it at 1248 px yields the responsive card layout; use the selected 1440 px desktop capture and separate 390 px mobile capture (`src/styles/global.css:766`).

## What We're NOT Doing

- Implementing prototypes A or B, retaining their comparison controls on the production page, or adding a production theme/illustration switcher.
- Using the rejected invented reservation card, a generated spool graphic, or a new marketing interpretation of inventory UI.
- Changing inventory, reservation, safety-margin or settlement logic, DTO bindings, database schemas, policies or account roles.
- Mounting a live stock inventory, loading private spool data, or exposing real user identity inside the public preview.
- Adding printer integration, G-code/3MF import, guaranteed-stock promises, pricing, testimonials or unsupported usage claims.
- Adding Open Graph artwork, social metadata, a custom domain/canonical policy, analytics, tracking or a new dependency.
- Redesigning auth forms, the dashboard shell, existing collection components or global typography.
- Deploying, merging, changing branch protection or running paid reviewer workflows.

## Implementation Approach

Replace the root endpoint with an SSR Astro page using the base `Layout`. Keep the landing composition in `src/pages/index.astro`; use existing Carbon surfaces and account-link treatments, with `carbon-landing-*` geometry confined to the public composition. Do not use `DashboardShell` for the outer page or reuse editable collection components as marketing cards.

Use `Astro.locals.user` and `Astro.locals.authUnavailable` solely to choose account navigation. Do not fetch domain data. Mark this session-dependent HTML private and non-cacheable so a shared response cannot display another visitor's navigation. Keep middleware cookie finalization intact, including refresh headers. Preserve existing configuration banners.

Use the accepted screenshot assets in `public/landing/`, selected through a responsive picture with descriptive alternative text and a visible sample/static-preview caption. Keep source captures and provenance under this change. Use normal navigation links and native `details`/`summary`; prototype dialogs, review selectors and JavaScript are not application requirements.

## Phase 1: Public Entry and Account Navigation

### Overview

Make `/` a public document with correct account actions and metadata, while preserving direct entry into the dashboard after authentication. Keep the existing smoke suite coherent with this routing change in the same phase.

### Changes Required:

#### 1. Root route and account states

**Files**: `src/pages/index.ts` → `src/pages/index.astro`, `src/styles/global.css`

**Intent**: Replace the root redirect with a usable public page shell and the final hero/account actions. Account navigation must distinguish guests, signed-in visitors and recognized authentication outages.

**Contract**: There is exactly one `/` route, with a 200 HTML response for ordinary guest and signed-in requests. Guest primary/secondary destinations are `/auth/signup` and `/auth/signin`; the signed-in primary destination is `/dashboard`. Authentication-unavailable status uses the existing account-navigation wording and retains links to the existing auth pages. Root HTML uses `Cache-Control: private, no-store` and does not expose account email or domain records. Preserve middleware errors and cookies; do not suppress unexpected session errors to force a 200 response.

#### 2. Document metadata

**Files**: `src/layouts/Layout.astro`, `src/pages/index.astro`

**Intent**: Give PrintPlan's public entry an explicit product title and search description without introducing unrelated metadata across other pages.

**Contract**: Add an optional `description` prop to `Layout`, emitting a description meta element only when supplied. Existing callers retain their current behavior. The landing title and description match the literals in Desired End State; preserve document language, viewport, favicon, global styles and configuration banners.

#### 3. Successful auth destinations and matching smoke expectations

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/auth/confirm.ts`, `scripts/smoke.mjs`

**Intent**: Preserve the effective post-authentication destination now that `/` stops redirecting. Update affected smoke assertions with the route changes rather than leaving a failing gate until phase 3.

**Contract**: Successful sign-in and successful email verification redirect to `/dashboard`; their validation, unavailable-service and rejected-credential branches retain existing destinations/statuses. Sign-out still redirects to `/`. Smoke startup expects public root HTML instead of an anonymous redirect, while explicit auth-page and protected-dashboard checks remain. Update only successful sign-in/confirmation destination assertions; do not globally replace all root expectations.

### Success Criteria:

#### Automated Verification:

- Deployment verification passes after the route and metadata changes: `npm run verify:deploy`.
- With local Supabase and Mailpit configured and the built preview running, `npm run smoke` passes with root HTML and direct dashboard destinations after successful sign-in and confirmation.

#### Manual Verification:

- A guest and a signed-in visitor can each open `/` without redirection and see the appropriate account actions; completing sign-in reaches the dashboard, and signing out returns to the landing shell.
- A recognized auth-unavailable state leaves public content readable with accurate status wording, while anonymous dashboard access still requires sign-in and outage recovery remains available.

**Implementation Note**: Record automated results in Progress and request manual confirmation before continuing under the interactive implementation workflow. Manual rows remain pending until reviewed.

---

## Phase 2: Full Presentation and Filament Stock Preview

### Overview

Implement the complete selected C presentation and its actual-application screenshot, using the reviewed prototype as the content and visual reference.

### Changes Required:

#### 1. Complete page content

**Files**: `src/pages/index.astro`, `src/styles/global.css`

**Intent**: Explain the product through the approved C reading sequence and consistent Carbon Terminal presentation.

**Contract**: Preserve the selected prototype's English copy and section order: hero **Your next print. Your filament, accounted for.**; Filament stock preview; **From spool to finished print.** with Record/Reserve/Settle; **A useful estimate. An intentional plan.** with best-fit/manual selection, account margin and settlement explanations; **Good planning starts with your estimate.**; **A few practical answers.**; final **A clearer plan for the next thing you make.** CTA; footer. FAQ covers printer connection/import, reservation versus consumption, cancellation and intended audience. Use one h1, ordered section headings, meaningful landmarks and native FAQ disclosure. All account actions follow phase 1's visitor states. No client hydration or demo controls are needed.

#### 2. Real inventory illustration

**Files**: `public/landing/filament-stock-desktop.png`, `public/landing/filament-stock-mobile.png`, `src/pages/index.astro`, `context/changes/landing-page/prototypes/README.md`

**Intent**: Show the actual stock-management experience the author selected, replacing the rejected abstract card with faithful desktop and mobile captures.

**Contract**: Promote the reviewed `prototypes/filament-stock-1440.png` and `prototypes/filament-stock-390.png` captures to the named public assets. If UI drift requires recapture, use the actual current `SpoolInventory` and dashboard presentation with the same fictional records, never a hand-designed replacement. Desktop shows the sidebar, page heading and five-column inventory table; mobile shows the actual responsive arrangement. Sample records are PLA/Coral with recorded 150 g, reserved 88 g and available 62 g; PETG/Black with recorded 420 g, reserved 0 g and available 420 g. The fictional identity is `preview@example.test`. Use the mobile source at widths up to 600 px, meaningful alt text, intrinsic dimensions, proportional sizing and a visible sample-data/static-preview caption. Image controls must not appear to be live landing-page controls. Do not publish capture scripts, accounts, credentials or review selectors in the application.

#### 3. Responsive layout and review evidence

**Files**: `src/styles/global.css`, `context/changes/landing-page/verification.md`, `context/changes/landing-page/reviews/phase-2/`

**Intent**: Keep the selected full-width product preview readable and document the visual result for author review.

**Contract**: Follow prototype C's corrected layout with the stock preview below the hero introduction. Derive surfaces and geometry from existing Carbon tokens and shared link treatments. Any new public-layout variables live in the central token contract; do not retune dashboard selectors or hard-code a second palette. Content, CTA groups and images fit 320 px, 390 px and 1440 px without horizontal overflow. Retain visible focus and readable layout at 200% zoom. Capture the actual implemented page at those widths and index screenshots in verification.md; do not present prototype screenshots as implementation evidence.

### Success Criteria:

#### Automated Verification:

- Lint and production build pass with the complete C content and public assets: `npm run lint` and `npm run build`.
- Browser inspection at 320 px, 390 px and 1440 px confirms successful image loading, correct mobile/desktop source selection, no horizontal overflow and no page JavaScript errors; results and screenshots are recorded in `verification.md`.

#### Manual Verification:

- The implemented page matches the selected C content and corrected Filament stock preview, including real inventory labels/actions, both fictional records and a clear static/sample-data caption.
- Desktop and phone screenshots, 200% zoom, keyboard focus and FAQ interaction are acceptable; estimate limitations and the reservation-versus-consumption distinction remain clear.

**Implementation Note**: Request visual confirmation against the selected prototype after automated checks; keep unreviewed manual criteria pending.

---

## Phase 3: Entry and Presentation Acceptance

### Overview

Cover the changed public-entry behavior with focused browser acceptance and finalize regression and visual evidence.

### Changes Required:

#### 1. Browser acceptance for the public entry

**Files**: `tests/e2e/landing-page.spec.ts`, `tests/e2e/auth.setup.ts` (only if an assertion needs extending)

**Intent**: Prove the guest and signed-in journeys in the built application and catch regressions caused by removing the root redirect.

**Contract**: Use the existing single-worker Chromium setup and generated local account. The landing suite uses the base browser test facilities rather than product-mutation fixtures, and creates no spools or prints. Cover guest 200 HTML, public access with an existing session, account CTA destinations, direct dashboard entry after sign-in, sign-out followed by public root access and continued dashboard protection. Verify title/description, heading structure, loaded responsive preview images, absence of overflow at the three target widths and keyboard operation of FAQ. Include a JavaScript-disabled guest check for core content, links and native disclosure. Establish a fresh login session in an isolated browser context for every authenticated landing test; do not reuse the setup storage state. Sign-out uses global scope and revokes other refresh sessions for the same account, including independently established sessions. Preserve the existing global sign-out behavior. Reuse existing local-account provisioning and cleanup without logging credentials.

#### 2. HTTP regression coverage and final evidence

**Files**: `scripts/smoke.mjs`, `scripts/auth-contracts.test.mjs`, `context/changes/landing-page/verification.md`, `context/changes/landing-page/reviews/phase-3/`

**Intent**: Confirm entry-route integration and authentication failure handling, while separating automated results from outstanding human acceptance.

**Contract**: Extend smoke beyond phase 1 to verify signed-in root HTML without a dashboard redirect, guest/member CTA distinction, root private/no-store headers and the public landing reached after sign-out. Preserve cookie issuance/deletion, confirmation, session-refresh and protected-page scenarios. Add focused coverage to the existing auth contract harness showing that recognized unavailable authentication reaches public content while still returning dashboard recovery, and that missing/invalid sessions do not turn `/` into a protected route. Do not add static source-string snapshot tests. Record exact commands, environment prerequisites, outcomes and final Chrome/Firefox visual evidence; manual rows stay pending until the author reviews them.

### Success Criteria:

#### Automated Verification:

- The final native, lint, type and build gate passes: `npm run verify:deploy`.
- With local Supabase configured, `npm run test:e2e` passes including landing acceptance and all existing recovery tests.
- With local Supabase and Mailpit configured and the built preview running, `npm run smoke` passes including public root, authenticated root, sign-in, confirmation, sign-out and protected-dashboard acceptance.

#### Manual Verification:

- In current desktop Chrome and Firefox and the phone layout, the author accepts C's content hierarchy, product preview, contrast, keyboard navigation and CTA clarity.
- Final verification evidence distinguishes implementation results from prototype checks, and all outstanding human checks are explicitly recorded before the change is considered ready to merge.

**Implementation Note**: A passing automated suite does not complete manual acceptance. Finish with the evidence links and any remaining manual checklist; this plan does not authorize merging or deployment.

---

## Testing Strategy

### Unit Tests:

Extend the existing middleware contract tests only for the public-versus-protected behavior under missing/invalid sessions and recognized auth outages. Reuse existing cookie-refresh, credential-error and form-validation coverage. No tests are needed for duplicated marketing strings or a one-line optional metadata prop in isolation.

### Integration Tests:

HTTP smoke owns actual sign-in, email confirmation, cookie persistence/refresh, sign-out and route status/header contracts. Its redirect assertions must distinguish `/dashboard` after successful authentication from `/` after sign-out. Browser acceptance owns visible visitor-specific navigation, native FAQ, progressive enhancement, responsive preview selection and layout. Run the existing recovery suite without broadening product mutations or changing its worker model.

### Manual Testing Steps:

1. Open `/` as a guest; inspect C's entire reading sequence, create-account/sign-in links and title/description.
2. Complete sign-in and check direct arrival at `/dashboard`; reopen `/` and confirm the landing remains visible with Open dashboard.
3. Sign out from the dashboard, confirm public landing arrival, and verify protected stock pages still require sign-in.
4. Inspect the stock preview against the actual inventory UI on desktop and phone; confirm both sample records and that screenshot actions are not interactive controls.
5. Navigate the page and FAQ by keyboard, inspect 200% zoom and 320/390/1440 px layouts, and review in Chrome and Firefox.
6. Exercise recognized auth unavailability locally; confirm honest status messaging on the public page and existing recovery on protected pages. Do not change deployed service configuration for this check.

## Performance Considerations

Render content, account links and FAQ on the server without adding a React island, animation library or domain-data calls. Ship one appropriate preview image per viewport via responsive sources; retain intrinsic dimensions to limit layout movement. Inspect asset sizes during implementation and use lossless optimization if available without adding dependencies or changing the reviewed content. Existing middleware still performs its session lookup; removing that lookup or changing global cache strategy is outside this change.

## Migration Notes

No database or stored-data migration is needed. Replace `index.ts` with `index.astro`, change the two successful auth destinations and update their smoke assertions together in phase 1. Rollback must restore the former root redirect, both successful auth returns and the corresponding smoke assertions as a coordinated change. New metadata is optional for other Layout callers. Public screenshot assets contain only fictional records and do not need Supabase to load.

## References

- [Research](research.md) — routing, visual ownership and product-language baseline.
- [Selected prototype](prototypes/index.html?variant=extended&illustration=panel) and [prototype notes](prototypes/README.md) — C with corrected Filament stock preview.
- [Prototype checks](prototypes/verification.json) — comparison-only browser evidence.
- `src/pages/index.ts:3` — current root redirects.
- `src/pages/api/auth/signin.ts:46` and `src/pages/auth/confirm.ts:36` — successful authentication destinations.
- `src/lib/auth-middleware.ts:53` — protected dashboard handling.
- `src/layouts/Layout.astro:6` — document metadata extension point.
- `src/styles/global.css:180` and `src/styles/global.css:766` — Carbon presentation and desktop table breakpoint.
- `src/components/spools/SpoolInventory.tsx:432` and `src/components/ui/CollectionTable.tsx` — actual inventory appearance.
- `scripts/smoke.mjs:491`, `tests/e2e/auth.setup.ts:17` and `playwright.config.ts` — affected acceptance and existing test harness.
- `context/foundation/prd.md` and `context/foundation/lessons.md` — product boundaries and repository priors.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Public Entry and Account Navigation

#### Automated

- [x] 1.1 Deployment verification passes after the route and metadata changes: `npm run verify:deploy`.
- [x] 1.2 With local Supabase and Mailpit configured and the built preview running, `npm run smoke` passes with root HTML and direct dashboard destinations after successful sign-in and confirmation.

#### Manual

- [ ] 1.3 A guest and a signed-in visitor can each open `/` without redirection and see the appropriate account actions; completing sign-in reaches the dashboard, and signing out returns to the landing shell.
- [ ] 1.4 A recognized auth-unavailable state leaves public content readable with accurate status wording, while anonymous dashboard access still requires sign-in and outage recovery remains available.

### Phase 2: Full Presentation and Filament Stock Preview

#### Automated

- [ ] 2.1 Lint and production build pass with the complete C content and public assets: `npm run lint` and `npm run build`.
- [ ] 2.2 Browser inspection at 320 px, 390 px and 1440 px confirms successful image loading, correct mobile/desktop source selection, no horizontal overflow and no page JavaScript errors; results and screenshots are recorded in `verification.md`.

#### Manual

- [ ] 2.3 The implemented page matches the selected C content and corrected Filament stock preview, including real inventory labels/actions, both fictional records and a clear static/sample-data caption.
- [ ] 2.4 Desktop and phone screenshots, 200% zoom, keyboard focus and FAQ interaction are acceptable; estimate limitations and the reservation-versus-consumption distinction remain clear.

### Phase 3: Entry and Presentation Acceptance

#### Automated

- [ ] 3.1 The final native, lint, type and build gate passes: `npm run verify:deploy`.
- [ ] 3.2 With local Supabase configured, `npm run test:e2e` passes including landing acceptance and all existing recovery tests.
- [ ] 3.3 With local Supabase and Mailpit configured and the built preview running, `npm run smoke` passes including public root, authenticated root, sign-in, confirmation, sign-out and protected-dashboard acceptance.

#### Manual

- [ ] 3.4 In current desktop Chrome and Firefox and the phone layout, the author accepts C's content hierarchy, product preview, contrast, keyboard navigation and CTA clarity.
- [ ] 3.5 Final verification evidence distinguishes implementation results from prototype checks, and all outstanding human checks are explicitly recorded before the change is considered ready to merge.
