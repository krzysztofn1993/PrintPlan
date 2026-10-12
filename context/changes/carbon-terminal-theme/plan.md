# Carbon Terminal Theme Implementation Plan

## Overview

Apply the supplied Carbon Terminal theme across the entire existing interface. Use a fixed dark appearance, shared semantic tokens, and restrained industrial decorations while retaining the existing account and filament-stock behavior.

Planning was approved at MEDIUM complexity with five substantive questions. The author chose the whole interface, fixed dark mode, moderate decorations, dark text on the destructive button, and visual acceptance in Chrome, Firefox, and phone-width layouts. The three phases below were approved before persistence.

## Current State Analysis

`src/styles/global.css` already supplies semantic colors, a dark variant, and `@theme inline`, but `Layout.astro` does not activate dark mode. Many rendered consumers override tokens with cosmic gradients, translucent white surfaces, and blue/purple text. Token replacement alone therefore cannot deliver the requested appearance.

The supplied configuration is retained in `target-theme.css` as an unimported reference. Existing Tailwind and animation imports are sufficient for this change; the additional shadcn stylesheet in that reference requires a package that is not installed and provides utilities this change does not need.

The separate auth-unavailable response renders inline HTML/CSS without the application layout. Native auth tests enforce its retry actions, messages, private 503 response, and inline style boundary. Stock interactions already maintain input retention, focus transitions, live feedback, and guards against duplicate or uncertain mutations.

The research revision matches current HEAD, `41e27b6f776af65dbae5ed35e64847e4a08797a1`. A focused follow-up found one additional token bypass: the password-length hint inside `SignUpForm.tsx`. No domain glossary or lessons document exists. Domain labels follow the PRD and current stock UI.

## Desired End State

Every currently rendered page uses the dark Carbon palette from its first render: background `#090C0D`, foreground `#F0F3F1`, cards `#14191B`, and coral primary `#FF7058` with `#170C0B` foreground. The supplied light declarations remain available in CSS, but there is no light-mode entry point, preference storage, system-mode detection, or toggle.

Use vertical workspace lines, a coral top edge on principal panels, monospace metadata labels and numerical stock values, and one decorative LED next to each page's main heading. Keep body copy and form labels in the sans-serif stack. Feature cards, inventory cards, and nested forms use ordinary semantic surfaces without multiplying highlighted edges or LEDs. The empty inventory and errors remain distinct and understandable through their text and structure.

The destructive button uses the supplied opaque pink `#FF797F` background and dark `#170C0B` text. Remove the current white-text and dark-opacity overrides, and verify the actual hover and focus states. Ordinary enabled text must reach 4.5:1 contrast; qualifying large text and essential non-text indicators must reach 3:1. Disabled controls and decorative grid/LED elements are excluded from those thresholds.

Verify all existing flows using the repository gates and built-preview smoke. Record visual acceptance in Chrome and Firefox, phone-width checks, keyboard checks, rendered contrast measurements, and representative screenshots in this change folder.

### Key Discoveries:

- `src/styles/global.css:75` is the existing utility-mapping boundary; `src/layouts/Layout.astro:14` is the mode-activation boundary.
- `src/components/ui/button.tsx:12` contains the destructive foreground/opacity mismatch; `src/components/auth/SubmitButton.tsx:15` overrides the primary palette.
- `src/components/auth/SignUpForm.tsx:38` supplies a hardcoded password hint outside the shared field styles.
- `src/components/Welcome.astro:5`, `src/pages/auth/signin.astro:21`, and `src/pages/dashboard/spools.astro:38` illustrate route-level token bypasses.
- `src/components/spools/SpoolInventory.tsx:194` supplies live stock feedback; its focus/state logic must survive visual changes.
- `src/lib/auth-response.ts:29` is a standalone rendering boundary; `scripts/auth-contracts.test.mjs:187` tests its functional contract.
- `.github/workflows/ci.yml:19` defines the native verification sequence. Existing smoke is HTTP based and does not establish visual correctness.

## What We're NOT Doing

- Light-mode rollout, a theme toggle, system preference detection, or persisted theme choices.
- New features, print/reservation behavior, database migrations, API changes, or authentication changes.
- A redesign of page information architecture, rewritten landing marketing content, new navigation, or rebranding the starter text.
- Full prototype reproduction: the referenced `05-carbon-terminal.html` is unavailable; the supplied CSS and agreed placement rules define this change.
- Monospace body copy or form labels, LEDs in every panel, horizontal grid lines, or animated industrial decorations.
- Adding the shadcn package/shared stylesheet, downloading fonts, framework upgrades, or introducing a browser regression-test suite.
- Restyling unused components such as `LibBadge.astro`, or adding sidebar/chart UI merely because their tokens exist.
- Broad auth/stock field consolidation or unrelated accessibility refactors. Maintain existing semantics and correct theme-related focus/contrast issues.

## Implementation Approach

Merge the supplied palette, radius scales through `4xl`, font aliases, and native color scheme into the existing global stylesheet. Keep `tailwindcss`, `tw-animate-css`, the dark variant, and the base border/outline contract. Use shared semantic utilities and a small set of `carbon-*` classes for decoration; avoid route-specific palette literals.

Add a semantic destructive-foreground role for the agreed dark button text. Centralize any success/warning styling needed by banners and stock feedback in global semantic roles, drawing their dark accents from the supplied chart colors and checking contrast on actual surfaces. Errors continue to use destructive styling and explanatory text. These roles describe feedback appearance, not new application state.

Activate dark mode on the server-rendered document so CSS and native controls are correct before hydration. Replace bypass styles incrementally, then remove the obsolete cosmic utility after its final consumer is migrated. Use a minimal inline Carbon subset for the standalone outage response so it renders even without external assets.

## Critical Implementation Details

### Standalone response boundary

The outage page must retain an inline `<style>` block and work without global CSS. Preserve the `AuthRetryTarget` variants, safe internal href handling, POST sign-out retry, reload retry, status 503, privacy headers, and `Retry-After: 30`; edit only presentation inside `createAuthUnavailableResponse`.

### Stock interaction boundary

Stock focus restoration uses element IDs, and uncertain mutation outcomes intentionally block repeat submission until refresh. Preserve IDs, associated labels/errors, alerts, live regions, wrapping rules, and pending/uncertain guards when replacing classes. A decorative LED must be hidden from assistive technology and must not imply backend health.

## Phase 1: Theme Tokens and Shared Elements

### Overview

Establish the shared Carbon contract and make existing controls consume it.

### Changes Required:

#### 1. Global tokens and mode

**Files**: `src/styles/global.css`, `src/layouts/Layout.astro`

**Intent**: Integrate the supplied theme into the established pipeline and activate fixed dark mode before hydration. Define reusable industrial decoration styles once.

**Contract**: Preserve all supplied palette mappings, the `0.18rem` base radius with multiplicative scales through `4xl`, and both system font stacks through `@theme inline`. Keep light declarations inactive, set dark native color scheme, and retain existing imports/base behavior. Decoration classes provide a 42px vertical grid, token-backed panels/top accents, metadata/numeric typography, and a decorative LED. Use shared radius tokens for adopted panel shapes rather than the reference's independent literal panel radius. Keep `bg-cosmic` until phase 2 removes its consumers.

#### 2. Shared controls and auth consumers

**Files**: `src/components/ui/button.tsx`, `src/components/ui/FormField.tsx`, `src/components/auth/FormField.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/PasswordToggle.tsx`, `src/components/auth/ServerError.tsx`, `src/components/auth/SignUpForm.tsx`

**Intent**: Replace hardcoded colors with semantic roles and align enabled, pending, error, hover, and focus appearances. Correct the destructive button pairing without changing submission or validation behavior.

**Contract**: Preserve component props, Button variants/sizes, field names/IDs, input behavior, the password hint predicate, visibility toggles, and pending messages. Use opaque destructive background with dark destructive foreground; make spinner colors follow the enclosing foreground. Keep readable normal form labels, associated stock hints/errors, and visible keyboard focus.

#### 3. Shared navigation and banners

**Files**: `src/components/Topbar.astro`, `src/components/Banner.astro`

**Intent**: Give navigation and feedback the same palette as controls and cards.

**Contract**: Preserve the account navigation label, current-route indication, signed-in/out branches, sign-out POST, email wrapping, links, and minimum existing navigation touch targets. Banner variants retain their `alert`/`status` distinction and consume global semantic feedback styles; feedback meaning remains explicit in text.

### Success Criteria:

#### Automated Verification:

- Theme/control changes pass `npx astro sync`, `npm run lint`, `npx astro check`, and `npm run build`.
- Existing authentication contracts pass `npm run test:auth`.

#### Manual Verification:

- Shared buttons, inputs, password toggles, hints, and banners are readable with visible focus; the destructive button has dark text on opaque pink in enabled and hover states.
- Dark mode and dark native controls appear on initial load without a light flash; normal form labels remain sans-serif.

**Implementation Note**: Record the phase checks in Progress and obtain human confirmation of the manual checks before advancing. Route-level cosmic styles are migrated in phase 2; phase 1 is not full visual acceptance.

## Phase 2: All Existing Views and Standalone Errors

### Overview

Apply the shared contract across all rendered surfaces with the approved moderate decoration placement.

### Changes Required:

#### 1. Landing and auth views

**Files**: `src/components/Welcome.astro`, `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Replace cosmic backgrounds, glow orbs, star fields, gradients, and translucent panels with Carbon surfaces. Keep page structure and existing messages while introducing the approved restrained accents.

**Contract**: Each page uses workspace background and one decorative LED at its main heading. Highlight the primary hero/form/confirmation panel; ordinary feature cards remain unhighlighted. Preserve CTA destinations, auth islands/hydration, form width, confirmation branches, and links. No new marketing content or inferred product functionality.

#### 2. Dashboard and filament stock

**Files**: `src/pages/dashboard.astro`, `src/pages/dashboard/spools.astro`, `src/components/spools/SpoolInventory.tsx`, `src/components/spools/SpoolForm.tsx`

**Intent**: Apply Carbon styling to page headers, inventory, nested forms, confirmations, empty states, and errors. Use terminal typography where it helps scan quantities and metadata.

**Contract**: Highlight each page's principal header/panel and place one decorative LED beside its main heading. Use monospace for stock metadata labels, spool identifiers, and recorded/reserved/available numerical values, while form labels and explanatory paragraphs remain sans-serif. Preserve order, quantity units, estimate explanations, long-label wrapping, field associations, IDs, focus transitions, feedback, and pending/uncertain mutation behavior. Delete confirmation stays distinguishable through heading/text and a semantic warning surface; errors and success feedback use shared roles.

#### 3. Standalone auth outage and obsolete styles

**Files**: `src/lib/auth-response.ts`, `src/styles/global.css`

**Intent**: Bring the outage response into the same visual language without relying on the application stylesheet. Remove the obsolete cosmic utility once no active view uses it.

**Contract**: Inline outage CSS uses the agreed dark palette, system fonts, compact radius, vertical workspace lines, principal-panel top accent, one decorative heading LED, readable action text, and visible focus. Keep its existing functional/HTTP contract intact. Verify application sources contain no remaining cosmic decorations or blue/purple/white palette bypasses in the affected rendered surfaces; supplied chart tokens and legitimate decorative literals are not obsolete styling.

### Success Criteria:

#### Automated Verification:

- All migrated views pass `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npm run lint`, `npx astro check`, and `npm run build`.
- A source audit confirms zero `bg-cosmic` references in `src/` and no obsolete cosmic palette overrides in the affected rendered surfaces.

#### Manual Verification:

- Landing, sign-in, sign-up, every email-confirmation branch, dashboard, stock, banners, and all standalone outage retry variants show coherent dark Carbon styling with the agreed decoration placement.
- Stock empty/list/create/edit/delete/error/success states retain their labels, grams, estimate explanations, focus behavior, input retention, and pending/uncertain guards.

**Implementation Note**: Record phase checks in Progress and obtain human confirmation of the manual checks before advancing to final acceptance.

## Phase 3: Verification and Visual Acceptance

### Overview

Establish that the completed appearance works in supported browsers and preserves functional contracts.

### Changes Required:

#### 1. Verification record and screenshots

**Files**: `context/changes/carbon-terminal-theme/verification.md`, `context/changes/carbon-terminal-theme/screenshots/`

**Intent**: Save concrete evidence of functional and visual acceptance. Use existing verification infrastructure and browser inspection rather than introducing a permanent test harness for this theme change.

**Contract**: Record revision, commands/results, browser versions, viewport sizes, checked routes/states, actual contrast pairs/ratios, and screenshot paths. Save representative landing, auth, stock-list, stock-form/error, delete-confirmation, and outage captures; include desktop and narrow layouts. Capture test-account data only. Missing required browser/service coverage remains pending, never recorded as passed.

#### 2. Acceptance corrections

**Files**: Only the affected presentation files from phases 1 and 2

**Intent**: Correct any contrast, focus, typography, or wrapping defect revealed by final inspection.

**Contract**: Stay within the approved palette and placement rules. Rerun checks affected by a correction; keep behavioral contracts unchanged and update evidence to reflect the corrected result.

### Success Criteria:

#### Automated Verification:

- The final revision passes the native gate sequence: `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npm run lint`, `npx astro check`, and `npm run build`.
- Built-preview smoke passes `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` against configured local Supabase and Mailpit.

#### Manual Verification:

- Chrome and Firefox desktop checks plus 390px and 320px phone-width checks confirm readable layouts, wrapping, visible actions, and no horizontal overflow, including long spool labels, IDs, and email addresses.
- Keyboard checks cover navigation, password toggles, form fields, create/edit/cancel/delete focus transitions, and retry actions; focus indicators remain visible and enabled text/essential indicators meet the specified contrast thresholds.
- Auth validation/pending/server-error states, confirmation branches, stock empty/list/form/delete/pending/error/success/uncertain states, and outage link/sign-out/reload variants are reviewed and documented with representative screenshots.
- The author accepts the final appearance and the verification record contains browser versions, viewports, contrast measurements, results, and linked screenshots with no required coverage marked as passed without evidence.

**Implementation Note**: Final visual acceptance is a human check. Do not mark manual Progress rows complete from HTTP smoke results alone.

## Testing Strategy

### Unit Tests:

Run the existing native auth and spool contract tests. In particular, preserve the outage inline style, retry targets, messages, status, and private headers. Do not add tests that merely assert new class strings or mirror token declarations.

### Integration Tests:

Use the existing local Supabase/Mailpit built-preview smoke for registration, confirmation, sessions, redirects, stock persistence, deletion, and owner isolation. Use Node 24.21.0 and `npm ci` for reproducible dependencies. Follow existing CI configuration without printing or overwriting credentials. Preview runs with `npm run preview -- --host 127.0.0.1 --port 4321`; smoke requires local Supabase and the matching build/preview configuration. No new database test scope is needed for these presentation changes; existing CI database checks remain in place.

### Manual Testing Steps:

1. Visit each route on initial load and navigate between them; verify fixed dark mode, native controls, system fonts, and consistent decoration placement.
2. Exercise auth validation, the conditional short-password hint, visibility toggles, pending submission, server errors, and all confirmation branches with suitable test fixtures/accounts.
3. Exercise empty and populated stock, creation, editing, cancellation, deletion, validation, success, and temporary failures. Use controlled browser request interception or local fixtures for pending/uncertain responses; do not induce production outages.
4. Review stock load failure and each standalone outage retry variant. If the runtime scenario is unavailable, render the existing response helper through a temporary local fixture; do not add production debug routes.
5. Repeat representative views in current Chrome and Firefox at desktop width and at 390px/320px narrow widths. Check long strings, tab order, focus restoration, zoom at 200%, and action reachability.
6. Measure composed colors for primary/destructive buttons, muted hints, feedback text, links, borders, and focus indicators in normal/hover/focus states. Check the stated text and non-text thresholds rather than relying on source hex values alone.
7. Save screenshots and the verification record, then obtain the author's final visual acceptance.

## Performance Considerations

Use the supplied system stacks without external font requests. The static CSS grid and small decorative LED need no JavaScript or animation. Remove the existing large blurred orbs/star fields. Theme activation is server rendered and introduces no hydration dependency, storage read, or preference script.

## Migration Notes

No data migration is required. Deliver the presentation change through the repository's existing release process after verification. Reverting the theme's presentation changes restores the previous appearance without transforming stock or account data. This plan does not authorize a commit, merge, deployment, or production failure injection.

## References

- Change request: `context/changes/carbon-terminal-theme/change.md`
- Research and upstream documentation evidence: `context/changes/carbon-terminal-theme/research.md`
- Supplied palette/decorations: `context/changes/carbon-terminal-theme/target-theme.css`
- Product terminology and browser requirements: `context/foundation/prd.md`
- Stack: `context/foundation/tech-stack.md`
- Existing theme/mode: `src/styles/global.css:75`, `src/layouts/Layout.astro:14`
- Existing stock interaction contracts: `src/components/spools/SpoolInventory.tsx:37`, `src/components/spools/SpoolForm.tsx:102`
- Outage response/test: `src/lib/auth-response.ts:29`, `scripts/auth-contracts.test.mjs:187`
- Gates and integration configuration: `package.json:5`, `.github/workflows/ci.yml:19`

## Progress

### Phase 1: Theme Tokens and Shared Elements

#### Automated

- [x] 1.1 Theme/control changes pass `npx astro sync`, `npm run lint`, `npx astro check`, and `npm run build`. — 2b02194
- [x] 1.2 Existing authentication contracts pass `npm run test:auth`. — 2b02194

#### Manual

- [x] 1.3 Shared buttons, inputs, password toggles, hints, and banners are readable with visible focus; the destructive button has dark text on opaque pink in enabled and hover states. — 2b02194
- [x] 1.4 Dark mode and dark native controls appear on initial load without a light flash; normal form labels remain sans-serif. — 2b02194

### Phase 2: All Existing Views and Standalone Errors

#### Automated

- [x] 2.1 All migrated views pass `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npm run lint`, `npx astro check`, and `npm run build`. — 366bec4
- [x] 2.2 A source audit confirms zero `bg-cosmic` references in `src/` and no obsolete cosmic palette overrides in the affected rendered surfaces. — 366bec4

#### Manual

- [x] 2.3 Landing, sign-in, sign-up, every email-confirmation branch, dashboard, stock, banners, and all standalone outage retry variants show coherent dark Carbon styling with the agreed decoration placement. — 366bec4
- [x] 2.4 Stock empty/list/create/edit/delete/error/success states retain their labels, grams, estimate explanations, focus behavior, input retention, and pending/uncertain guards. — 366bec4

### Phase 3: Verification and Visual Acceptance

#### Automated

- [x] 3.1 The final revision passes the native gate sequence: `npm run test:auth`, `npm run test:spools`, `npx astro sync`, `npm run lint`, `npx astro check`, and `npm run build`. — 3381111
- [x] 3.2 Built-preview smoke passes `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` against configured local Supabase and Mailpit. — 3381111

#### Manual

- [x] 3.3 Chrome and Firefox desktop checks plus 390px and 320px phone-width checks confirm readable layouts, wrapping, visible actions, and no horizontal overflow, including long spool labels, IDs, and email addresses. — 3381111
- [x] 3.4 Keyboard checks cover navigation, password toggles, form fields, create/edit/cancel/delete focus transitions, and retry actions; focus indicators remain visible and enabled text/essential indicators meet the specified contrast thresholds. — 3381111
- [x] 3.5 Auth validation/pending/server-error states, confirmation branches, stock empty/list/form/delete/pending/error/success/uncertain states, and outage link/sign-out/reload variants are reviewed and documented with representative screenshots. — 3381111
- [x] 3.6 The author accepts the final appearance and the verification record contains browser versions, viewports, contrast measurements, results, and linked screenshots with no required coverage marked as passed without evidence. — 3381111
