---
date: 2026-10-18T13:34:59+02:00
researcher: Codex
git_commit: d2eddd9fdc262870107875ac3d3d7bdea32daf06
branch: settle-print-consumption
repository: settle-print-consumption
topic: "Measure the configured agent hooks and recommend reducing their turnaround time"
tags: [research, hooks, codex, performance]
status: complete
last_updated: 2026-10-18
last_updated_by: Codex
last_updated_note: "Checked whether the installed Supabase Auth client exposes an environment or client option for changing refresh retry backoff."
---

# Research: Measure the configured agent hooks and recommend reducing their turnaround time

**Date**: 2026-10-18T13:34:59+02:00
**Researcher**: Codex
**Git Commit**: d2eddd9fdc262870107875ac3d3d7bdea32daf06
**Branch**: settle-print-consumption
**Repository**: settle-print-consumption

## Research Question

One of the two configured hooks takes a long time. Measure what causes the delay and recommend making it faster or running it less often.

## Summary

- The configured `Stop` hook took 60.16 seconds in this checkout on 2026-10-18. At that time, Git reported 20 changed paths and the hook's code-file filter selected zero paths; it still ran the six native test files and Astro sync/check because the checkout had changes (`.codex/hooks/check-turn.mjs:21-42`; `.codex/hooks/shared.mjs:136-149`).
- A separate run of those six test files took 51.09 seconds. Two auth middleware refresh failure tests took 25.423 seconds each. The installed `@supabase/auth-js` 2.116.0 source retries failed refresh requests with exponential backoff inside a 30-second auto-refresh tick (`scripts/auth-contracts.test.mjs:436-485`; `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:4023-4041`; `node_modules/@supabase/auth-js/dist/main/lib/constants.js:6`).
- Astro sync took 1.24 seconds and Astro check took 7.56 seconds in separate runs. Together the measured test and Astro stages total 59.89 seconds, within 0.27 seconds of the 60.16-second full `Stop` run.
- `PostToolUse` took 3.61 seconds for a representative edit to `src/lib/settlements.ts`, but 54.46 seconds for `src/lib/auth-middleware.ts`, whose direct-import test is the full auth contract suite (`.codex/hooks/check-edits.mjs:35-45`; `.codex/hooks/shared.mjs:152-209`).

## Detailed Findings

### Configured hook paths

- `.codex/hooks.json:2-25` configures two Codex events: `PostToolUse` matching `^apply_patch$` and `Stop`.
- When an edit payload names an existing supported code file, `.codex/hooks/check-edits.mjs:35-45` runs ESLint for that file and then tests that directly import it. The test selection is defined in `.codex/hooks/shared.mjs:152-209`.
- When the session checkout has any changed path, `.codex/hooks/check-turn.mjs:21-42` filters changed paths for lint, then runs all `scripts/*.test.mjs` files, Astro sync, and Astro check. The hook skips a checkout only when `changedFiles()` returns an empty list; an empty filtered code list does not skip tests or Astro.
- For the measured checkout, `changedFiles()` returned 20 paths and `coveredFile()` accepted zero. The `Stop` hook therefore ran no ESLint command but did run all six native test files and both Astro commands. This includes documentation-only changes.

### Measured duration

Measurements ran on Node 24.21.0 in the current checkout on 2026-10-18. A direct invocation of `.codex/hooks/check-turn.mjs` with the current checkout as `cwd` completed in 60.16 seconds. The same six native test files, run separately with Node's spec reporter, took 51.09 seconds and reported 88 tests, 87 passed, 1 skipped, and 0 failed. In that run, `middleware refresh 503` took 25.423 seconds and `middleware refresh network` took 25.423 seconds (`scripts/auth-contracts.test.mjs:436-485`).

The fixture's fetch returns a 503 response or throws immediately for those refresh cases (`scripts/auth-contracts.test.mjs:272-282`). In the installed Auth SDK, HTTP 5xx responses become retryable fetch errors (`node_modules/@supabase/auth-js/dist/main/lib/fetch.js:29-53`); `_refreshAccessToken` retries with exponential backoff and stops when another retry would exceed the 30-second tick (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:4023-4041`; `node_modules/@supabase/auth-js/dist/main/lib/constants.js:6`). This matches the measured delay and identifies SDK retry backoff, rather than the fixture's fetch implementation, as the dominant cost of the two tests.

Separate runs of the exact Astro stages used by the hook took 1.24 seconds for `astro sync` and 7.56 seconds for `astro check`. The test and Astro measurements total 59.89 seconds; this is a cross-run comparison, not an instrumented split of the single 60.16-second hook invocation.

For `PostToolUse`, a synthetic `apply_patch` payload naming `src/lib/settlements.ts` completed in 3.61 seconds and selected `scripts/settlement-contracts.test.mjs`. A payload naming `src/lib/auth-middleware.ts` completed in 54.46 seconds and selected `scripts/auth-contracts.test.mjs`. These measurements show that per-edit latency depends on which source file was edited.

### Retry configuration in tests

In the installed `@supabase/auth-js` 2.116.0 package, the exposed `GoTrueClientOptions` types include `autoRefreshToken` but no retry delay, backoff, or retry-count option (`node_modules/@supabase/auth-js/dist/main/lib/types.d.ts:32-80`). The refresh retry interval and 30-second cutoff are hard-coded in `_refreshAccessToken` and `AUTO_REFRESH_TICK_DURATION_MS` (`node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:4023-4041`; `node_modules/@supabase/auth-js/dist/main/lib/constants.js:6`); those paths do not read an environment variable. `createServerClient` sets `autoRefreshToken: false` (`node_modules/@supabase/ssr/dist/main/createServerClient.js:32-42`), but the middleware still calls `supabase.auth.getUser()` (`src/lib/auth-middleware.ts:30-38`), which can synchronously refresh an expired session through `_refreshAccessToken`.

For fast tests, use the Node test runner's controlled timers around the retry cases, or use a fake auth client for the middleware response tests and reserve real SDK retry behavior for the slower suite. A custom test-only timer shim is possible but would affect unrelated timers in that process; it is less targeted than controlled timers. Setting a new environment variable alone will not change the SDK's delay.

### Recommendations

1. Remove the full native suite and Astro sync/check from the per-turn `Stop` hook. Keep a quick changed-file lint check there if useful. CI already runs the five product contract suites plus Astro sync, lint, Astro check, and build (`.github/workflows/ci.yml:19-27`); it does not currently run `test:hooks`, although `npm run verify:deploy` includes it (`package.json:25`) and the hook README records that CI gap (`.codex/hooks/README.md:84-88`). Add `npm run test:hooks` to CI if that proof must remain a required gate. If a local blocking gate is preferred, run `npm run verify:deploy` at pre-push rather than at the end of every agent turn.
2. As a low-risk first step, make `Stop` skip the heavy gates when no supported code files changed. This prevents documentation-only edits from starting the test suite and Astro, though code edits would still incur the full cost until recommendation 1 is applied.
3. Keep per-edit linting, but avoid launching the slow auth contract path after every edit to auth middleware. If fast local auth feedback is needed, split the middleware contract checks from tests that exercise the SDK's real retry backoff, or use controlled time in those retry tests. Keep the full retry behavior covered in CI.

## Code References

- `.codex/hooks.json:2-25` — the two configured Codex hooks and their event matcher.
- `.codex/hooks/check-edits.mjs:35-45` — per-edit lint and related-test execution.
- `.codex/hooks/check-turn.mjs:21-42` — end-of-turn changed-file lint, full native suite, Astro sync, and Astro check.
- `.codex/hooks/shared.mjs:136-149` — changed paths and native test-file selection.
- `.codex/hooks/shared.mjs:152-209` — per-edit direct-import test selection.
- `scripts/auth-contracts.test.mjs:436-485` — refresh failure tests that exercise the SDK.
- `scripts/auth-contracts.test.mjs:272-282` — immediate mock 503 and network failure responses.
- `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:4023-4041` — refresh retry backoff and retry-window condition in installed SDK 2.116.0.
- `node_modules/@supabase/auth-js/dist/main/lib/constants.js:6` — the 30-second auto-refresh tick used by the retry condition.
- `node_modules/@supabase/auth-js/dist/main/lib/types.d.ts:32-80` — exposed auth client options; no retry/backoff option is present in this range or elsewhere in the searched file.
- `node_modules/@supabase/ssr/dist/main/createServerClient.js:32-42` — server client disables automatic background refresh.
- `src/lib/auth-middleware.ts:30-38` — middleware still explicitly calls `getUser()`.
- `.github/workflows/ci.yml:19-27` — existing full CI verification stages.
- `.codex/hooks/README.md:65-72` — historical hook verification and baseline timings.

## Architecture Insights

The `Stop` hook gates all checks on whether the checkout has any changes, but only gates ESLint on whether a supported code file changed. The native tests and Astro checks therefore run on documentation-only edits. The per-edit hook uses direct import matching, which is more selective, but a direct match to auth middleware starts the retry-heavy auth contract file. Current CI covers the five product contract files and build checks; `test:hooks` is included in `verify:deploy` but omitted from the CI workflow.

## Historical Context (from prior changes)

`.codex/hooks/README.md:65-72` records a 7.3-second native-suite baseline and an 8.7-second Astro sync/check baseline from 2026-10-14. The 7.3-second figure is a historical measurement and does not describe this checkout's current 51.09-second suite run. The Astro baseline remains close to the current separate measurements, which total 8.80 seconds. The README's 13.3-second lint measurement was not independently re-measured in this investigation.

## Related Research

No related research artifacts were needed to answer this question.

## Open Questions

None for the measured hook behavior and recommendations. The preferred local-versus-CI boundary is a product decision if the recommendation is implemented.
