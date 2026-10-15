---
date: 2026-10-15T19:59:54+02:00
researcher: Codex
git_commit: af2743c61cbc233bf86ecfe6e8d7a9ff08891745
branch: testing-mutation-and-session-contracts
repository: PrintPlan
topic: Mutation and session contract gaps in rollout Phase 2
tags: [research, testing, auth, mutations]
status: complete
last_updated: 2026-10-15
last_updated_by: Codex
---

# Research: Mutation and session contracts

## Research Question

Which missing regression signals for rollout risks #3, #4 and #5 justify new tests, and which existing checks should be retained?

## Summary

The inspected concurrency and actual-expiry flows already have useful HTTP coverage. Extend the existing native Node and restricted-role SQL suites for numeric edit boundaries, preservation of characters outside the explicit whitespace set, and session lookup outages. Exercise production middleware decisions with the installed SSR SDK and controlled provider HTTP responses; do not copy the middleware algorithm into tests.

## Detailed Findings

### Risk #3: competing writes

The agreed contract is an expected-version edit with a visible conflict for a stale writer ([print contract](../../archive/2026-10-12-personal-planned-prints/plan.md:29)). `src/lib/prints.ts:138` scopes the update by owner, ID and version; `:155` probes ownership after a zero-row result. Node tests at `scripts/print-contracts.test.mjs:409`, `:438`, `:464` cover predicates and failure translation. SQL at `supabase/tests/prints.test.sql:362` covers version increments and stale updates. The live race at `scripts/print-smoke.mjs:778` sends simultaneous requests, expects one winner and one conflict, rereads the winner and rejects a stale retry. Retain and rerun it rather than adding a mocked concurrency test.

### Risk #4: quantities and label meaning

The independent stock contract permits 1–2,147,483,647 g on creation and 0–2,147,483,647 g on edit; text preserves characters outside its explicit whitespace set ([stock contract](../../archive/2026-10-10-personal-filament-stock/plan.md:23), [text rules](../../archive/2026-10-10-personal-filament-stock/plan.md:33)). The print contract preserves combining marks without Unicode composition ([print text rules](../../archive/2026-10-12-personal-planned-prints/plan.md:38)).

`scripts/spool-contracts.test.mjs:254` checks invalid quantities in edit mode and uses a production constant as its maximum oracle. Strengthen the existing case with literal boundary expectations in both modes. Print numeric mode coverage already exists at `scripts/print-contracts.test.mjs:268`.

`supabase/tests/spools.test.sql:429` covers invalid numeric inserts, but the inspected suite lacks an owned invalid numeric update matrix. Add rejected updates for negative, fractional, over-limit and non-finite numeric values, then compare the complete unchanged row. Reread accepted zero and maximum updates. Run assertions as `authenticated`; privileged setup is not evidence of protection.

The inspected SQL suites contain ICU and supplementary-code-point examples but lack preserved U+200B, U+2060, U+180E and decomposed colour/name examples. Add independent literal fixtures in Node and SQL for both collections, including mixed normalized whitespace adjacent to a preserved character. Use byte-exact SQL comparisons so collation equality cannot conceal composition changes. No schema change is indicated by this research.

### Risk #5: session lookup, outage and recovery

The accepted outage contract distinguishes a retryable failure from missing/invalid identity and preserves usable cookies ([account contract](../../archive/2026-10-09-verified-account-access/plan.md:23)). `src/middleware.ts:27` calls `getUser`, classifies errors and chooses dashboard 503 versus sign-in redirect at `:50`; finalization at `:20` commits cookies and SDK headers.

Existing SDK tests at `scripts/auth-contracts.test.mjs:295` cover failed logout and successful refresh before failed logout, but the fixture at `:238` makes token refresh and user lookup succeed. Add `/user` outages with a valid session and `/token` outages with an actually expired session; prove no cookie deletion and recovery with a fresh request/client. Include invalid sessions, 429 precedence, successful refresh finalization, credential POST bypass and unexpected cause propagation as controls. A narrow factory extraction of the existing middleware body permits execution through the real application decision boundary without importing Astro runtime secrets into Node.

The real-expiry smoke at `scripts/smoke.mjs:792` records JWT expiry, revokes account B, waits until actual expiry plus allowance, verifies account A token rotation and repeated identity, then rejects B with cookie deletion. Preserve it. Installed auth-js can retain a valid token after failed proactive refresh (`node_modules/@supabase/auth-js/src/GoTrueClient.ts:3113`); expired fixtures must be safely in the past.

## Code References

- `src/middleware.ts:6`: request identity and finalization boundary.
- `src/lib/auth-cookies.ts:25`: staged cookie overlay/checkpoint contract.
- `src/lib/auth-errors.ts:18`: SDK error classification.
- `src/lib/supabase.ts:14`: SSR cookie/header adapter.
- `supabase/migrations/20261010000000_create_spools.sql:25`: integral stock constraints.
- `scripts/print-smoke.mjs:778`: real competing writes.
- `scripts/smoke.mjs:792`: actual-expiry refresh and revocation.

## Architecture Insights

Reuse the existing Node runner, pgTAP suites and built-preview smoke. Request-scoped client construction remains in the production adapter; extract only the existing middleware orchestration into a dependency-injected factory. Keep production authorization through `getUser`. No browser runner or dependency upgrade is needed.

## Historical Context

Phase 1's archived persistence tests remain useful and should run unchanged. The archived account outage check was manually confirmed ([verification](../../archive/2026-10-09-verified-account-access/verification.md:122)); this rollout adds deterministic boundary evidence rather than claiming that historical manual evidence was automated.

## Related Research

- [Phase 1 research](../../archive/2026-10-14-testing-data-isolation-and-persistence/research.md).

## Stack Grounding

Context7 CLI checked Node 24 test-context mocks and asynchronous rejection assertions against [Node test docs](https://nodejs.org/docs/latest-v24.x/api/test.html) and [assert docs](https://nodejs.org/docs/latest-v24.x/api/assert.html); checked: 2026-10-15. SSR cookie writes and lazy identity lookup were checked against [Supabase SSR](https://github.com/supabase/ssr/blob/main/src/createServerClient.ts); installed SDK behavior remains the test boundary. No browser/provider MCP was needed. Local Node is v24.21.0 and the existing Supabase containers are running. Runtime gates have not yet run.

## Open Questions

None affecting the implementation scope. No production defect was established. Research supports the existing risk wording and response guidance; no §2 backport is required. Controlled-fetch tests do not prove a real provider outage or browser recovery; those limits must remain explicit.
