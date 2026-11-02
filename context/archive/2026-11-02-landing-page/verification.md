# Landing page implementation verification

Implementation evidence collected on 2026-11-02. Prototype checks remain comparison-only evidence. The author confirmed all six Manual Progress rows after reviewing the running app and the completed evidence record. No manual acceptance items remain pending.

## Environment

- Pinned Node 24.21.0; `npm ci` completed.
- Local Supabase and Mailpit running; auth health returned 200 and Mailpit v1 API responded.
- Ignored `.env` and `.dev.vars` initially contained different local Supabase keys. The original `.dev.vars` was backed up and its Supabase fields temporarily aligned with `.env` for all gates. Original ignored configuration will be restored at run end; no credentials are recorded here.
- Installed Chromium and Firefox both launched successfully. No new dependency, database change, deployment, push, or paid workflow.
- Roadmap lookup found no matching Change ID; roadmap left untouched.

## Phase 1 — public entry and account navigation

- `npm run verify:deploy`: PASS, including 100 native tests, ESLint, Astro sync/check (zero errors), and production build. Initial formatting failure resolved mechanically; post-install edit-hook timeout superseded by passing checks. [Log](reviews/phase-2/phase-1-verification.log).
- Built preview: `npm run preview -- --host 127.0.0.1 --port 4321`.
- `npm run smoke`: PASS, including root HTML, direct dashboard signin/confirmation, all product regressions, cookie refresh/rotation/deletion and revoked-session rejection. [Log](reviews/phase-2/phase-1-smoke.log).
- Deliberate break: staged production root temporarily returned HTTP 418; scoped `BASE_URL=http://127.0.0.1:4322 npm run smoke` against a temporary dev server failed with “Expected HTTP 200 from the app”. Restored unconditionally with `git checkout -- src/pages/index.astro`; repository verification passed afterward. The first probe preceded temporary-server readiness and was discarded. [Red evidence](reviews/phase-2/phase-1-break-check.log).
- Commit: `c7f9a5e`.

## Phase 2 — complete selected C presentation

- `npm run lint`: PASS. [Log](reviews/phase-2/lint.log).
- `npm run build`: PASS. [Log](reviews/phase-2/build.log).
- `node /tmp/landing-inspect.mjs context/changes/landing-page/reviews/phase-2`: PASS against the built preview. At 320/390/1440 CSS pixels, images loaded, mobile source selected through 600px, desktop source selected at 1440px, no horizontal overflow and no page JavaScript errors. Native FAQ opened with Enter and closed with Space; visible focus outline checked. [Measurements](reviews/phase-2/inspection.json).
- Public assets are unchanged copies of the selected real-component captures: desktop 1440×700 / 72,928 bytes; mobile 390×1436 / 75,099 bytes. Fictional sample data only; visible static-preview caption.
- Repository-wide `npm run verify:deploy`: PASS (100 native tests, lint, types with zero errors/warnings, production build). [Log](reviews/phase-2/repo-verification.log).
- No production tests changed in this phase, so no deliberate-break test applies.

| Implemented view       | Evidence                                                      |
| ---------------------- | ------------------------------------------------------------- |
| Chromium 320px         | [Screenshot](reviews/phase-2/chromium-320.png)                |
| Chromium 390px         | [Screenshot](reviews/phase-2/chromium-390.png)                |
| Chromium 1440px        | [Screenshot](reviews/phase-2/chromium-1440.png)               |
| 200% equivalent reflow | [Screenshot](reviews/phase-2/chromium-200-percent-reflow.png) |

The reflow capture uses a 720 CSS-pixel viewport and scale factor 2 to approximate a 1440px desktop at 200%. It is an automated reflow simulation; the author subsequently accepted this manual criterion in row 2.4.

## Phase 3 — entry and presentation acceptance

- `npm run verify:deploy`: PASS (103 native cases; zero Astro type errors/warnings; lint and build). [Log](reviews/phase-3/verification.log). Default native runs include one opt-in real-tools hook case skipped by design; the final repository gate explicitly enabled it and passed with zero skipped tests.
- `npm run test:e2e`: PASS, 91/91 tests in 2.4 minutes. All eight new landing cases and existing recovery cases passed; generated account teardown succeeded. Each authenticated landing test establishes a fresh session in an isolated context; setup storage state is never reused. Global sign-out remains unchanged. [Log](reviews/phase-3/e2e.log).
- `npm run smoke`: PASS against the built preview with local Supabase and Mailpit, including private guest/member root HTML, direct dashboard signin/confirmation, public landing after signout, cookie issuance/deletion/refresh and protected dashboard scenarios. [Log](reviews/phase-3/smoke.log).
- `node /tmp/landing-inspect.mjs context/changes/landing-page/reviews/phase-3 both`: PASS using installed Google Chrome 155.0.8059.39 and Firefox 157.0. At each target width, the selected preview loaded, overflow was absent, no page errors occurred, FAQ keyboard disclosure worked and focus was visible. [Measurements](reviews/phase-3/inspection.json).
- `git diff --check` and byte comparisons of both public screenshots to their reviewed source captures: PASS.

| Actual implementation             | Chrome                                                      | Firefox                                                      |
| --------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| 320px                             | [Screenshot](reviews/phase-3/chrome-320.png)                | [Screenshot](reviews/phase-3/firefox-320.png)                |
| 390px                             | [Screenshot](reviews/phase-3/chrome-390.png)                | [Screenshot](reviews/phase-3/firefox-390.png)                |
| 1440px                            | [Screenshot](reviews/phase-3/chrome-1440.png)               | [Screenshot](reviews/phase-3/firefox-1440.png)               |
| 200% equivalent reflow simulation | [Screenshot](reviews/phase-3/chrome-200-percent-reflow.png) | [Screenshot](reviews/phase-3/firefox-200-percent-reflow.png) |

All captures show the implemented SSR page, not the standalone prototype. The author subsequently accepted the visual, navigation and content criteria in rows 1.3, 2.3, 2.4 and 3.4. No deployment or merge is authorized by these automated results.

### Deliberate-break and final repository gates

- Auth contracts: temporarily adding `/` to protected paths made all three new middleware cases fail (302/503 instead of 200). Command: `node --experimental-strip-types --test --test-name-pattern='public root|unconfigured auth' scripts/auth-contracts.test.mjs`. Restored with `git checkout -- src/lib/auth-response.ts`. [Red evidence](reviews/phase-3/break-auth.log).
- Browser acceptance: temporarily setting root `Cache-Control: public` made the guest HTML case fail, receiving `["public"]` instead of private/no-store. Command: `npm run test:e2e -- tests/e2e/landing-page.spec.ts --project=chromium --grep 'guest receives'`. Setup and teardown passed. An initial anchored grep matched no tests and was corrected before the valid probe. Restored with `git checkout -- src/pages/index.astro`. [Red evidence](reviews/phase-3/break-e2e.log).
- HTTP smoke: the deliberately broken build failed `npm run smoke` at the public-root private/no-store assertion. Restored source from the index unconditionally; stopped the broken preview. [Red evidence](reviews/phase-3/break-smoke.log).
- Final `PRINTPLAN_HOOKS_REAL_TOOLS=1 npm run verify:deploy`: PASS, 103/103 native cases with zero skipped, including the real-tools hook proof, ESLint, Astro sync/check with zero errors/warnings (14 nonblocking hints), and the restored production build. [Log](reviews/phase-3/repo-verification.log).
- Earlier default 100-case native runs had 99 passed and one opt-in real-tools case skipped; the initial phase-3 103-case run had 102 passed and the same opt-in case skipped. The explicit final run above covers that opt-in case; no required gate was omitted.
- All deliberate production edits were restored; no test assertion was weakened, deleted or bypassed.

## Human checklist

- [x] 1.3 A guest and a signed-in visitor can each open `/` without redirection and see the appropriate account actions; completing sign-in reaches the dashboard, and signing out returns to the landing shell.
- [x] 1.4 A recognized auth-unavailable state leaves public content readable with accurate status wording, while anonymous dashboard access still requires sign-in and outage recovery remains available.
- [x] 2.3 The implemented page matches the selected C content and corrected Filament stock preview, including real inventory labels/actions, both fictional records and a clear static/sample-data caption.
- [x] 2.4 Desktop and phone screenshots, 200% zoom, keyboard focus and FAQ interaction are acceptable; estimate limitations and the reservation-versus-consumption distinction remain clear.
- [x] 3.4 In current desktop Chrome and Firefox and the phone layout, the author accepts C's content hierarchy, product preview, contrast, keyboard navigation and CTA clarity.
- [x] 3.5 Final verification evidence distinguishes implementation results from prototype checks, and all outstanding human checks are explicitly recorded before the change is considered ready to merge.

## Author review follow-up

- Author confirmation: 1.3, 2.3, 2.4 and 3.4 accepted in conversation on 2026-11-02; 1.4 subsequently accepted explicitly ("1.4 works"). The author subsequently accepted the documentation record in row 3.5 and requested a commit. No commit SHA is assigned to human confirmations.
- 1.4 accepted by the author: authentication-outage behavior works.
- 3.5 evidence review: prototype-only checks are identified separately; implementation command logs and Chrome/Firefox screenshots are linked above, and every other Manual row is now author-confirmed. No outstanding application checks remain. The author accepted this documentation item explicitly; no additional runtime test was required.
- Implemented navigation improvement: added a token-styled Home link in the signed-in account navigation, returning to `/` without signing out. Extended the existing fresh-login browser journey to click Home from the dashboard and verify member actions on the landing page.

- Follow-up verification: `npm run verify:deploy` passed ([log](reviews/home-navigation/verification.log)). `E2E_PORT=4322 npm run test:e2e -- tests/e2e/landing-page.spec.ts --project=chromium` passed all 10 cases including setup/teardown, dashboard Home navigation, retained member session, sign-out, responsive preview, FAQ and JavaScript-disabled content ([log](reviews/home-navigation/e2e.log)). Original ignored environment configuration restored afterward.
