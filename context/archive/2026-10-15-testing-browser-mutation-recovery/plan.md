# Browser Mutation Recovery Implementation Plan

## Overview

Deliver rollout Phase 3 of `context/foundation/test-plan.md`, protecting risk #6:
failed, conflicting or uncertain operations must preserve entered data and prevent
unsafe repeat writes according to the existing stock and planned-print contracts.
Add focused browser integration against a production build and local Supabase,
then connect the suite to CI and document its reusable patterns.

The author approved one implementation phase with four work steps on 2026-10-15:
browser infrastructure, stock recovery, print recovery, and CI/documentation with
verification. The author explicitly requested saving this plan without starting
implementation. Approval of this document does not authorize starting that work.

## Current State Analysis

The repository has native Node contracts, restricted-role SQL tests, a populated
migration check and production-preview HTTP smoke. These protect server behavior
but do not execute the hydrated forms' controlled fields, focus, confirmation
dialogs or collection transitions. Playwright is not yet configured.

Stock preserves an uncertain error through field edits, blocks resubmission from
the active form and offers navigation to a fresh SSR read. Prints additionally
keep a collection-level guard through cancel/reopen and failed refreshes; a
successful fresh read clears it, and refresh actions ask before discarding drafts.
The plan preserves these differences rather than extending either product contract.

### Key Discoveries

- `src/components/spools/SpoolForm.tsx:113` preserves uncertainty through edits;
  `:129` guards submission; `:303` provides stock refresh navigation.
- `src/components/spools/SpoolInventory.tsx:49` coordinates pending writes, and
  `:119` owns a separate deletion failure path.
- `src/components/prints/PrintForm.tsx:202` retains a stale draft after 409;
  `:226` asks consent before reading the latest print.
- `src/components/prints/PrintList.tsx:207` preserves forms and the collection
  guard after failed reads, while `:220` installs validated fresh data.
- The accepted generic-retry consent fix is at `PrintList.tsx:374`. Its independent
  oracle is archived planned-print review F2; archived F1 remains explicitly skipped.
- Local auth access tokens expire after 120 seconds according to
  `supabase/config.toml`; independent contexts must not rely indefinitely on the
  same saved refresh-token copy.
- `.github/workflows/ci.yml` already owns a local Supabase/Mailpit smoke job.
  Add the browser gate there while keeping the existing integration checks.

## Desired End State

`npm run test:e2e` starts its own built preview and runs focused Chromium recovery
tests with real local authentication and persistence. Assertions prove retained
fields, associated error feedback, consent before discard, pending coordination,
and recovery after committed operations whose acknowledgements cannot be trusted.
Failed cleanup fails the run, and browser failure diagnostics remain ignored.

The existing local-stack CI job runs this command as a required step. The cookbook
explains the shipped patterns and their limits. Verification records actual local
results and deliberate regressions that the tests detected. Completion requires
the author's final review; saving this plan marks no implementation item complete.

## What We're NOT Doing

- Production behavior changes, schema migrations, reservations or settlement.
- Visual snapshots, pixel comparisons, AI vision or exact appearance assertions.
- Replacing the cheaper native, SQL, persistence or HTTP checks already shipped.
- Reopening accepted print F1: submitting a form during an already-running list
  refresh. Pending tests start with a write; recovery reads follow settled writes.
- Adding print-style discard confirmation or a persistent collection guard to stock.
- Resetting the populated local database, changing hosted data, deploying, or
  treating local runs as proof of remote CI execution or provider outages.
- Editing test-plan §2 during this save. Its research correction was a separate
  approval question; the accepted implementation scope follows the grounded
  stock/print distinction without requiring that backport.

## Implementation Approach

Use one implementation phase with four ordered work steps. Establish the runner
and a small real-auth fixture first; implement the stock and print scenarios next;
then wire the browser gate, record outcomes and fill the cookbook. Delegate bounded
test authoring when useful, keeping verification, lifecycle state and review with
the primary agent. Do not start any of these steps until the author requests it.

Use the cheapest test giving signal for each risk. Browser tests assert rendered
behavior absent from the existing suites. Derive expected values from archived
accepted contracts, including the 90 g winner versus 100 g stale draft, rather than
importing production normalization or state helpers as test oracles.

## Critical Implementation Details

### Timing and lifecycle

Playwright must own its preview lifecycle and build the tested revision. Refuse
silent reuse of a listener on the selected port. Open a collection form through
its visible action and wait for the resulting interactive state before filling it;
typing into SSR markup before hydration can lose inputs.

### State sequencing

For committed-but-unconfirmed cases, forward exactly one real mutation, verify its
successful server result, then mask its browser-facing acknowledgement. Verify
saved values through a separate real read. Every recovery GET starts after that
POST settles, preserving the accepted F1 exclusion.

## Phase 1: Browser recovery coverage and integration

### Overview

Implement the approved four work steps as one coherent phase. Keep auth, routes,
DTO parsing and persistence real; control specific HTTP outcomes at the browser
boundary. The resulting tests must detect the accepted stock F1/F2 and print F2
regressions without introducing new product behavior.

### Changes Required

#### 1. Browser runner and command

**Files:** `package.json`, `package-lock.json`, `playwright.config.ts`, `.gitignore`.

**Intent:** Provide an independently runnable Chromium suite against a fresh
production-like preview, with useful failure evidence and no accidental session
files in source control.

**Contract:** Add `@playwright/test` as a development dependency and
`test:e2e` as the suite command. Use `tests/e2e/`, a setup project and a dependent
Chromium project. Default to the established application port 4321, with an
explicit `E2E_PORT` override. The app webServer command builds and starts preview
on that port; it must not silently reuse an existing server. Use one browser
worker initially. Keep browser tests outside `verify:deploy`, which remains
runnable without local Supabase. Ignore auth state, local fixture credentials,
test results and browser reports. Capture screenshots only on failure and traces
on first retry; do not upload raw authentication artifacts by default.

#### 2. Real local authentication and isolated fixtures

**Files:** `tests/e2e/auth.setup.ts`, `tests/e2e/auth.teardown.ts`,
`tests/e2e/fixtures.ts`, `tests/e2e/helpers/local-account.ts`.

**Intent:** Exercise real sessions while making the suite repeatable against an
existing local database and preventing fixture leakage between tests.

**Contract:** Validate that app and provisioning configuration target local
Supabase before creating a generated, confirmed test account. Limit provisioning
privileges to account setup and cleanup. Authenticate through the real sign-in UI
in setup and save storage state under the ignored auth directory. Keep generated
credentials in ignored private files and out of command output. Provide each
independent test context a usable real session; obtain fresh sessions through the
actual sign-in endpoint when needed rather than sharing an expiring refresh token
across contexts. Do not repeat UI sign-in inside each recovery test. Create and
read fixture records through authenticated app APIs. Track fixture IDs, use unique
labels, assert cleanup outcomes and delete the generated account on teardown.
Cleanup must tolerate records deliberately deleted by a test only after confirming
their absence. Provisioning failure must not trigger a database reset.

#### 3. Stock recovery scenarios

**File:** `tests/e2e/spool-recovery.spec.ts`.

**Intent:** Protect retained fields, explicit retry and active-form uncertainty
through the existing stock UI, including its separate delete boundary.

**Contract:** Implement the following behavior cases. Each must include visible
state assertions and real persisted-state checks where a mutation may commit.

| Case                               | Behavior asserted and regression caught                                                                                                                                                                                             | Independent oracle / research                                                                            | Boundary and anti-pattern avoided                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server validation                  | A real 422 retains material, colour and grams; material receives focus and associated error feedback. Correcting the material allows a real save showing canonical values.                                                          | Archived stock plan label contract and Phase 3; research, Stock recovery surface.                        | Use 41 sharp-s characters, whose uppercase material exceeds 80 code points; correct to 40 and expect 80 S characters. Do not mock the validator or derive the expected label from production. |
| Retry and pending coordination     | A controlled 503 retains input and releases pending controls for explicit retry. While the request is held, submit, cancel and incompatible collection transitions are disabled. No automatic second POST occurs.                   | Archived stock plan Phase 3 and accepted stock review F2; research pending paths.                        | Hold/release a browser HTTP request with an explicit synchronization point, then permit a real retry. No arbitrary sleeps or assertions limited to HTTP status.                               |
| Committed save, unreadable reply   | A real create with a masked successful acknowledgement retains input, reports uncertainty and blocks resubmission through edits of each field. Stock navigation then reveals exactly one record with the original committed values. | Accepted stock review F1 and original refresh-guidance contract; research `SpoolForm` uncertainty paths. | Check no extra browser POST and no false success. Do not demand print-style consent or a stock-wide guard after cancel/reopen.                                                                |
| Committed delete, unreadable reply | The local target remains visible until reread, repeated confirmation is disabled, and refresh removes exactly that ID while preserving a second spool's values.                                                                     | Archived stock deletion contract; research `SpoolInventory` delete path.                                 | Forward the real deletion before masking the 200 reply. Do not treat a fabricated failure without a committed deletion as equivalent evidence.                                                |

#### 4. Planned-print recovery scenarios

**File:** `tests/e2e/print-recovery.spec.ts`.

**Intent:** Protect stale drafts, explicit discard consent and the collection-level
uncertainty guard across the print form, list and delete interactions.

**Contract:** Implement the following cases, reusing setup and fault-injection
helpers without mocking internal React state or replacing server ownership/version
checks. Each case can run independently.

| Case                             | Behavior asserted and regression caught                                                                                                                                                                                                                                                                           | Independent oracle / research                                                                                    | Boundary and anti-pattern avoided                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Server validation                | A real invalid 0 g save preserves name, labels and grams, focuses associated error feedback and creates no record. Correcting grams permits a real save.                                                                                                                                                          | Archived print quantity and rendered-feedback contract; research validation path.                                | Execute the actual noValidate form. Do not rely on native HTML validity or a copied validator expectation.               |
| Stale edit and consent           | Open a stale form, genuinely save 90 g through another API request, then submit a browser draft of 100 g. A real 409 retains the draft and blocks stale resubmission through field edits. Dismissing “Read latest print” performs no GET; accepting loads 90 g and the current version without an automatic POST. | Archived print plan stale-edit contract and 90/100 g example; research conflict and version-keyed remount paths. | Use a real version change, not a fabricated 409. Do not repeat the existing concurrent-write tournament.                 |
| Uncertain save and failed read   | Forward a create, then replace its reply with a readable 503. Retain fields and block writes through edits and cancel/reopen. A failed refresh preserves draft/guard; a successful real refresh shows the committed record and restores permitted mutation controls.                                              | Archived print plan mutation-5xx and recovery contract; research form/list guard paths.                          | Assert the real saved values and no repeated POSTs. A 503 alone does not prove that nothing committed.                   |
| Other uncertain acknowledgements | Network rejection, an unreadable successful reply and readable 500 preserve fields and require a fresh read before another mutation.                                                                                                                                                                              | Archived print plan uncertainty contract; research distinct acknowledgement branches.                            | Keep these cases shorter than the full 503 transition scenario. Inject faults at HTTP only; avoid internal mocks.        |
| Uncertain deletion               | A committed delete with a masked acknowledgement blocks another write, including after changing panels. Failed reread preserves the guard; successful reread removes the target and preserves the second record.                                                                                                  | Archived print deletion and collection guard contract; research separate deletion path.                          | Use two actual IDs and inspect persisted survivor values. Do not infer deletion from a disappearing local row.           |
| Generic retry discard consent    | Fail a list read, open an edit and enter a draft, then genuinely advance the saved record version. Generic “Try again” asks consent: dismiss preserves fields without GET; accept explicitly replaces them with fresh values.                                                                                     | Accepted archived print review F2; research generic retry and form-remount paths.                                | Advancing the version makes the draft-loss regression observable. Do not pass conflict semantics into the generic retry. |

Fold write-first pending coordination checks into the held print mutation case:
cancel, submit, add/edit/delete and list refresh cannot start an incompatible
operation until the write settles. This does not test submission during a read.

#### 5. Required local-stack CI gate

**File:** `.github/workflows/ci.yml`.

**Intent:** Run the focused browser suite on the same pull requests and master
pushes already protected by local-stack integration checks.

**Contract:** In the smoke job, install Chromium with its system dependencies and
run `npm run test:e2e` after local credentials are configured and before the
existing smoke preview starts. Let Playwright build, own and stop its preview;
then retain the existing production build/preview/HTTP smoke sequence. Preserve
the SQL, populated-migration and always-run Supabase cleanup steps. Browser failure
must fail the job. Record remote CI as unobserved until an actual remote run occurs.

#### 6. Cookbook and verification evidence

**Files:** `context/foundation/test-plan.md`,
`context/foundation/test-stack.md`,
`context/changes/testing-browser-mutation-recovery/verification.md`.

**Intent:** Leave a reusable behavior-testing pattern and an honest record of what
was demonstrated, so later changes extend the suite at the cheapest useful layer.

**Contract:** Fill test-plan §6.4 and add Phase 3 notes in §6.5 with actual test
locations, commands, fixture lifecycle, fault boundaries, stock/print differences
and exclusions. Record the installed browser stack, preview command, port,
authentication lifecycle and diagnostics in the E2E section of test-stack.md.
Do not rewrite frozen strategy sections as part of cookbook work. Update §3 to
`implementing` when implementation starts; use `complete` only after all Progress
items, including human closeout, finish. Verification must distinguish real local
state, simulated acknowledgement failures, deliberate breaks and unobserved remote
CI. Test-plan §2 correction remains deferred unless explicitly approved separately.

### Success Criteria

#### Automated Verification

- The focused Chromium suite passes from a cold owned preview with checked fixture cleanup: `npm run test:e2e`.
- Native contracts, lint, types and production build pass: `npm run verify:deploy`.
- Existing built-preview HTTP smoke passes with local Supabase/Mailpit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`.
- Deliberate regressions in stock uncertainty preservation, pending coordination, print failed-refresh protection and generic retry consent make the corresponding browser tests fail; restore the staged production bytes unconditionally and record the outcomes.
- CI contains a required Chromium recovery step in the local-stack job, retains existing integration/cleanup gates and gives Playwright ownership of its preview lifecycle; remote execution is not claimed without a run.
- Cookbook §6.4, Phase 3 notes, test-stack E2E guidance and verification evidence describe the shipped behavior, commands, fixture cleanup and limits accurately.
- The final diff has no whitespace errors: `git diff --check`.

#### Manual Verification

- Review the browser recovery evidence and confirm retained drafts, discard consent, pending/uncertain write protection and the accepted stock/print differences; confirm rollout Phase 3 closeout.

**Implementation Note:** After automated verification, pause for the author's
manual confirmation before commit closeout. Do not mark the manual row complete
from an agent-run browser session. While saving this approved plan, leave every
Progress row unchecked and do not install dependencies, write tests or run gates.

## Testing Strategy

### Existing cheaper layers

Retain the native Node contracts and existing SQL/HTTP integration. No additional
unit runner is needed. The browser suite adds the rendered interaction signal
identified in research and must not duplicate their entire validation or access
matrix.

### Browser integration

Use role/label locators, visible form transitions, response waits and explicit
request synchronization. Assertions must include user-visible outcomes; selected
persisted values and request counts support those outcomes. Do not use CSS/DOM
structure selectors, React-state injection, fixed sleeps or visual snapshots.
Forward-then-mask scenarios must prove a real successful commit before masking
the acknowledgement, with cleanup registered even when the browser rejects it.

### Deliberate regressions

Stage the intended phase changes before temporary production edits. In scoped
checks, remove stock uncertainty preservation across edits, weaken a pending
transition lock, clear the print guard on a failed refresh and reintroduce generic
retry's consent bypass. The corresponding tests must go red for the protected
behavior. Restore each worktree edit unconditionally to the staged version,
including on unexpected command failure, and verify the final suite after restore.

### Manual review

After implementation, provide the author with scenario results, representative
failure evidence and the cookbook. Review the existing-contract differences and
confirm that the recorded protection matches the intended experience. This is
the final acceptance step, not a second requirement to repeat the whole automated
matrix manually.

## Performance Considerations

Start with one Chromium worker and a focused risk #6 matrix. Keep the full
transition sequence in representative cases and shorter checks for the remaining
acknowledgement branches. Browser installation/build cost belongs to the scoped
integration gate, not to each native contract invocation.

## Migration Notes

No application schema or persisted-data migration is required. The implementation
adds development tooling and disposable local fixtures. Preserve the current local
database and existing credential files; teardown removes only generated test data.

## References

- Research: `context/changes/testing-browser-mutation-recovery/research.md`.
- Rollout: `context/foundation/test-plan.md`, Phase 3 and risk #6.
- Stock oracle: `context/archive/2026-10-10-personal-filament-stock/plan.md`,
  accepted label/interaction contracts; `reviews/impl-review.md`, fixed F1/F2.
- Print oracle: `context/archive/2026-10-12-personal-planned-prints/plan.md`,
  stale edit and uncertainty contracts, 90/100 g example; `reviews/impl-review.md`,
  fixed F2 and skipped F1.
- Existing server checks: `scripts/spool-contracts.test.mjs`,
  `scripts/print-contracts.test.mjs`, `scripts/print-smoke.mjs`.
- Current official Playwright grounding and checked date are retained in research.

## Progress

> Completed steps retain their implementation commit identifiers for traceability.

### Phase 1: Browser recovery coverage and integration

#### Automated

- [x] 1.1 The focused Chromium suite passes from a cold owned preview with checked fixture cleanup: `npm run test:e2e`. — fb825e3
- [x] 1.2 Native contracts, lint, types and production build pass: `npm run verify:deploy`. — fb825e3
- [x] 1.3 Existing built-preview HTTP smoke passes with local Supabase/Mailpit: `BASE_URL=http://localhost:4321 MAILPIT_URL=http://127.0.0.1:54324 npm run smoke`. — fb825e3
- [x] 1.4 Deliberate regressions in stock uncertainty preservation, pending coordination, print failed-refresh protection and generic retry consent make the corresponding browser tests fail; restore the staged production bytes unconditionally and record the outcomes. — fb825e3
- [x] 1.5 CI contains a required Chromium recovery step in the local-stack job, retains existing integration/cleanup gates and gives Playwright ownership of its preview lifecycle; remote execution is not claimed without a run. — fb825e3
- [x] 1.6 Cookbook §6.4, Phase 3 notes, test-stack E2E guidance and verification evidence describe the shipped behavior, commands, fixture cleanup and limits accurately. — fb825e3
- [x] 1.7 The final diff has no whitespace errors: `git diff --check`. — fb825e3

#### Manual

- [x] 1.8 Review the browser recovery evidence and confirm retained drafts, discard consent, pending/uncertain write protection and the accepted stock/print differences; confirm rollout Phase 3 closeout. — fb825e3
