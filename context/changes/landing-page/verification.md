# Landing page implementation verification

Implementation evidence collected on 2026-11-02. Prototype checks remain comparison-only evidence. All six Manual Progress rows remain pending author review; automated browser inspection does not constitute visual approval.

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

The reflow capture uses a 720 CSS-pixel viewport and scale factor 2 to approximate a 1440px desktop at 200%. It is an automated reflow simulation; actual browser zoom and author acceptance remain pending.
