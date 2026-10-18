# Agent Hook Latency Implementation Plan

## Overview

Reduce the delay between an agent edit and the next useful action. Accelerate the two retry-heavy auth tests with controlled time, retain selective tests after edits, limit `Stop` to changed-file lint, and enforce full verification through CI and an automatic Git pre-push hook.

The author approved MEDIUM complexity, five solution decisions, and the three phases below on 2026-10-18. All three implementation phases are complete; results are recorded in [verification.md](verification.md).

## Current State Analysis

[Research](research.md) measured `Stop` at 60.16 s, the native suite at 51.09 s, Astro sync at 1.24 s and Astro check at 7.56 s. Two auth refresh-outage cases each took about 25.423 s because the installed SDK retries within its refresh window. These are historical measurements from the source checkout identified in research, not fresh measurements of this worktree.

`Stop` checks whether any path changed, then always runs native tests and Astro even if its code-file filter is empty. `PostToolUse` already selects tests by direct imports: an ordinary edit took 3.61 s in research, while an auth middleware edit took 54.46 s. The current hook proof suite explicitly expects full tests and Astro at `Stop`; those expectations must change with the contract.

`npm run verify:deploy` already includes hook tests, product contracts, lint, types and build. CI runs the product contracts, lint, types and build but omits `test:hooks`. Husky 9.1.7 and a staged-file pre-commit script exist, but there is no tracked pre-push script, no `prepare` script, and no configured `core.hooksPath` in this inspected checkout. Adding a pre-push file alone would therefore not establish automatic execution.

Dependencies were initially absent in this worktree; `npm ci` completed on Node 24.21.0 during planning. That repaired installation does not constitute a fresh test or timing result.

## Desired End State

- `PostToolUse` retains read-only ESLint on named supported code files and native tests selected by direct imports, including auth tests.
- `Stop` runs read-only ESLint on changed supported existing code files in the current checkout and registered sibling worktrees. Documentation-only and deleted-only changes launch no lint, native tests or Astro processes.
- The two refresh-outage tests still use the real installed Supabase SDK, real middleware and the existing provider-fetch fixture. They advance test-controlled time rather than waiting for retry backoff in real time.
- CI explicitly runs `test:hooks`, and Git pre-push automatically runs `npm run verify:deploy`. A failing full gate prevents a push. The existing database, browser and HTTP CI gates retain their ownership.
- In the benchmark scenarios defined below, each hook has a median of at most 5 s for a single ordinary code-file edit and for a single auth middleware edit. Documentation-only `Stop` has a median of at most 1 s. Each median uses three independent process invocations on the same environment.

### Key Discoveries:

- `.codex/hooks/check-turn.mjs:21` gates expensive work on any dirty path; `.codex/hooks/check-turn.mjs:33` starts the full native suite independently of the code-file filter.
- `.codex/hooks/check-edits.mjs:35` already bounds lint and selective tests under one deadline; `.codex/hooks/shared.mjs:152` owns the existing direct-import selector.
- `scripts/auth-contracts.test.mjs:436` contains both slow refresh failures and the lookup controls; `scripts/auth-contracts.test.mjs:247` creates the real SDK fixture.
- `.codex/hooks/shared.mjs:18` sanitizes child-runner flags, and `.codex/hooks/shared.mjs:108` collects registered sibling checkouts. Selective tests and worktree lint still require these contracts.
- `scripts/agent-hooks.test.mjs:242` through its subsequent Stop cases and opt-in real-tool proof encode the old test/type gate.
- `package.json:23` provides the existing full native gate; `.github/workflows/ci.yml:19` begins its individual product-test equivalents.
- `context/foundation/test-plan.md`, especially §6.3, requires real SDK middleware coverage at the provider-fetch boundary. Controlled time preserves that boundary.

## What We're NOT Doing

- Changing production authentication behavior, SDK retry policy, package versions, environment-variable handling or files under `node_modules`.
- Replacing the real SDK in the outage tests with a fake auth client, skipping auth cases, or creating a slower CI-only retry suite.
- Applying fake timers globally or changing unrelated tests. The existing installed-Supabase-SDK connection-failure contract may use a shared, opt-in controlled-time helper to keep its real GET retry path and assertions while removing wall-clock backoff waits.
- Removing selective tests from `PostToolUse`, changing its direct-import matching model, or adding transitive dependency analysis.
- Adding caches, watchers, background verification services or persistent timing telemetry.
- Putting full tests or Astro back into `Stop`, or moving full verification into pre-commit.
- Adding database, browser or smoke execution to pre-push or `verify:deploy`; those gates require their existing service setup and remain separate.
- Changing hook deadlines solely to match benchmark targets. The 5 s target describes normal representative performance, not a hard timeout for every patch or multi-worktree sweep.
- Refactoring application code, rewriting the test strategy, refreshing the product roadmap, committing, pushing or publishing during planning.

## Implementation Approach

First remove actual waiting from the existing auth contracts so the retained per-edit checks become useful for auth work. Then narrow `Stop` and update its proof tests together. Finally establish automatic full-gate ownership in CI and Git, and record measured outcomes and activation instructions.

Reuse the existing native Node runner, local tools, disposable repositories and hook proof fixtures. No dependency is needed. Keep `.codex/hooks/check-edits.mjs` and shared helper behavior unless a specific compatibility fix is required by the accepted contracts.

## Critical Implementation Details

### Timing and lifecycle

The SDK's retry cutoff reads `Date.now()` as well as waiting through `setTimeout`; control both through the individual test context. Start virtual time from a realistic current timestamp before constructing the fixture, advance through actual scheduled retries while allowing promise continuations to settle, and restore timers before the next test. A single large clock jump before a retry is scheduled can terminate the path without proving retries; a single synchronous `runAll()` does not establish completion of an asynchronous retry chain.

### Gate activation

Husky's installer sets `core.hooksPath` and creates dispatchers under `.husky/_`. A tracked `.husky/pre-push` plus an npm `prepare` lifecycle is required for installation in this project; use Husky 9 syntax without the deprecated `husky.sh` bootstrap. Keep installation and push-failure proofs inside disposable repositories so tests do not alter the developer checkout's Git configuration or contact a remote service.

## Phase 1: Accelerate Auth Retry Contracts

### Overview

Remove wall-clock retry waits from the two refresh-outage cases while retaining their middleware, cookie, privacy and fresh-request recovery assertions.

### Changes Required:

#### 1. Retry fixtures and controlled time

**File**: `scripts/auth-contracts.test.mjs`

**Intent**: Use the native test context's controlled clock and timers only for the refresh 503 and network cases. Bound virtual-time advancement so an unresolved promise or unexpected SDK loop fails clearly instead of hanging.

**Contract**: Both cases still execute the installed SDK retry path and retain all current response, cookie-preservation and successful-recovery assertions. Establish that more than one refresh attempt occurs before the unavailable result, and that timers are restored for the following tests. Keep lookup failures and successful refresh controls intact; do not assert an exact private SDK attempt count or weaken coverage to meet timing goals.

### Success Criteria:

#### Automated Verification:

- `npm run test:auth` passes with both refresh-outage cases enabled and their existing failure and recovery assertions retained.
- The refresh-outage cases prove repeated provider refresh attempts under controlled time, terminate within a bounded virtual-time driver, and leave the remaining auth tests unaffected by timer mocks.
- `node_modules/.bin/eslint scripts/auth-contracts.test.mjs` passes.

**Implementation Note**: This phase has no human-only gate; continue after its automated criteria pass. Record actual results during implementation rather than marking planning evidence as test execution.

---

## Phase 2: Limit Stop to Changed-File Lint

### Overview

Make `Stop` a lint safety net for shell edits and sibling worktrees, with no full-suite or Astro execution. Preserve selective lint and tests after `apply_patch`.

### Changes Required:

#### 1. End-of-turn checks and status

**Files**: `.codex/hooks/check-turn.mjs`, `.codex/hooks.json`

**Intent**: Remove native-suite, Astro sync and Astro check execution from `Stop`. Align its status message with changed-file lint and skip tool launches when no supported existing code paths remain.

**Contract**: Preserve checkout ownership, staged/unstaged/untracked discovery, registered sibling worktrees, subdirectory payload handling, the retry guard, successful `{}` output and stderr/exit-2 failures. Continue reporting missing ESLint and Git failures when applicable. Retain the configured 120 s Stop timeout and 110 s internal deadline; retain the per-edit 60 s timeout and 55 s deadline.

#### 2. Hook regression and real-tool proofs

**Files**: `scripts/agent-hooks.test.mjs`, `.codex/hooks/shared.mjs` (comment correction only)

**Intent**: Replace the old Stop test/type assertions with executable proof of the new boundary. Retarget the opt-in real-tool case to deliberate lint errors and repair through both hooks, including shell-written changes at Stop.

**Contract**: Prove dirty documentation-only and deleted-only checkouts launch no tools; lint-clean code succeeds even with a failing native fixture, missing Astro or absent native test files. Use a native fixture execution marker to prove tests were not started, since fake-tool logs observe only ESLint/Astro. Retain missing-linter failure, tracked/untracked lint, retry guard, paths with spaces, foreign repositories, sibling registration and JSON/output-channel assertions. Add an unrelated failing test to the selective per-edit fixture and prove it stays excluded while a failing directly importing test still blocks. Preserve child-runner environment sanitization and correct its outdated real-tool comment.

### Success Criteria:

#### Automated Verification:

- `npm run test:hooks` passes with the new lint-only Stop assertions and the retained per-edit, output, retry and worktree coverage.
- Dirty documentation-only and deleted-only fixtures launch no tools; lint-clean changed code launches ESLint without Astro or native-test execution, including a native execution-marker assertion.
- `PRINTPLAN_HOOKS_REAL_TOOLS=1 node --experimental-strip-types --test --test-name-pattern='real tools:' scripts/agent-hooks.test.mjs` detects deliberate lint errors through both hooks and accepts their repairs in a disposable worktree.
- `node_modules/.bin/eslint .codex/hooks/check-turn.mjs .codex/hooks/shared.mjs scripts/agent-hooks.test.mjs` passes.

**Implementation Note**: This phase has no human-only gate; continue after its automated criteria pass. Session trust and actual Codex activation are checked during final closeout.

---

## Phase 3: Enforce Full Gates and Record Latency

### Overview

Require full native verification before Git pushes and in CI, then verify representative hook latency and document the resulting gate ownership.

### Changes Required:

#### 1. CI coverage and installed pre-push

**Files**: `.github/workflows/ci.yml`, `.husky/pre-push` (new), `package.json`

**Intent**: Add `npm run test:hooks` to the existing native CI job. Configure pre-push to run the existing `npm run verify:deploy`, and add the npm `prepare` lifecycle that installs the existing Husky version's dispatchers.

**Contract**: Installation must activate `.husky/_` for a normal checkout and a linked worktree without replacing the tracked pre-commit script. Pre-push runs the full gate once per invocation and propagates failure to Git. Preserve `verify:deploy` contents, existing CI product/build stages, and the separate service-dependent job. Build credentials come from the existing local configuration or CI environment; missing prerequisites fail visibly rather than silently skipping verification.

#### 2. Pre-push regression proof

**File**: `scripts/agent-hooks.test.mjs`

**Intent**: Extend the existing hook suite with meaningful installation and push-blocking checks rather than testing only the presence of a shell file.

**Contract**: Use disposable repositories/worktrees and a local bare push destination. Exercise Husky installation with the tracked hook content, prove the pre-push dispatcher invokes `npm run verify:deploy` using a controlled command fixture, reject a failing invocation and allow a passing one. Confirm a rejected push leaves the destination ref unchanged and preserves the pre-commit entrypoint. Do not push this project or contact an external remote during the proof.

#### 3. Gate documentation and benchmark evidence

**Files**: `.codex/hooks/README.md`, `context/changes/agent-hook-latency/verification.md` (new)

**Intent**: Describe the new fast feedback and full verification boundaries, installation/reactivation steps, and actual measured outcomes. Correct the README's stale browser rollout and missing-CI claims while preserving historical measurement dates.

**Contract**: Document controlled-time auth coverage, direct-import limits, full gate ownership in CI/pre-push, existing pre-commit behavior, hook trust renewal, unchanged deadlines, build prerequisites and the current database/browser/HTTP gates. Record raw timing samples, medians, selected tests, environment/revision, command outcomes and remaining limitations. Clearly distinguish historical research numbers, new local evidence, and remote CI that has not been observed.

### Success Criteria:

#### Automated Verification:

- `npm run test:hooks` proves Husky installation and pre-push success/failure propagation against a disposable local bare destination, including unchanged destination refs after rejection.
- `npm run verify:deploy` passes on the pinned Node version with the existing build prerequisites configured.
- The three-run median is at most 5 s for each hook in each single-file benchmark scenario: ordinary code and auth middleware.
- The three-run median for documentation-only Stop is at most 1 s, with no ESLint, native-suite or Astro launches.

#### Manual Verification:

- After reviewing and trusting the changed hook definitions in Codex, a disposable-checkout edit and shell-written lint error produce visible feedback, repairs allow completion, and documentation-only completion has no heavy checks.
- The author reviews the recorded latency samples and gate ownership, including automatic pre-push, and accepts the result.

**Implementation Note**: After automated checks pass, pause for the author to complete the manual criteria. Do not mark trusted-session behavior, remote CI or author acceptance complete from script results alone.

## Testing Strategy

### Unit Tests:

Retain the auth suite's independent response/cookie assertions and successful recovery controls. Strengthen the two changed cases with evidence that SDK retries actually occurred. Controlled timers belong to those test contexts and must not change later tests.

### Integration Tests:

Reuse the hook suite's real Git/Node scripts with stubbed lint tools, add negative evidence for forbidden Stop subprocesses, and retain selective-test failures. Use the opt-in real-tool proof once after changing hook commands. Prove pre-push installation and Git's ref behavior using a disposable local bare destination; then run the real full gate once. Database, browser and HTTP suites are outside the changed contracts and retain their existing CI execution.

### Manual Testing Steps:

1. Review the final hook definitions and renew trust in the active Codex session according to the existing activation instructions.
2. In a disposable checkout, demonstrate lint feedback after an `apply_patch` edit and after a shell-written edit, then repair each error.
3. Complete a documentation-only turn and review the latency report and automatic pre-push behavior.

## Performance Considerations

Benchmark actual hook processes with a monotonic wall clock outside the controlled-time auth tests. Use one disposable checkout with real installed tools, one fixed session ID, no registered sibling worktrees and no unrelated dirty files. Reset the fixture between scenarios and time only hook execution, excluding checkout/setup/installation.

| Scenario      | Fixture                                                       | Processes sampled                                       | Acceptance                                       |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| Ordinary code | One lint-clean harmless edit to `src/lib/spool-validation.ts` | `PostToolUse` with that path; `Stop` with that checkout | Median of 3 runs per hook ≤5 s                   |
| Auth code     | One lint-clean harmless edit to `src/lib/auth-middleware.ts`  | `PostToolUse` selecting the complete auth suite; `Stop` | Median of 3 runs per hook ≤5 s                   |
| Documentation | Only a Markdown file changed                                  | `Stop`                                                  | Median of 3 runs ≤1 s and no check-tool launches |

Run the three samples sequentially without an unreported warm-up; record every value and compute the median separately for each hook/scenario. Keep Node, dependencies, host and invocation method the same across the reported new samples. Compare with research as historical context and explain its different source revision; do not claim a matched before/after experiment unless a same-environment baseline is actually captured. Do not encode machine-sensitive latency assertions into ordinary CI tests. If a threshold fails, investigate the cause within scope and keep the criterion pending rather than relaxing the accepted target.

Larger patches, hook-script edits that select their proof suite, and sweeps across multiple worktrees may take longer. They must retain correct failures and existing deadlines; the benchmark makes no universal 5 s promise for those cases.

## Migration Notes

There is no application or database migration. On implementation, existing checkouts activate the tracked Git hook through the new `prepare` command; subsequent normal dependency installations run the lifecycle. Verify installation in linked worktrees and document deliberate Husky opt-outs as bypasses, not enforcement guarantees. Changed Codex definitions require renewed trust.

Rollback restores the prior hook scripts/configuration and their tests together, removes the new pre-push entrypoint and `prepare` lifecycle if reverting this change, and restores the prior documented Git-hook configuration. Reverting controlled-time tests restores their slower real waits without changing production behavior. CI's additional hook test step may remain independently useful.

## References

- [Research](research.md) and [change identity](change.md).
- `.codex/hooks/check-turn.mjs:21`, `.codex/hooks/check-edits.mjs:35`, `.codex/hooks/shared.mjs:108` and `.codex/hooks/shared.mjs:152`.
- `scripts/auth-contracts.test.mjs:247` and `scripts/auth-contracts.test.mjs:436`.
- `scripts/agent-hooks.test.mjs:224` and `scripts/agent-hooks.test.mjs:339`.
- `package.json:23`, `.github/workflows/ci.yml:19`, `.husky/pre-commit:1` and `.codex/hooks/README.md`.
- `context/foundation/test-plan.md`, `context/foundation/test-stack.md` and `context/foundation/lessons.md`.
- [Node 24 test runner and MockTimers](https://nodejs.org/docs/latest-v24.x/api/test.html), retrieved through Context7 on 2026-10-18.
- [Husky 9.1.7 how-to](https://github.com/typicode/husky/blob/v9.1.7/docs/how-to.md) and installed `node_modules/husky/index.js`, inspected on 2026-10-18.

## Progress

> Convention: pending rows are unchecked; completed rows are checked. Append the closing commit SHA during implementation. Do not rename step titles.

### Phase 1: Accelerate Auth Retry Contracts

#### Automated

- [x] 1.1 `npm run test:auth` passes with both refresh-outage cases enabled and their existing failure and recovery assertions retained. — 1c77e2e
- [x] 1.2 The refresh-outage cases prove repeated provider refresh attempts under controlled time, terminate within a bounded virtual-time driver, and leave the remaining auth tests unaffected by timer mocks. — 1c77e2e
- [x] 1.3 `node_modules/.bin/eslint scripts/auth-contracts.test.mjs` passes. — 1c77e2e

### Phase 2: Limit Stop to Changed-File Lint

#### Automated

- [x] 2.1 `npm run test:hooks` passes with the new lint-only Stop assertions and the retained per-edit, output, retry and worktree coverage. — 337f26b
- [x] 2.2 Dirty documentation-only and deleted-only fixtures launch no tools; lint-clean changed code launches ESLint without Astro or native-test execution, including a native execution-marker assertion. — 337f26b
- [x] 2.3 `PRINTPLAN_HOOKS_REAL_TOOLS=1 node --experimental-strip-types --test --test-name-pattern='real tools:' scripts/agent-hooks.test.mjs` detects deliberate lint errors through both hooks and accepts their repairs in a disposable worktree. — 337f26b
- [x] 2.4 `node_modules/.bin/eslint .codex/hooks/check-turn.mjs .codex/hooks/shared.mjs scripts/agent-hooks.test.mjs` passes. — 337f26b

### Phase 3: Enforce Full Gates and Record Latency

#### Automated

- [x] 3.1 `npm run test:hooks` proves Husky installation and pre-push success/failure propagation against a disposable local bare destination, including unchanged destination refs after rejection. — 9e35a23
- [x] 3.2 `npm run verify:deploy` passes on the pinned Node version with the existing build prerequisites configured. — 9e35a23
- [x] 3.3 The three-run median is at most 5 s for each hook in each single-file benchmark scenario: ordinary code and auth middleware. — 9e35a23
- [x] 3.4 The three-run median for documentation-only Stop is at most 1 s, with no ESLint, native-suite or Astro launches. — 9e35a23

#### Manual

- [x] 3.5 After reviewing and trusting the changed hook definitions in Codex, a disposable-checkout edit and shell-written lint error produce visible feedback, repairs allow completion, and documentation-only completion has no heavy checks.
- [x] 3.6 The author reviews the recorded latency samples and gate ownership, including automatic pre-push, and accepts the result.
