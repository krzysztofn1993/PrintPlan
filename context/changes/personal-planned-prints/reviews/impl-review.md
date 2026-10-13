<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Personal Planned Prints Implementation Plan

- **Plan**: context/changes/personal-planned-prints/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-12
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

The original warnings concern the Phase 3 requirements for coordinated pending operations and explicit consent before discarding unsaved inputs. Review-time automated checks passed. During triage, the author skipped F1 because of its low expected likelihood and requested the targeted F2 correction. The author subsequently confirmed that the corrected F2 interaction behaves as described. The verdict above preserves the original review assessment; all triage decisions are complete.

## Findings

### F1 — Forms can submit during a list refresh

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/prints/PrintList.tsx:401; src/components/prints/PrintList.tsx:505; src/components/prints/PrintForm.tsx:125
- **Detail**: The plan requires pending coordination to block incompatible form/list transitions. `refreshList()` sets `refreshingRef` and `refreshing` before awaiting GET (lines 213–217), but both forms receive only `mutationPending`. Their submit guards and controls therefore remain enabled during that GET. Open a create/edit form, start “Refresh list,” accept the discard prompt, then submit while the read is slow. The read can return a snapshot taken before the POST commits and overwrite the committed local result at line 220; it can also unmount the in-flight form and clear the uncertainty guard at line 221. A saved print can disappear from the displayed list, and an uncertain mutation can lose its protection through an overlapping older read.
- **Fix**: Pass the refresh state into both forms' blocking state and enforce a synchronous parent operation check when a form mutation starts, so list reads and writes cannot overlap.
  - Strength: Uses the existing `refreshingRef` / `mutationPendingRef` coordination and matches deletion's explicit refresh check at line 240.
  - Tradeoff: Requires a small coordination change across PrintList and PrintForm; the new parent guard must reject submission before the request is sent.
  - Confidence: HIGH — the read state, form props, submit guard, and state replacement are explicit in the source.
  - Blind spot: This interleaving was established by source analysis; no hydrated browser reproduction was performed in this review.
- **Decision**: SKIPPED — the author considers the likelihood very low given the application's expected quiet usage; no fix requested (2026-10-12).

### F2 — Generic refresh retry can silently discard unsaved edits

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/prints/PrintList.tsx:385
- **Detail**: The plan requires an explicit refresh action that warns before discarding unsaved fields. Any failed list read leaves `listError`; opening an edit does not clear it. The generic error's “Try again” passes the current edit ID as `conflictId`, even when no edit conflict occurred. `refreshList()` skips confirmation whenever that option exists (line 209). Let a list refresh fail, open or continue editing, enter unsaved values, have another tab save that print, then click “Try again.” The successful read installs the newer version and remounts the version-keyed form (line 502), losing the inputs without a discard prompt. The explicit “Read latest print” action gets consent in PrintForm; the generic retry bypasses it.
- **Fix**: Call `refreshList()` from the generic “Try again” button so normal discard confirmation applies; reserve the conflict-specific path for the explicitly confirmed “Read latest print” action.
- **Decision**: FIXED — author approved the displayed one-line change on 2026-10-12; generic “Try again” now calls `refreshList()` and uses the existing discard confirmation. The author subsequently confirmed the corrected behavior during manual checking on the same date.

## Scope and evidence

- Progress is complete: 18/18 rows; current phase is Phase 4. All four completed phases were inspected.
- Git range: `af4ae8e..e848882`. The feature boundary was determined from commits referencing `personal-planned-prints`: `4f30747`, `5f45760`, `c5d6bde`, `05ccddd`, and `e848882`. The working tree was clean before review.
- All planned implementation paths exist. Migration, generated types, database contracts, print validation/service/responses/endpoints, SSR/navigation, native contracts, smoke extraction, CI, and guidance match the planned intent. The two form/list coordination deviations are documented above.
- The lessons register's accepted commit-message rule was read. Additional roadmap, lessons, research, and review artifacts are procedural documentation, with no expansion into reservations, stock schema changes, realtime, automatic write retries, or hosted deployment.
- Owner-scoped queries, atomic expected-version updates, owner-only conflict probes, restricted grants/RLS, normalization, private responses, and bounded diagnostics showed no confirmed security or database integrity defect.
- The earlier report covered phases 1–3. Its pending Phase 4 work and missing Phase 3 revision suffix have since been addressed; this report replaces that earlier assessment with explicit four-phase coverage.

## Automated verification

Reviewed revision: `e848882`; Node `v24.21.0`. Commands were run once per distinct check; `verify:deploy` executes the repeated native/static/build criteria from phases 1–4.

| Command | Result | Actual evidence |
|---------|--------|-----------------|
| `npm ci` | PASS | Exit 0; clean dependency installation on the pinned Node version. |
| `npx supabase db reset --local` | PASS | Exit 0; applied `20261010000000_create_spools.sql` and `20261012000000_create_prints.sql` to the disposable repository-local stack. |
| `npx supabase test db` | PASS | `All tests successful. Files=2, Tests=158. Result: PASS`. |
| `npx supabase gen types typescript --local --schema public` | PASS | Generated to a temporary file; formatted with repository Prettier config; `diff -u` against `src/types/database.ts` returned 0 with no differences. |
| `npm run verify:deploy` | PASS | Auth 13/13, stock 14/14, prints 18/18; Astro sync, lint, Astro check (60 files, 0 errors/warnings/hints), production build. Existing sitemap warning: no `site` configuration. |
| `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke` | PASS | Exit 0; all auth, stock, and print steps passed within the unchanged 300-second run limit, including competing edits, expiry/refresh rotation, and revoked-session rejection. |
| `git diff --check` | PASS | Exit 0; no whitespace errors. |

The concurrent-edit smoke asserted exactly one HTTP 200 and one HTTP 409, a single version increment, persisted fields matching the winner, and rejection of a later stale retry. HTTP smoke does not exercise hydrated React form state or focus.

Local command logs are retained under `/tmp/printplan-impl-review-*`. No hosted CI, deployment, or remote database mutation was performed.

## Manual criteria

- Phase 3 rows 3.2–3.5 retain the author's recorded acceptance in Brave 1.95.104 (reported Chromium 153.0.8010), including keyboard/focus, optional and duplicate prints, stale edits, and responsive widths 390px/320px.
- Phase 4 row 4.4 retains the author's Chrome/Firefox acceptance recorded in `verification.md`; exact browser versions were not recorded. Row 4.5 retains the author's acceptance of Brave responsive emulation and desktop keyboard checks.
- The original phase acceptance consists of historical author observations, not browser runs performed by this review. No screenshots were captured. F1 was explicitly skipped during triage; after the F2 correction, the author confirmed that its interaction behaves as described on 2026-10-12. No browser version or viewport was supplied for this follow-up check.
- Progress checkboxes were not edited. Triage is complete: F1 was skipped by the author and F2 was corrected with a one-line change to PrintList.

## Triage outcome

- **Date**: 2026-10-12
- **Fixed**: F2.
- **Skipped**: F1 — author considers the likelihood very low for the application's expected quiet usage.
- **Pending decisions**: none.
- **Follow-up record**: context/changes/personal-planned-prints/follow-ups/review-fixes.md.
- **Post-fix validation**: `npm run lint`, `npm run build`, and `git diff --check` passed (exit 0). Build retained the existing sitemap warning about missing `site` configuration. The author confirmed the corrected F2 behavior during manual checking on 2026-10-12; no browser run was performed by the review agent.
