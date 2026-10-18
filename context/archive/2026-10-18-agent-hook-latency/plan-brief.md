# Agent Hook Latency — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Shorten the pauses after agent edits and at turn completion. Keep useful checks close to edits and enforce the full verification gate in CI and automatically before a Git push.

## Starting Point

Research measured Stop at 60.16 s, including a 51.09 s native suite dominated by two auth retry tests. Stop runs tests and Astro even for documentation changes; per-edit checks already select related tests, but an auth edit took 54.46 s. These are historical source-checkout measurements, not new results from this worktree.

The full local gate exists. CI omits hook tests, and the inspected checkout has no pre-push, npm prepare lifecycle or active Husky hooks path.

## Desired End State

Edits receive lint and related-test feedback without real waiting for auth retry backoff. Turn completion checks changed code with lint; documentation-only turns launch no check tools. Full tests, types and build run automatically before pushes and in CI.

## Key Decisions Made

| Decision            | Choice                                                                                                   | Why                                                                                  | Source             |
| ------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Stop                | Changed-file lint only, including registered worktrees                                                   | Removes repeated full-suite and Astro cost while catching shell-written lint errors. | Plan Q1            |
| PostToolUse         | Keep lint and direct-import tests, including auth                                                        | Preserves behavioral feedback after edits.                                           | Plan Q2            |
| Full gate           | Add hook tests to CI; automatic pre-push runs verify:deploy                                              | Retains full verification outside each edit/turn.                                    | Plan Q3            |
| Auth retry coverage | Control test time; retain real SDK and current assertions                                                | Removes real waits without replacing the integration boundary.                       | Research + Plan Q4 |
| Latency             | Three-run median ≤5 s per hook for each ordinary/auth single-file scenario; documentation-only Stop ≤1 s | Makes improvement measurable for a defined environment.                              | Plan Q5            |

## Scope

**In scope:**

- Controlled-time refresh-outage contracts; lighter Stop and updated hook proofs.
- CI hook-test coverage, Husky prepare/pre-push installation and push-blocking proof.
- Gate documentation, activation instructions and recorded timing samples.

**Out of scope:**

- Production auth/SDK changes, skipped auth cases, new dependencies and retry configuration.
- Transitive test selection, caching, background services and hard 5 s hook timeouts.
- Database/browser/smoke checks in pre-push, application changes and product-roadmap edits.

## Architecture / Approach

Use the existing Node runner and hook utilities. PostToolUse retains selective tests, with the auth tests advancing a scoped virtual clock. Stop retains changed-file lint and worktree handling. The existing verify:deploy remains the full local gate, invoked by installed pre-push; CI adds its missing hook-test step. Preserve the existing separate database, browser and HTTP CI gates.

## Phases at a Glance

| Phase                      | What it delivers                                        | Key risk                                                                  |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Auth contracts          | Real SDK retries without wall-clock backoff             | Clock advancement must exercise retries and restore timer state.          |
| 2. Stop                    | Lint-only turn completion and revised executable proofs | Preserve output, retry, shell-edit and sibling-worktree contracts.        |
| 3. Full gates and evidence | CI, installed pre-push, documentation and timing report | A hook file alone does not activate Husky; proof must cover installation. |

**Prerequisites:** Node 24.21.0, installed dependencies, Git and existing build configuration; disposable repositories for proofs. npm ci completed during planning. Codex trust renewal is required for final session acceptance.
**Estimated effort:** Approximately 1–2 focused implementation sessions across three phases, plus author closeout; an estimate, not a measured duration.

## Open Risks & Assumptions

- Async retry chains require timer advancement interleaved with promise continuations; virtual time must not bypass retry coverage.
- Latency targets apply to the specified single-file scenarios on one environment. Large patches, hook-suite edits and multiple worktrees can take longer; existing timeout/deadline values stay unchanged.
- Pre-push needs local build prerequisites and adds full-gate latency to pushes. Git/Husky bypasses remain possible; CI retains independent verification.
- Historical timing comes from another source revision. Record new raw samples and medians without claiming an unmeasured matched baseline or remote CI pass.

## Success Criteria (Summary)

- Every single-file ordinary/auth benchmark has a three-run median ≤5 s per hook; documentation-only Stop has a median ≤1 s and starts no check tools.
- Auth, hook and full verification gates pass; real SDK failure/recovery and hook/worktree contracts remain covered.
- CI includes hook tests, installed pre-push rejects a failed full gate, and the author accepts trusted-session behavior and recorded timings.

## References

- [Full plan](plan.md), [research](research.md), [test plan](../../foundation/test-plan.md).
- [Node 24 MockTimers](https://nodejs.org/docs/latest-v24.x/api/test.html), [Husky 9.1.7](https://github.com/typicode/husky/blob/v9.1.7/docs/how-to.md); checked through Context7 on 2026-10-18.
