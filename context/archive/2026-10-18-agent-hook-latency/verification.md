# Agent Hook Latency Verification

## Latest measured results

The latest recorded benchmark is the implementation review on 2026-10-18 at
`e2efc82`, using Node v24.21.0 on Linux x64. Ordinary-edit `PostToolUse` has a
three-run median of **3.655 s (about 3.6 s)**. The **10.667 s** result below is
a historical measurement taken before the shared controlled-time helper.

| Hook          | Single-file scenario                        | Latest three-run median (s) | Limit (s) |
| ------------- | ------------------------------------------- | --------------------------: | --------: |
| `PostToolUse` | Ordinary `src/lib/spool-validation.ts` edit |                       3.655 |         5 |
| `Stop`        | Ordinary `src/lib/spool-validation.ts` edit |                       3.453 |         5 |
| `PostToolUse` | Auth `src/lib/auth-middleware.ts` edit      |                       3.609 |         5 |
| `Stop`        | Auth `src/lib/auth-middleware.ts` edit      |                       3.342 |         5 |
| `Stop`        | Documentation-only `README.md` edit         |                       0.050 |         1 |

All five scenarios meet their limits. Raw samples and the measurement method
are recorded in the [review latency samples](reviews/impl-review.md#review-latency-samples).
These results describe the measured fixtures, not a universal hook deadline.

## Historical measurements before the shared timer helper

**Environment:** Node v24.21.0, Linux x64; disposable local Git clone with real installed dependencies linked from the implementation checkout. The clone was at `337f26b` (Phase 2); the hook source under measurement matched that revision. One fixed session ID was used, no sibling worktrees were registered, and each sample began after resetting every tracked fixture change. The hook process was timed with the Node monotonic `performance.now()` clock; setup and fixture resets were outside each timing window. There was no warm-up. The ordinary and auth PostToolUse hooks used real ESLint and their selected native test suites. Build prerequisites were available in the implementation environment; credential values are not recorded.

### Hook timings

All values are seconds. Each row records three separate hook process invocations, followed by their median.

| Hook          | Single-file scenario                        |  Run 1 |  Run 2 |  Run 3 | Median | Limit | Verdict |
| ------------- | ------------------------------------------- | -----: | -----: | -----: | -----: | ----: | ------- |
| `PostToolUse` | Ordinary `src/lib/spool-validation.ts` edit | 10.667 | 10.611 | 10.689 | 10.667 |   ≤ 5 | FAIL    |
| `Stop`        | Ordinary `src/lib/spool-validation.ts` edit |  3.561 |  3.395 |  3.403 |  3.403 |   ≤ 5 | PASS    |
| `PostToolUse` | Auth `src/lib/auth-middleware.ts` edit      |  3.569 |  3.596 |  3.622 |  3.596 |   ≤ 5 | PASS    |
| `Stop`        | Auth `src/lib/auth-middleware.ts` edit      |  3.320 |  3.345 |  3.299 |  3.320 |   ≤ 5 | PASS    |
| `Stop`        | Documentation-only `README.md` edit         |  0.057 |  0.053 |  0.054 |  0.054 |   ≤ 1 | PASS    |

Ordinary `PostToolUse` selected `scripts/spool-contracts.test.mjs` through direct-import matching. Auth `PostToolUse` selected `scripts/auth-contracts.test.mjs`. The spool suite includes the retained installed-Supabase-SDK connection-failure contract. In a focused run on the same disposable checkout, `node --experimental-strip-types --test --test-name-pattern='installed SDK connection failures' scripts/spool-contracts.test.mjs` took 7.167 seconds end to end (the test itself reported 7.046 seconds); it took about 7.04 seconds in the full gate as well. Before the shared helper, this test's wall-clock retry waits made ordinary `PostToolUse` exceed its five-second target. The author then approved a narrow scope clarification allowing this test to use the shared opt-in controlled-time helper while retaining the real SDK, retry path and existing assertions.

For documentation-only `Stop`, the hook found no supported existing code files and skipped `runLocal`; it launched no ESLint, native test, or Astro process. `npm run test:hooks` also passed its documentation/deleted-only no-tool assertion and native execution-marker proof.

A preliminary valid ordinary `PostToolUse` set measured 10.691, 10.720, and 10.558 seconds (median 10.691), confirming the pre-fix failure. An initial fixture pass carried an ordinary source edit into later `Stop` scenarios; those later values were discarded and excluded. No threshold was relaxed.

## Final remeasurement with the shared timer helper

**Environment and method:** Node v24.21.0, Linux x64; disposable local clone based on the Phase 2 commit with the staged Phase 3 changes applied and committed only inside the disposable clone. It used the implementation checkout's real installed dependencies through a local symlink. One fixed session ID was used with no sibling worktrees registered. Each fixture was reset before each invocation; source edits existed only in the disposable clone. There was no warm-up. The hook process was timed with Node's monotonic `performance.now()` clock; edit, reset and checkout setup were outside each timing window. PostToolUse used real ESLint and the selected native suite. Stop used real ESLint for code edits and no check-tool launch for documentation-only edits.

All values are seconds. Each row contains three sequential independent hook process invocations and their median.

| Hook          | Single-file scenario                        | Run 1 | Run 2 | Run 3 | Median | Limit | Verdict |
| ------------- | ------------------------------------------- | ----: | ----: | ----: | -----: | ----: | ------- |
| `PostToolUse` | Ordinary `src/lib/spool-validation.ts` edit | 3.665 | 3.574 | 3.616 |  3.616 |   ≤ 5 | PASS    |
| `Stop`        | Ordinary `src/lib/spool-validation.ts` edit | 3.396 | 3.394 | 3.391 |  3.394 |   ≤ 5 | PASS    |
| `PostToolUse` | Auth `src/lib/auth-middleware.ts` edit      | 3.598 | 3.572 | 3.551 |  3.572 |   ≤ 5 | PASS    |
| `Stop`        | Auth `src/lib/auth-middleware.ts` edit      | 3.408 | 3.308 | 3.333 |  3.333 |   ≤ 5 | PASS    |
| `Stop`        | Documentation-only `README.md` edit         | 0.051 | 0.053 | 0.049 |  0.051 |   ≤ 1 | PASS    |

The ordinary `PostToolUse` median fell from 10.667 s to 3.616 s, a 66.1% reduction under the same Node version, host and single-file scenario. The final focused spool SDK failure test reports about 0.04 s while asserting that the installed SDK retries the failed GET more than once. A deliberate temporary `.retry(false)` change in the production spool query made this retry assertion fail; the change was restored immediately, and the focused suite passed after restoration. The same temporary break was reported by the edit hook with exit 2. The test still uses the installed Supabase client, and its response, privacy, transport-status and recovery assertions remain intact.

### Automated gate outcomes

| Command / criterion                                               | Outcome | Evidence                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 1 `npm run test:auth`                                       | PASS    | 22 passed, 0 failed; refresh outage cases completed under controlled time with repeated real SDK refresh calls.                                                                      |
| Phase 1 focused ESLint                                            | PASS    | `node_modules/.bin/eslint scripts/auth-contracts.test.mjs`.                                                                                                                          |
| Phase 2 `npm run test:hooks`                                      | PASS    | 15 passed, 0 failed; opt-in test skipped in this invocation.                                                                                                                         |
| Phase 2 real-tool opt-in                                          | PASS    | Deliberate lint errors failed through both hooks; repairs passed in a disposable worktree.                                                                                           |
| Phase 2 focused ESLint                                            | PASS    | Hook scripts, shared helper, and hook tests linted cleanly.                                                                                                                          |
| Phase 2 `npm run verify:deploy`                                   | PASS    | All native suites, Astro sync, lint, Astro check and build passed.                                                                                                                   |
| Phase 3 `npm run test:hooks`                                      | PASS    | 16 passed, 0 failed; one opt-in real-tool case skipped. Disposable Husky installs, linked worktree, local bare push, failure propagation and unchanged destination ref passed.       |
| Phase 3 `npm run verify:deploy`                                   | PASS    | Node v24.21.0; hook, auth, spool, print and reservation suites, Astro sync, lint, Astro check (0 errors, 0 warnings, 1 hint), and build passed.                                      |
| Phase 3 deliberate-break check                                    | PASS    | Temporarily disabled retries on the production spool GET; the SDK retry assertion and edit hook failed. Restored `src/lib/spools.ts` from the staged version, then the suite passed. |
| Phase 3 `npm run test:auth`                                       | PASS    | 22 passed, 0 failed; shared timer helper retained repeated real SDK refresh calls.                                                                                                   |
| Phase 3 `npm run test:spools`                                     | PASS    | 15 passed, 0 failed; SDK connection failure test completed in about 0.04 s and confirmed retries.                                                                                    |
| Phase 3 focused ESLint                                            | PASS    | Shared timer helper and auth/spool test files.                                                                                                                                       |
| Ordinary `PostToolUse` three-run median ≤ 5 s                     | PASS    | Median 3.616 s; raw final samples above.                                                                                                                                             |
| Ordinary `Stop` three-run median ≤ 5 s                            | PASS    | Median 3.394 s.                                                                                                                                                                      |
| Auth middleware `PostToolUse` three-run median ≤ 5 s              | PASS    | Median 3.572 s.                                                                                                                                                                      |
| Auth middleware `Stop` three-run median ≤ 5 s                     | PASS    | Median 3.333 s.                                                                                                                                                                      |
| Documentation-only `Stop` three-run median ≤ 1 s, no heavy checks | PASS    | Median 0.051 s; no ESLint, native suite or Astro launch.                                                                                                                             |

### Manual and remote outcomes

- The author reported that the hook configuration appears accepted in Codex.
  Manual row 3.5 was exercised again on 2026-10-18 in a fresh detached worktree
  at `f60c608`, with the installed dependencies linked from the implementation
  checkout. An actual `apply_patch` tool edit added invalid TypeScript; the
  active `PostToolUse` hook automatically reported the ESLint parser error and
  selected spool-test failure. Removing the line through `apply_patch` passed.
  A shell-written syntax error produced exit 2 through the configured `Stop`
  command wrapper; restoring the source made the same wrapper return `{}`. A
  README-only edit made the configured `Stop` wrapper return `{}` in 0.052 s
  with no stderr. The `Stop` script skipped its check runner because the only
  changed path was Markdown. The hook suite separately proved documentation-only
  and deleted-only changes launch no tools and that a native execution marker
  stays absent. The detached worktree was removed after the check.
- The author accepted the initial measurements, explicitly approved the narrow
  shared timer-helper scope clarification, and accepted Manual row 3.6 after
  reviewing the final measurements and gate ownership. Both Manual rows are
  checked in the plan's canonical Progress section.
- Remote CI: not observed. Local workflow changes and passing local gates do not
  establish a remote CI result.

### Automatic Stop observation during implementation review

On 2026-10-18, the author requested a live automatic-dispatch check and then
approved recording the observed behavior as working. A disposable detached
worktree at `e2efc82` was registered for the active session. A shell command
created `scripts/stop-live-proof.mjs` containing a deliberate syntax error.
Neither the Stop command nor its configured wrapper was invoked manually.

At `2026-10-18T14:15:16.108Z`, the automatic Stop process launched real ESLint
for that fixture. A temporary launcher recorded its parent as
`node /root/work/agent-hook-latency/.codex/hooks/check-turn.mjs` and its arguments
as `--quiet --no-warn-ignored -- scripts/stop-live-proof.mjs`. ESLint exited 1
at `14:15:16.957Z`, reporting `Parsing error: Expression expected` at 1:29.
Codex delivered a Stop hook prompt with run ID
`stop:1:/root/work/PrintPlan/.codex/hooks.json`, reported the failure and resumed
the agent. This establishes actual automatic dispatch and visible failure
feedback in the active session.

The agent repaired the fixture and verified it with real ESLint (exit 0), then
removed the disposable worktree, its session registration and its observer.
The observer independently recorded the automatic invocation. The original
checkout stayed at `e2efc82`. The repair lint was an explicit verification;
the continuation's Stop retry guard is not a separate successful lint run.
No new automatic documentation-only run was claimed; its existing command
proof, no-tool regression coverage and timing samples remain recorded above.

## Historical research evidence

These values come from the research checkout on 2026-10-18, Node 24.21.0. They are historical pre-change measurements, not a matched local before/after experiment.

| Measurement                                              | Historical result |
| -------------------------------------------------------- | ----------------: |
| `Stop` with 20 dirty paths and zero supported code paths |           60.16 s |
| Six native test files                                    |           51.09 s |
| Auth middleware refresh 503 case                         |          25.423 s |
| Auth middleware refresh network case                     |          25.423 s |
| `astro sync`                                             |            1.24 s |
| `astro check`                                            |            7.56 s |
| Ordinary `PostToolUse` edit to `src/lib/settlements.ts`  |            3.61 s |
| Auth `PostToolUse` edit to `src/lib/auth-middleware.ts`  |           54.46 s |

The native and Astro durations were separate runs; their 59.89-second sum is a cross-run comparison, not an instrumented split of the 60.16-second `Stop` invocation. The prior ordinary-edit measurement used `src/lib/settlements.ts`; the new accepted scenario uses `src/lib/spool-validation.ts`, so the figures are not directly comparable.

## Scope and limitations

`npm run verify:deploy` covers hook, auth, spool, print and reservation contracts, Astro sync, lint, Astro check and build. Database, browser and HTTP smoke checks remain service-dependent gates outside `verify:deploy` and pre-push. The pre-push proof used a disposable repository and local bare destination; it did not run this project's push hook or contact an external remote.
