# PrintPlan agent hooks

Codex configuration: [../hooks.json](../hooks.json). Input gates:
[test plan](../../context/foundation/test-plan.md), [package scripts](../../package.json)
and [CI](../../.github/workflows/ci.yml).

| Event                          | Checks                                                                           | Timeout     |
| ------------------------------ | -------------------------------------------------------------------------------- | ----------- |
| `PostToolUse`, `^apply_patch$` | ESLint on the patch's existing code files; directly importing native tests       | 60 seconds  |
| `Stop`                         | Changed and untracked code files; all `scripts/*.test.mjs`; Astro sync and check | 120 seconds |

Checks are read-only. Errors use stderr and exit 2. A successful `Stop` prints
`{}`. `stop_hook_active: true` allows completion after one correction turn;
unresolved failures still belong to the normal verification gate. Deleted or
unsupported files and invalid per-edit payloads are skipped. With no changes,
the stop hook runs no checks.

The commands resolve the checkout through Git. Scripts resolve relative patch
paths against payload `cwd`, accept multi-file and rename patches, and skip
files from unrelated repositories or escaping symlinks. Per-edit hooks register
checkouts by `session_id` under the shared Git directory, so `Stop` also checks
an edited sibling worktree. Session IDs are hashed; registrations are private
local state, not repository files. Stale project-directory variables are ignored.

Use installed local binaries; no hook downloads tools or starts Supabase.
Missing tools, failed prerequisites and timeouts report failures. The stop
hook has a 110-second internal deadline; per-edit checks have 55 seconds.
Only immediate imports select per-edit tests; the full stop suite protects
transitive dependencies. Child checks remove `NODE_TEST_CONTEXT`: inheriting it
from the proof runner otherwise makes an independent `node --test` silently
skip test files and exit successfully.
The real-tool opt-in flag is also removed from child checks, preventing the
proof suite from recursively creating real-tool worktrees after it is committed.

## Activate in Codex

Trust the project's `.codex/` configuration layer. Run `/hooks`, review and
trust both hook definitions, and confirm their sources and enabled status.
Restart or reload the session if the new project source is not listed.
Changed definitions require renewed trust. Configuration and script tests do
not establish that an untrusted hook is active in the running session.

Protocol checked against [official Codex hooks documentation](https://learn.chatgpt.com/docs/hooks)
on 2026-10-14; the skill's 2026-09-25 reference agrees on payload fields,
stderr/exit-2 feedback, JSON stop output, retry flag, seconds and trust.
This configuration is proved on Linux/Bash with Node 24.21.0. Windows command
launching was not configured or verified.

## Repeat the proof

The native test [agent-hooks.test.mjs](../../scripts/agent-hooks.test.mjs) runs
via `npm run test:hooks`, included in `npm run verify:deploy`. Fast cases use
throwaway Git repositories with real Git, Node and hook scripts; only ESLint
and Astro binaries are stubbed. They assert output channels, codes, path
selection, failed assertions, retry behavior, shell changes and worktrees.

The slower opt-in case uses real ESLint, Astro and the existing native suite
in a disposable detached worktree. Run it separately:

```sh
PRINTPLAN_HOOKS_REAL_TOOLS=1 node --experimental-strip-types --test --test-name-pattern='real tools:' scripts/agent-hooks.test.mjs
```

The normal fast run deliberately skips that real-tool case. Execute it when
changing commands, dependencies or framework configuration. The initial proof
also inverted the retry guard in a temporary copy: its test failed, then passed
after restoration. No deliberate errors were left in the developer checkout.

Verified on 2026-10-14: 15 fast protocol cases passed; the separate real-tool
case passed, including after the proof file entered Git history;
`npm run verify:deploy` passed. The baseline native suite took 7.3 seconds,
lint 13.3 seconds, and Astro sync/check 8.7 seconds. No existing Codex hook
config or orphan script was found; the course manifest identifies Codex.
There are no agent-loop deferral overrides. The browser gate marked
"planned, required after Phase 3" stays in that rollout phase.

## Gate boundaries

Lint, types and native contracts cannot prove React hydration, actual routing,
database ownership policies or mutation side effects. Retain `supabase test db`
and the built-preview `npm run smoke` with local Supabase/Mailpit. Browser form
recovery remains rollout Phase 3; this setup does not implement it.

Existing Husky/lint-staged configuration is unchanged. Recommended pre-commit:
keep staged-file lint/format and add appropriate fast tests when desired.
Recommended pre-push: `npm run verify:deploy`, then database tests and HTTP smoke
when the local service stack is available. No Git hook or CI job was added;
the existing individual CI test commands do not yet run `test:hooks`.

After activation, ask the agent to introduce and repair a lint error and then
a type error. Also verify a shell-written lint error triggers the stop hook.
Use a disposable checkout for these demonstrations.
