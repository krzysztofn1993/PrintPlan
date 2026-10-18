# PrintPlan agent hooks

Codex configuration: [../hooks.json](../hooks.json). Input gates:
[test plan](../../context/foundation/test-plan.md), [package scripts](../../package.json)
and [CI](../../.github/workflows/ci.yml).

The latest recorded ordinary-edit `PostToolUse` median is **3.655 s (about
3.6 s)**, measured during implementation review on 2026-10-18. The **10.667 s**
figure is a historical result from before the shared controlled-time helper.
Code-edit medians for both hooks range from 3.342 to 3.655 s;
documentation-only `Stop` has a median of 0.050 s. Each median uses three runs.
See the [latest measured results](../../context/archive/2026-10-18-agent-hook-latency/verification.md#latest-measured-results)
for the scenarios, limits and underlying evidence.

| Event                          | Checks                                                                                            | Timeout     |
| ------------------------------ | ------------------------------------------------------------------------------------------------- | ----------- |
| `PostToolUse`, `^apply_patch$` | ESLint on named existing code files; native tests that directly import them                       | 60 seconds  |
| `Stop`                         | Read-only ESLint on changed supported code files in the checkout and registered sibling worktrees | 120 seconds |

Both checks are read-only. Errors use stderr and exit 2. A successful `Stop`
prints `{}`. `stop_hook_active: true` allows completion after one correction
turn; unresolved failures remain part of normal verification. Documentation-only,
deleted-only, unsupported and malformed per-edit changes start no tool process.
`PostToolUse` selects tests through immediate imports, so it does not discover
transitive dependencies. The full native suite remains in the full gate.

The refresh-outage auth contracts and the installed-SDK spool connection
failure contract retain their real SDK paths. They use a shared, opt-in test
helper to control time and timers while scheduled retries run, keeping retry
behavior covered without wall-clock backoff. The helper is enabled only around
the operations that retry; lookup failures and successful refresh controls
remain part of the auth suite.

The commands resolve the checkout through Git. Scripts resolve relative patch
paths against payload `cwd`, accept multi-file and rename patches, and skip
files from unrelated repositories or escaping symlinks. Per-edit hooks register
checkouts by `session_id` under the shared Git directory, so `Stop` also checks
an edited sibling worktree. Session IDs are hashed; registrations are private
local state, not repository files. Stale project-directory variables are ignored.

Use installed local binaries; hooks do not download tools or start Supabase.
Missing tools, failed prerequisites and timeouts report failures. The `Stop`
internal deadline remains 110 seconds; the per-edit deadline remains 55 seconds.
Child checks remove `NODE_TEST_CONTEXT`, which otherwise can make an independent
`node --test` silently skip test files, and remove the real-tool opt-in flag to
prevent recursive worktree proofs.

## Full verification ownership

`npm run verify:deploy` is the full local native gate. It runs hook, auth, spool,
print and reservation contracts, Astro sync, lint, Astro check and the build.
The installed Husky pre-push hook runs this command once per push. `npm run
prepare` installs Husky's dispatchers under `.husky/_` for a checkout or linked
worktree; `npm ci` runs this lifecycle automatically. After cloning without
installing dependencies, run `npm install` or `npm run prepare` after dependencies
are available. The tracked `.husky/pre-commit` continues to run `npx lint-staged`
on staged files; full verification does not run at pre-commit.

CI's native job explicitly runs `npm run test:hooks` along with its product,
lint, type and build stages. The separate service-dependent job retains database
contracts, reservation concurrency, populated-migration checks, browser recovery
and HTTP smoke coverage. These service gates are not part of `verify:deploy` or
pre-push. The build needs `SUPABASE_URL` and `SUPABASE_KEY` from existing local
configuration or CI environment; missing prerequisites fail visibly.

Trust the project's `.codex/` configuration layer in Codex. Run `/hooks`, review
and trust both hook definitions, and confirm their sources and enabled status.
Restart or reload the session if the new project source is not listed. Changed
definitions require renewed trust. Script tests do not establish that an
untrusted hook is active in the running session.

## Repeat the proof

The native test [agent-hooks.test.mjs](../../scripts/agent-hooks.test.mjs) runs
via `npm run test:hooks`, both locally and in CI. Disposable repositories use
real Git and Node with stubbed ESLint and Astro tools. Push tests run Husky's
installer in a disposable repository and linked worktree, then push to a local
bare destination with a controlled `verify:deploy` fixture. They prove a failed
gate leaves the destination ref unchanged and a passing gate updates it; no
external remote is contacted.

The opt-in case uses real ESLint in a disposable detached worktree to verify
lint failures and repairs through both hooks. Run it separately:

```sh
PRINTPLAN_HOOKS_REAL_TOOLS=1 node --experimental-strip-types --test --test-name-pattern='real tools:' scripts/agent-hooks.test.mjs
```

The normal fast run skips that real-tool case. Execute it when changing hook
commands, dependencies or framework configuration. The initial protocol proof
also inverted the retry guard in a temporary copy: its test failed, then passed
after restoration. No deliberate errors were left in the developer checkout.

Historical evidence: on 2026-10-14, 15 fast protocol cases and the separate
real-tool case passed, and `npm run verify:deploy` passed. That report recorded
a 7.3-second native-suite baseline, 13.3-second lint, and 8.7-second Astro
sync/check. These are historical measurements from that date, not measurements
of the current change. The 2026-10-14 note that browser recovery was still
planned and that CI omitted hook tests describes the earlier rollout state;
CI now runs `test:hooks`, and browser recovery is covered by the separate
service-dependent workflow job. Current change-specific commands, samples and
outcomes are recorded in
[verification.md](../../context/archive/2026-10-18-agent-hook-latency/verification.md).

## Gate boundaries

Lint, types and native contracts cannot prove React hydration, actual routing,
database ownership policies or mutation side effects. Keep `supabase test db`
and built-preview `npm run smoke` with local Supabase and Mailpit, alongside the
browser recovery suite in CI. These remain service-dependent gates separate from
pre-push and `verify:deploy`.
