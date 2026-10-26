# Mutation and session contracts implementation plan

## Overview

Deliver rollout Phase 2 for risks #3, #4 and #5. Add missing quantity, Unicode and session-outage regression signals, retain the existing live concurrency/refresh/revocation checks, and record verified cookbook patterns.

The author approved MEDIUM complexity, zero additional substantive questions and one implementation phase on 2026-10-15, and requested implementation on a new branch. Research was delegated; implementation runs in the main context.

## Current State Analysis

[Research](research.md) identifies existing useful protection for versioned writes and real token expiry. Gaps are spool numeric edits, preserved non-whitespace/combining characters, and automated middleware session-outage routing/finalization. Native Node, pgTAP and local Supabase/Mailpit already exist. Node v24.21.0 matches `.nvmrc`.

## Desired End State

Invalid owned stock edits leave persisted records unchanged. Unicode fixtures retain their agreed meaning through application validation and database normalization. Session outages produce retryable responses and retain cookies; recovery succeeds on a fresh request. Existing concurrency and actual-expiry HTTP checks remain green. Cookbook and evidence distinguish controlled SDK tests from live runtime checks.

### Key Discoveries

- `scripts/print-smoke.mjs:778` already protects real same-version competing writes.
- `supabase/tests/spools.test.sql:429` tests invalid inserts but lacks the equivalent owned-update matrix.
- `scripts/auth-contracts.test.mjs:238` has an installed SSR SDK fixture whose user and refresh requests currently succeed.
- `src/middleware.ts:20` owns cookie/header finalization; tests must execute that decision path rather than recreate it.

## What We're NOT Doing

- Browser recovery rollout Phase 3, visual tests, reservation/settlement tests or the accepted skipped F1 overlap.
- New dependencies, schema changes, provider shutdown, deployment or hosted verification.
- Another mocked concurrency test, a new test runner, or replacing `getUser` authorization.

## Implementation Approach

Cost × signal: extend existing Node validation tests and restricted-owner SQL fixtures; use the installed SSR client with controlled HTTP only at its external provider boundary. Extract the existing middleware body into an alias-free factory with injected client construction and cookie parsing; production keeps its current adapter and behavior. Retain the full existing live smoke rather than adding another expensive flow.

## Critical Implementation Details

Session fixtures for refresh outages must be actually expired, because a failed proactive refresh can still use a valid access token. Recovery uses a new client with retained incoming cookies. Byte-exact SQL comparisons protect decomposed labels independently of collation equality. Do not log credentials or stop shared backend services.

## Phase 1: Complete mutation and session regression signals

### Overview

Ship the missing tests and verified cookbook as one reviewable unit.

### Changes Required

#### 1. Numeric and Unicode contracts

**Files:** `scripts/spool-contracts.test.mjs`, `scripts/print-contracts.test.mjs`, `supabase/tests/spools.test.sql`, `supabase/tests/prints.test.sql`.

**Intent:** Prove create/edit bounds using literal expected values, reject invalid stock edits without changing the row, and preserve characters outside the explicit whitespace set plus decomposed labels.

**Contract:** Stock create minimum 1, edit minimum 0, maximum 2147483647; reject -1, fractions, over-limit, NaN and infinities at the database boundary. Test U+200B/U+2060/U+180E preservation and decomposed e + U+0301 in colour and optional print names, including mixed whitespace. Independent oracle: archived stock contract §§Agreed product contract/Cross-layer labels and print contract Shared text semantics. Retain existing Unicode/multicolour and real conflict tests. Avoid production constants as the expected numeric oracle and privileged SQL protection assertions.

#### 2. Executable middleware boundary

**Files:** `src/middleware.ts`, `src/lib/auth-middleware.ts` (new), `scripts/auth-contracts.test.mjs`.

**Intent:** Exercise production session routing and finalization with installed SDK behavior rather than a test-only dispatcher. Move the existing body without changing its request lifecycle.

**Contract:** Factory injects existing client construction and cookie parsing; type-only Astro/Supabase references do not load runtime secrets in Node. Test valid-session user lookup outages, expired refresh outages, fresh-request recovery, missing/invalid identity redirect, successful refresh cookies/cache headers, 429 retryability, credential POST bypass, public/API continuation with outage locals, and unexpected cause propagation. Cover returned and thrown error paths. Preserve one client per request, request-local cookie state, early-response finalization and current exception diagnostics. Independent oracle: archived account Desired End State and current rollout risk #5. Avoid mocking cookie/classification internals or copying middleware logic into tests.

#### 3. Cookbook and verification

**Files:** `context/foundation/test-plan.md` §3/§6, `context/changes/testing-mutation-and-session-contracts/verification.md` (new).

**Intent:** Record patterns actually shipped and exact verification limits. Keep rollout status implementing until manual closeout; leave Phase 3 pending.

**Contract:** Explain literal oracles, restricted SQL update/reread assertions, injected provider boundary, actual middleware execution and reuse of live race/expiry checks. Record commands, outcomes and deliberate-break restoration. Do not rewrite frozen risk/strategy sections or claim remote CI, browser recovery or provider-down verification.

### Success Criteria

#### Automated Verification

- Native contracts and repository checks pass: `npm run verify:deploy`.
- Restricted-role database contracts pass: `npx supabase test db`.
- Existing populated upgrade remains green: `npm run test:migrations`.
- Built-preview HTTP smoke passes with local Supabase/Mailpit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.
- Deliberate production regressions make new middleware and numeric/Unicode checks fail; restore the staged production bytes unconditionally and record the result.
- Cookbook §6.3 and Phase 2 notes document shipped patterns; verification records actual results and limits.

#### Manual Verification

- Review the new tests, cookbook and verification evidence and confirm rollout Phase 2 closeout; no browser acceptance is claimed by this phase.

## Testing Strategy

Node tests assert independently chosen gram and character examples through public validation boundaries and the actual middleware factory. SQL executes writes as authenticated owners, verifies error contracts and compares unchanged full rows. Live smoke covers true concurrent writes and expiry/revocation; do not replace it with status-only mocks. Deliberate breaks confirm the new checks detect meaningful regressions.

## Performance Considerations

No new production requests or dependencies. Controlled SDK retries remain bounded by test timeouts. Live smoke retains the existing actual-expiry wait and deadline.

## Migration Notes

No migration, reset or shared backend shutdown. Reuse running local Supabase and existing ignored configuration. Stop only the preview process started for this work. Manual closeout and commit approval remain pending until confirmed by the author.

## References

- [Research](research.md), [brief](plan-brief.md), [rollout](../../foundation/test-plan.md).
- [Stock contract](../../archive/2026-10-10-personal-filament-stock/plan.md:23), [print text contract](../../archive/2026-10-12-personal-planned-prints/plan.md:38), [account contract](../../archive/2026-10-09-verified-account-access/plan.md:23).
- `src/middleware.ts:6`, `src/lib/auth-cookies.ts:25`, `scripts/print-smoke.mjs:778`, `scripts/smoke.mjs:792`.

## Progress

### Phase 1: Complete mutation and session regression signals

#### Automated

- [x] 1.1 Native contracts and repository checks pass: `npm run verify:deploy`. — c429b9d
- [x] 1.2 Restricted-role database contracts pass: `npx supabase test db`. — c429b9d
- [x] 1.3 Existing populated upgrade remains green: `npm run test:migrations`. — c429b9d
- [x] 1.4 Built-preview HTTP smoke passes with local Supabase/Mailpit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`. — c429b9d
- [x] 1.5 Deliberate production regressions make new middleware and numeric/Unicode checks fail; restore the staged production bytes unconditionally and record the result. — c429b9d
- [x] 1.6 Cookbook §6.3 and Phase 2 notes document shipped patterns; verification records actual results and limits. — c429b9d

#### Manual

- [x] 1.7 Review the new tests, cookbook and verification evidence and confirm rollout Phase 2 closeout; no browser acceptance is claimed by this phase. — c429b9d
