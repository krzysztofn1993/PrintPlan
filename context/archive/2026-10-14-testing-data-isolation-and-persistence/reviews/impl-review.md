<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Data isolation and persistence implementation plan

- **Plan**: context/changes/testing-data-isolation-and-persistence/plan.md
- **Scope**: Full plan (one implementation phase)
- **Reviewed phases**: 1
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations
- **Progress at review**: 7/7 completed; current/last phase: 1.
- **Git scope**: `c242a67^..dd558ec`; implementation `c242a67` and closeout `dd558ec`. Date-based history includes unrelated changes, so feature commits define the range. Working tree was clean before review.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Some successful writes lack independent requested-value oracles

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: scripts/print-smoke.mjs:720
- **Related locations**: scripts/print-smoke.mjs:802; scripts/spool-smoke.mjs:379.
- **Detail**: Phase 1, Changes Required §3 requires explicit requested/canonical create/edit expectations followed by independent API and restricted REST reads. The direct print PATCH requests `required_grams: 31`, but the acknowledgement assertion checks only success, row count and version 2 before `rememberRest()` adopts every returned value as its expectation. A write that retains 30 grams while incrementing the version therefore passes that scenario's later exact rereads. The concurrent winner similarly checks its name belongs to either candidate and its version increments, without validating the winning request's name/grams pairing (`Winner one` → 81, `Winner two` → 82) or the requested material/colour. Separately, the direct spool correction validates its acknowledgement contains zero grams, then deletes the record immediately; there is no separately issued API/REST reread of that acknowledged correction. These are test-oracle gaps, not evidence that production currently loses data.
- **Fix**: Validate each write acknowledgement against the actual submitted request and unchanged identity/creation timestamp before replacing its snapshot; retain the concurrent request alongside its result, and independently reread the corrected REST spool through API and REST before deleting it.
  - Strength: Prevents incorrect successful writes from becoming the expected result and closes the independent-read boundary specified in the plan.
  - Tradeoff: Adds targeted assertions in the existing scenarios and two reads before the REST spool fixture is removed.
  - Confidence: HIGH — the request payloads, acknowledgement assertions and snapshot/deletion order establish the gaps directly.
  - Blind spot: No production mutation was injected to reproduce incorrect print acknowledgements during this review.
- **Decision**: FIXED — applied the proposed fix during triage on 2026-10-14. Print REST edits now validate requested grams and retained fields/identity/creation time before saving snapshots; concurrent results retain their request and validate the winner against it. API edits also preserve identity/creation time. REST spool corrections are validated and independently reread through API and REST before deletion. Direct REST creates check all requested editable values before retaining expectations. `npm run lint` and the full built-preview HTTP smoke passed; see `follow-ups/review-fixes.md`.

### F2 — Timeout probes do not expire the shared scenario budget

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/spool-smoke.mjs:502
- **Related locations**: scripts/print-smoke.mjs:245; scripts/smoke.mjs:16; context/changes/testing-data-isolation-and-persistence/verification.md:24.
- **Detail**: The plan requires proof that cleanup remains usable after exhausting the scenario deadline. Both timeout probes create `requestSignal(1)`, wait ten milliseconds, assert that individual signal aborted and throw a synthetic error. They never expire `SCENARIO_DEADLINE_AT`, so a newly created ordinary scenario signal still works during cleanup. Consequently these probes would pass even if cleanup accidentally used the scenario signal rather than its independent cleanup deadline. The evidence table says “Scenario deadline expires” for both probes, overstating the condition exercised. The separate cleanup deadline and session restoration are correctly present; their behavior after a fully exhausted scenario budget remains unproved by these probes.
- **Fix**: Inject expiration of the shared scenario deadline while preserving the cleanup deadline, assert ordinary scenario requests can no longer start, rerun both owner-cleanup probes, and correct the recorded evidence.
- **Decision**: FIXED — applied the proposed fix during triage on 2026-10-14. Both timeout probes now expire the shared scenario deadline, verify ordinary request-signal creation fails, and preserve an independent cleanup window capped at 30 seconds without extending the 300-second total bound. Both timeout and both post-signout probes returned their expected failure and confirmed both owners' tracked records were deleted. Post-run database queries found zero probe rows. `npm run lint`, `git diff --check`, and the full normal built-preview HTTP smoke passed; evidence corrected in `verification.md` and recorded in `follow-ups/review-fixes.md`.

## Scope and implementation comparison

| Planned area                              | Result                                                                                                                                                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restricted-role SQL                       | MATCH: anonymous spool INSERT/UPDATE/DELETE denials; A's complete print victim reread after B's attempts.                                                                                                            |
| Anonymous and reciprocal-owner HTTP/REST  | MATCH: valid anonymous mutations, REST without a user Authorization header, restricted keys, owner rereads and positive controls.                                                                                    |
| Committed values and selected-ID deletion | Partial DRIFT: complete ID-keyed snapshots, fresh login and exact survivors are present; F1 identifies remaining acknowledgement/reread gaps.                                                                        |
| Bounded cleanup                           | Partial DRIFT: independent cleanup deadline, owner reauthentication, ID/owner filtering and combined failure reporting are present; F2 identifies the missing exhausted-budget proof.                                |
| Populated upgrade                         | MATCH: unique scratch database, collision refusal, explicit owner/public CREATE check, native auth schema only, committed restricted-role writes, fresh complete-row comparisons and recognized migration inventory. |
| Package and CI                            | MATCH: migration runner follows local Supabase startup in the smoke job and stays outside `verify:deploy`.                                                                                                           |
| Cookbook and closeout                     | Commands, boundaries, future-upgrade limits and later-phase placeholders are documented; timeout evidence needs F2's correction.                                                                                     |

Changed executable/configuration files match the plan's listed paths. The additional `plan-brief.md` and `research.md` are change preparation artifacts, with no product scope expansion. No production source or migration content was changed by the implementation. Existing validation, concurrency and session scenarios remain present; no additional runner, dependency, reservation behavior or hosted deployment was introduced. Patterns follow existing native Node smoke utilities and transactional pgTAP suites.

## Success criteria verification

Checks rerun during this review with repository-pinned Node `v24.21.0`:

| Criterion / command                 | Result and observed output                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx supabase test db`              | PASS: `Files=2, Tests=162`, `All tests successful`, `Result: PASS`.                                                                                                                                                                                                                                                                                                                                |
| `npm run test:migrations`           | PASS before the fault and after restoration: committed restricted baseline, complete fresh-connection preservation and added print table; `PASS scratch database cleaned up`.                                                                                                                                                                                                                      |
| `npm run verify:deploy`             | PASS: hooks 15 passed / 1 intentionally skipped; auth 13, spools 14, prints 18 passed; lint passed; Astro check 63 files with zero errors/warnings/hints; production build completed. Existing sitemap integration emitted its missing-site configuration warning during build.                                                                                                                    |
| Built-preview HTTP smoke            | PASS on rerun: launched `npm run preview -- --host 127.0.0.1 --port 4321`, ran `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`, exit 0 with `All auth smoke steps passed`. Anonymous/two-owner isolation, independent/fresh-login rereads, exact deletion survivors, competing updates, expiry/refresh, revoked-session rejection and signout all passed.        |
| Deliberate migration fault          | PASS (expected red): temporarily appended `UPDATE public.spools SET recorded_grams = recorded_grams + 1;` to the actual print migration, ran only the disposable runner, observed exit 1 with `The committed A correction to zero was missing.` and scratch cleanup. Restored original bytes in `finally`, confirmed the migration has no Git diff, then reran the unmodified runner successfully. |
| Verification evidence / §6 cookbook | Reviewed §6.1, §6.2 and Phase 1 §6.5, commands, assertion boundaries, upgrade inventory and limits; F1/F2 qualify completion claims. Phase 2/3 remain pending.                                                                                                                                                                                                                                     |

A post-run database query returned zero `printplan_persistence_%` scratch databases. Queries also found zero tagged spool/print cleanup-probe rows. Historical cleanup probes were inspected rather than rerun: rerunning the current per-request timeout probe would not address F2.

The first review smoke run passed all product-data scenarios, then exited 1 at `expired account A session refreshes and rotates cookie tokens` with `App request failed (Error)`. The preview and local stack remained available; no server request corresponding to that refresh appeared in the preview log. The wrapper did not expose the underlying cause, so its root cause is unconfirmed. A complete second run against the same build and preview passed, including that refresh step. No source changes were made between these runs; the initial failure is retained here rather than reported as an uninterrupted pass.

Manual Progress item 1.7 is checked and the verification artifact explicitly records the project owner's approval on 2026-10-14. Its implementation evidence is observable in the code and retained verification; this review does not replace the owner's approval. F1/F2 identify concrete limits in that evidence. No backup-recovery, process-restart or future print-upgrade claim is made.

## Review record

Two parallel reviewers independently checked plan drift and safety/pattern compliance and corroborated F1/F2. No additional evidence-supported security, architecture or pattern findings were identified. The initial review persisted only this report and the change status. During triage the author accepted the proposed fixes for F1 and F2; the existing smoke scripts were updated and verified. Both findings are fixed; no pending decisions remain. The verdicts above preserve the original review result.

## Triage summary

- **Fixed**: F1, F2 (2).
- **Recorded as lesson**: none.
- **Skipped / accepted / dismissed**: none.
- **Validation after F2**: lint passed; all four cleanup probes demonstrated their expected failure and both owners' cleanup; zero remaining probe records; full normal built-preview smoke passed with exit 0 and `All auth smoke steps passed`.
- **Commit scope**: reviewed smoke fixes, corrected verification evidence, review report and triage decisions.
