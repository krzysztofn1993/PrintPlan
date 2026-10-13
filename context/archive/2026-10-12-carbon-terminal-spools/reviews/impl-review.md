<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Carbon Terminal Dashboard and Collections Implementation Plan

- **Plan**: context/changes/carbon-terminal-spools/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-13
- **Verdict**: APPROVED
- **Initial verdict**: NEEDS ATTENTION — both findings resolved during triage on 2026-10-13.
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

The presentation implementation follows the approved expanded plan. The initial review identified a reproduced readability regression and an incomplete retained manual state matrix; both are now fixed. The final verdict is APPROVED. Findings below preserve the original evidence alongside the final decisions.

## Findings

### F1 — Dashboard primary action loses readable text on hover

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/styles/global.css:394
- **Detail**: Hovering “Manage filament stock” on Dashboard applies the generic `.carbon-dashboard-link:hover` background from line 381 (`--accent`). Its specificity exceeds the primary action's normal background rule. The primary hover rule restores `--primary-foreground` but never restores its background, so the enforced dark theme produces nearly black text on a dark accent surface. Chromium 156.0.8078.4 reproduced this using the built stylesheet and the route's exact link classes: normal background `rgb(255, 112, 88)`, text `rgb(23, 12, 11)`; hover background `rgb(56, 37, 34)`, the same text, and `brightness(0.92)`. The unfiltered token pair has approximately 1.33:1 contrast. This regression was introduced by Phase 2; the prior primary action kept its primary background on hover.
- **Fix**: Add `background: var(--primary)` to `.carbon-dashboard-link-primary:hover` and verify the resulting hover appearance and contrast.
- **Decision**: FIXED — Applied the recommended background rule on 2026-10-13, as requested by the author. Lint and build passed; Chromium confirmed the primary background remains on hover and the rendered text contrast is approximately 6.07:1 after brightness(0.92). Before/after measurements are retained in impl-review-dashboard-hover.json.

### F2 — Planned Prints hover review lacks retained evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/carbon-terminal-spools/verification.md:42
- **Detail**: Phase 3 requires reviewing both collections in default, hover, focus-visible, disabled, loading, error and empty states. The retained matrix explicitly records Stock hover at line 37, but the Planned Prints entries at lines 42–47 contain no hover screenshot or review note. None of the 46 Phase 3 PNG artifacts provides an identified Planned Prints hover capture. Criterion 3.3 is marked complete at plan.md:264, so retained evidence does not fully substantiate that completed gate. This is an evidence gap; no Planned Prints hover defect was observed. Its field-errors capture shows a focused Material input, so missing print focus is not asserted.
- **Fix**: Review Planned Prints hover states, retain a clearly identified capture and add the result to the state matrix in verification.md.
- **Decision**: FIXED — Reviewed five Planned Prints hover controls in Google Chrome 155.0.8059.39 at 1440 × 1000 on 2026-10-13, as requested by the author. Retained five clearly named screenshots and prints.hover-review.json under reviews/phase-3; added their links and review notes to verification.md. All hover text contrast ratios exceed 4.5:1 (minimum 5.83:1), with no page errors or horizontal overflow. The actual built collection was mounted with temporary in-memory synthetic data; no backend writes occurred and the capture script was removed.

## Scope and implementation evidence

- Canonical Progress contains **20 completed steps out of 20**, with phases 1, 2 and 3 fully complete; current phase is 3. The input status was `implemented`, updated 2026-10-13.
- A date-only Git range would include the independent Planned Prints implementation. Scope was therefore resolved by feature commit messages: `c273376` (Phase 1), `dc651ca` (Phase 2), `c864aac` (Phase 3), plus `fde3c12` and `21abc81` for bookkeeping. Review baseline is HEAD `21abc81`; the working tree was initially clean.
- All planned production targets changed: global font aliases, shared shell, Topbar, the three dashboard routes, both collection renderers and both forms. The shared presentation contract uses reusable classes in the existing token source; new shared UI components were optional and none were necessary. AGENTS.md and the verification/screenshots were also delivered. Change identity, plan, brief and research updates are supporting documentation consistent with the approved scope.
- Route loaders, redirects, private headers, error reporting, DTOs, ownership boundaries, quantities, ordering and mutation logic remain unchanged. Collection callbacks, IDs, refs, expectedVersion, edit form keys, discard prompts, uncertainty guards and recovery destinations are preserved. No API/schema/library/font/runner additions or production fixtures were introduced.
- Existing Button and FormField remain the control primitives. DashboardShell composes Layout, owns one main landmark and accepts named heading context slots. Topbar retains its default presentation and account state handling. Responsive navigation, long-content wrapping and shared presentation stay in global.css.
- The previously accepted print refresh/write overlap remains outside this review's remediation scope, as specified by the plan and the earlier author's skipped F1 decision.

## Automated verification

Executed on Node **24.21.0** on 2026-10-13. The plan explicitly consolidates lint/build into verify:deploy, so each distinct gate was run once against the final source; this covers the repeated automated criteria in all three reviewed phases.

| Command/check | Result | Actual output |
|---------------|--------|---------------|
| `npm run verify:deploy` | PASS, exit 0 | Auth: 13 passed, 0 failed; stock: 14 passed, 0 failed; prints: 18 passed, 0 failed. Astro sync generated types; ESLint succeeded; Astro check: 61 files, 0 errors, 0 warnings, 0 hints; build completed. |
| Original four-file hardcoded-value scan | PASS | Zero matches; `rg` exit 1 means no matches. |
| Expanded nine-file hardcoded-value scan | PASS | Zero matches; `rg` exit 1 means no matches. |
| Retained evidence links | PASS | All 48 screenshot links in verification.md resolve to existing files; 46 Phase 3 screenshots and 2 Phase 1 screenshots. |

The original scan covers stock route, SpoolInventory, SpoolForm and Topbar. The expanded scan adds prints route, Dashboard route, DashboardShell, PrintList and PrintForm. Both use the exact hardcoded-value candidate expression from `.agents/skills/10x-ui/SKILL.md`, executed with `rg -n -e` and excluding the token source. No new shared presentation component needs additional scan coverage.

The build emitted the existing sitemap configuration warning: the `site` option is absent, so sitemap generation was skipped. Sitemap configuration is outside this change and does not fail the gate.

## Manual verification and limits

- All manual Progress entries are marked complete. Retained evidence supports desktop and 390px/320px layouts in Chrome and Firefox for all three routes, empty collections, pending and disabled controls, validation and feedback, print conflict input retention, refresh discard confirmation and uncertainty recovery. Actual narrow-screen, pending, conflict and focus screenshots were inspected; coverage was not inferred solely from filenames.
- verification.md records no horizontal page overflow in the original browser measurements, disposable local account/data cleanup, temporary capture script removal and author visual acceptance on 2026-10-13. Phase 1 typography evidence is retained. No permanent review route or fixture was found in the production changes.
- The original full signed-in browser exercises were not rerun during this review. Preserved handler/loader code and retained manual evidence support behavior claims; screenshots cannot independently prove every action or cleanup assertion. F2 identifies the specific missing state evidence rather than treating inherited acceptance as proof of that state.
- F1 was reproduced independently in headless Chromium using the current built CSS and temporary in-memory markup matching the Dashboard action. This establishes the CSS cascade problem without adding a fixture or changing production code. Measurements are retained in `impl-review-dashboard-hover.json`.
- Initial SSR collection loading is correctly treated as N/A; client Saving, Deleting and Refreshing have retained evidence.

## Triage progress

- F1 was fixed on 2026-10-13 with a single background declaration in the primary Dashboard hover rule. `npm run lint` and `npm run build` passed. Headless Chromium checked the rebuilt stylesheet and confirmed readable primary hover colours, with approximately 6.07:1 rendered text contrast.
- F2 was fixed on 2026-10-13 by reviewing Add, Refresh, Edit, Delete and Confirm deletion hover states with the actual built PrintList and retaining five screenshots plus browser measurements. verification.md now includes the missing matrix entry and describes the temporary response setup and verification limits. All controls show a visible hover change, readable text and 44px height; no page errors, API requests or horizontal overflow occurred. The temporary capture script was removed.
- Triage is complete: **Fixed: F1, F2 (2); pending: none; skipped: none; accepted risks: none.** The final verdict and dimensions reflect these resolutions; the original review evidence remains recorded above.

## Next action

All findings triaged and fixed. No follow-up remains from this review.
