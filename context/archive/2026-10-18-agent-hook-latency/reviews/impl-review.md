<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Agent Hook Latency Implementation Plan

- **Plan**: context/changes/agent-hook-latency/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-18
- **Verdict**: REJECTED
- **Findings**: 1 critical, 1 warning, 1 observation
- **Revision**: 498e4aef0952873aa2522ea47d6c7e116c4fe8b9
- **Git range**: 1c77e2e^..e2efc82
- **Progress at review**: 13/13 complete; all three phases included.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | FAIL    |

## Findings

### F1 — Linked-worktree pre-push mutates the caller's Git state

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/agent-hooks.test.mjs:23; activated by .husky/pre-push:1
- **Detail**: The newly installed pre-push runs the real full gate, including this fixture suite. Git exports `GIT_DIR` when pushing from a linked worktree. `execute()` inherits it, including through explicit `options.env` overrides, so changing `cwd` does not isolate fixture `git init`, `config`, `add`, and `commit` operations. In two independent disposable-clone reproductions, the actual tracked Husky pre-push failed all 16 fast tests. In the state-capturing reproduction, the caller's HEAD changed from `e2efc82` to an unintended `Proof baseline` commit, its index tree changed, and its shared Git identity became `Hook proof <hooks-proof@example.invalid>`. Application files remained on disk but many became untracked relative to the replacement commit. The push was rejected. The existing push proof replaces `verify:deploy` with a marker fixture and pushes from the primary checkout, so it misses execution of the real suite under the linked-worktree environment. The original developer checkout was never used for these push reproductions.
- **Fix**: Remove Git repository-local environment variables at the test subprocess boundary, after selecting or merging `options.env`, so every fixture Git, Node and npm child gets the intended repository context. Add a regression using the real hook suite under a linked-worktree pre-push environment and assert that caller HEAD, index tree, Git configuration and working-tree status stay unchanged.
  - Strength: Repairs fixture isolation at its source, including callers other than this pre-push wrapper; retains the intended full verification gate.
  - Tradeoff: Environment filtering must cover Git's repository-local variables while preserving the suite's marker, PATH and runner controls.
  - Confidence: HIGH — reproduced with the actual tracked pre-push, real Husky and an independent local bare destination; caller metadata changes were captured before and after.
  - Blind spot: The complete set of inherited Git variables and other platforms were not separately exercised. Use Git's `rev-parse --local-env-vars` list when implementing the boundary.
- **Decision**: ACCEPTED — The author clarified that pushes will be performed outside this VM from one separate repository, not from the reviewed VM checkouts/worktrees. The reproduced linked-worktree push condition is outside the intended workflow; no fix requested. This records the workflow constraint without changing the reproduction evidence.

### F2 — Manual Stop completion lacks automatic-dispatch evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/agent-hook-latency/verification.md:71
- **Detail**: Progress row 3.5 is checked, but the evidence records an actual automatic PostToolUse event followed by direct invocations of the configured Stop command wrapper for the shell error, repair and documentation cases. Those invocations prove the script and wrapper behavior, but do not establish that the trusted Codex Stop event dispatched automatically. Phase 3 explicitly prohibits completing trusted-session criteria from script results alone. This is a gap in recorded evidence, not proof that the configured event fails. Author acceptance of row 3.6 is separately recorded and was not disputed.
- **Fix**: Record an observed automatic Codex Stop event for the shell error, repair and documentation-only completion, or return row 3.5 to pending until that evidence is available.
- **Decision**: FIXED — At the author's request, a live end-of-turn trial on 2026-10-18 observed the automatic Stop invoking real ESLint on a shell-written syntax error, delivering a hook prompt and resuming the agent. The repaired fixture passed explicit ESLint verification; the temporary worktree and registration were removed. The author approved marking this behavior as working. Evidence is persisted in verification.md under "Automatic Stop observation during implementation review". The retry-guard continuation and earlier documentation-only command proof are not represented as new independent automatic lint runs.

### F3 — Verification documentation describes superseded behavior

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: .codex/hooks/README.md:74; context/changes/agent-hook-latency/verification.md:80
- **Detail**: The README says the retargeted opt-in real-tool proof runs Astro and the native suite, although it now exercises lint errors and repairs only. The verification report says the manual checkboxes remain unchecked, while both are checked in Progress. The plan overview also still says implementation has not started. These statements make the final verification state harder to assess.
- **Fix**: Describe the opt-in proof as real ESLint checks and reconcile the stale implementation/manual-state descriptions with the canonical Progress section and the outcome of F2.
- **Decision**: FIXED — Updated the README to describe real ESLint failure/repair checks and the plan overview to record completion of all three phases. The stale manual-checkbox description in verification.md was corrected while recording F2's live verification evidence. Documentation-only changes; no test rerun was needed.

## Verification

All commands below ran on Node v24.21.0, matching `.nvmrc`. Build prerequisites already existed locally; no credentials were printed or copied to the push reproductions. The two prescribed focused ESLint commands returned exit 0 without output.

| Command or criterion                                                                                                                 | Result | Observed evidence                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:auth`                                                                                                                  | PASS   | 22 passed, 0 failed; both controlled-time refresh outage cases enabled, recovery controls intact.                                                                                                                                      |
| `node_modules/.bin/eslint scripts/auth-contracts.test.mjs`                                                                           | PASS   | Exit 0.                                                                                                                                                                                                                                |
| `npm run test:hooks`                                                                                                                 | PASS   | 16 passed, 0 failed, 1 opt-in case skipped. Includes no-tool/native-marker, selective failure and Husky/local-bare push proofs.                                                                                                        |
| `node_modules/.bin/eslint .codex/hooks/check-turn.mjs .codex/hooks/shared.mjs scripts/agent-hooks.test.mjs`                          | PASS   | Exit 0.                                                                                                                                                                                                                                |
| `PRINTPLAN_HOOKS_REAL_TOOLS=1 node --experimental-strip-types --test --test-name-pattern='real tools:' scripts/agent-hooks.test.mjs` | PASS   | 1 passed, 0 failed; real lint errors and repairs through both hooks.                                                                                                                                                                   |
| `npm run verify:deploy` from the terminal                                                                                            | PASS   | Hook/auth/spool/print/reservation suites: 16/22/15/20/8 passed; Astro sync, lint, check and build passed. Astro check: 0 errors, 0 warnings, 1 existing unused-variable hint. Build retains the existing missing-site sitemap warning. |
| Actual tracked pre-push from disposable linked worktree                                                                              | FAIL   | 16 hook tests failed; exit 1; destination unchanged and caller Git metadata modified. Reproduced independently twice. See F1.                                                                                                          |
| Three-run ordinary/auth process medians                                                                                              | PASS   | All four medians below 5 seconds; raw samples below.                                                                                                                                                                                   |
| Three-run documentation-only Stop median                                                                                             | PASS   | 0.050 seconds, below 1 second. No check runner is reached for the Markdown-only fixture; no-tool behavior independently passes the hook proof suite.                                                                                   |

### Review latency samples

Independent local clone at `e2efc82`, Linux x64, Node v24.21.0, real installed dependencies linked from the review checkout. One fixed session ID, no sibling registrations, one harmless comment or Markdown edit at a time. Each fixture was reset before every invocation. Samples ran sequentially after the full gate finished, with no warm-up. Only the hook process was timed using `performance.now()`; setup and reset were excluded. The ordinary edit selected `scripts/spool-contracts.test.mjs`; the auth edit selected `scripts/auth-contracts.test.mjs`.

| Hook        | Scenario                      | Run 1 (s) | Run 2 (s) | Run 3 (s) | Median (s) | Limit (s) |
| ----------- | ----------------------------- | --------: | --------: | --------: | ---------: | --------: |
| PostToolUse | `src/lib/spool-validation.ts` |     3.655 |     3.717 |     3.641 |      3.655 |         5 |
| Stop        | `src/lib/spool-validation.ts` |     3.483 |     3.453 |     3.448 |      3.453 |         5 |
| PostToolUse | `src/lib/auth-middleware.ts`  |     3.662 |     3.609 |     3.583 |      3.609 |         5 |
| Stop        | `src/lib/auth-middleware.ts`  |     3.336 |     3.342 |     3.355 |      3.342 |         5 |
| Stop        | `README.md`                   |     0.050 |     0.049 |     0.050 |      0.050 |         1 |

These are fresh review measurements, separate from the historical and implementation measurements in `verification.md`. No universal latency guarantee or matched historical before/after comparison is implied.

### Caller state captured during the failing linked-worktree push

The following state belongs exclusively to an independent disposable clone. Its local bare destination remained unchanged. The original checkout stayed at `e2efc82` throughout the review.

| Field            | Before actual pre-push                                   | After rejected push                        |
| ---------------- | -------------------------------------------------------- | ------------------------------------------ |
| Caller HEAD      | `498e4aef0952873aa2522ea47d6c7e116c4fe8b9`               | `de3a28dcde0a109597a0b9cd4b3d54c22fb3d7a5` |
| Commit subject   | `docs(agent-hook-latency): complete manual verification` | `Proof baseline`                           |
| Index tree       | `6fdb6e65f0f3841cd7d5d41f737a7594eefb0d99`               | `2cc6316aca8fe2d2c051fae6074d798b11eab86e` |
| Local user.name  | `Review`                                                 | `Hook proof`                               |
| Local user.email | `review@example.invalid`                                 | `hooks-proof@example.invalid`              |

Reproduction sequence: create an independent local clone with `--no-hardlinks`; create a linked detached worktree; link the existing dependencies; run the tracked `npm run prepare` in that worktree; create a separate local bare destination; snapshot caller HEAD, `git write-tree`, local identity and status; run `git push <local-bare-path> HEAD:refs/heads/review-probe` from that worktree; compare snapshots. Do not reproduce in the developer checkout. The hook must remain the actual tracked pre-push invoking the real `verify:deploy`, rather than the controlled command fixture used in the existing proof.

## Scope and limitations

All implementation changes match the planned ownership boundaries. The shared timer helper and spool SDK GET test are explicitly permitted by the recorded scope clarification. No production application logic or package versions changed. Lessons were read; no accepted-rule violation was found. Existing unrelated uncommitted `.agents/skills/` updates were excluded from the review and preserved.

Remote CI and service-dependent database, browser and HTTP gates were not run or inferred from the local native gate. Manual row 3.6 has recorded author acceptance. The initial automatic-dispatch evidence gap in row 3.5 was addressed during triage as recorded in F2 and verification.md. No implementation or plan checkbox was changed. F1 remains an accepted workflow limitation; F2 and F3 are fixed. The original verdict and findings above describe the initial review; Decision fields record subsequent triage outcomes.

## Triage summary

- **Fixed**: F2 (live automatic Stop evidence), F3 (documentation corrections).
- **Accepted**: F1 (linked-worktree push scenario outside the author's intended workflow).
- **Pending**: none.
