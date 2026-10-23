# Edit Reserved Print — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Deliver S-05: edit a reserved planned print without cancelling its reservation first. Recalculate using the current account margin, save valid edits even when no spool fits, and explain the resulting allocation.

## Starting Point

The database and form currently block requirement changes while reserved. Owner locking, optimistic print versions, margin-aware best-fit, manual selection and settlement already exist; cancellation currently lacks a version precondition.

## Desired End State

Every save, including a name-only or unchanged submission, recalculates a reserved print. An eligible allocation continues with the same reservation ID and original age, while the print version advances once. If no spool fits, the edit saves unreserved and releases the old hold.

An 80 g print holding 88 g at 10% keeps 88 g when settings alone change to 5%. Saving the print then holds 84 g under the same ID/age; a 150 g spool has 66 g available and unchanged recorded stock.

## Key Decisions Made

| Decision               | Choice                                                                                             | Why                                                                 | Source                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| Trigger                | Every successful reserved save, including name-only/no-op                                          | One explicit recalculation rule                                     | Plan — author                                 |
| Selection              | Retain eligible manual spool; otherwise best-fit; fallback becomes automatic                       | Preserve eligible intent and existing deterministic ordering        | PRD / Research; effective fallback: Plan      |
| No fit                 | Save edit, release reservation, show insufficient material                                         | A valid edit remains a success                                      | PRD / Research                                |
| Identity and freshness | Continue ID; use existing print version; reject stale active cancellation                          | Protect continued allocations without a second version field        | Plan — author; version reuse: source analysis |
| Age                    | Keep original creation time, even after reassignment                                               | Preserve exact existing cancellation priority                       | Plan — author                                 |
| Recovery               | Same-version exact retry, then current print and stock reads                                       | Safely resolve uncertainty with limited MVP scope                   | Plan — author                                 |
| History                | No durable edit receipt or browser persistence                                                     | Historical result reconstruction is outside the selected guarantee  | Plan — author                                 |
| Evidence               | Separate original reserve fingerprint from current allocation spool; explicit recalculation marker | Preserve release, settlement and populated-upgrade replay semantics | Plan — source analysis                        |

## Scope

**In scope:** atomic recalculation, current margin, own-held capacity, manual retention/fallback, stable ID/age, versioned cancellation, direct committed results, feedback, recovery and acceptance.

**Out of scope:** edit-history ledger, recovery across reload/navigation, a new spool picker, automatic reservation on unreserved edits, settings-triggered/queue-wide recalculation, settled-print editing and restyling.

## Architecture / Approach

One new migration updates the owner-serialized edit operation and its release/reserve/settlement consumers. Private evidence retains the original reserve command while tracking the current spool. API success returns the transaction snapshot and outcome directly; the owning print collection retains that result while separately refreshing current prints and stock.

If a reply is lost, retain the exact edit and its old expected version. Resolve through an exact retry, then read both collections. A conflict proves that old version cannot apply later; it cannot prove the original edit failed. A GET alone never resolves an in-flight mutation.

Initial reserve confirmation must also verify that the returned spool matches the current reservation's spool. A concurrent same-ID move must produce refresh-required recovery rather than a success combining the new allocation with the old spool. Browser acceptance covers exact cancellation recovery, held requests, same-ID stale cancellation and separate print/stock read failures.

## Phases at a Glance

| Phase                      | What it delivers                                                             | Key risk                                              |
| -------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1. Database and versioning | Atomic continuation, evidence, guarded release and SQL/upgrade compatibility | Stale commands or incorrect own-capacity accounting   |
| 2. API and contracts       | Direct result, strict validation, native and HTTP contracts                  | Treating a committed no-fit edit as failure           |
| 3. Form and recovery       | Editable fields, feedback, exact recovery and paired reads                   | Clearing uncertainty while a request can still commit |
| 4. End-to-end verification | Controlled races, populated upgrades, browser and smoke evidence             | Missing interactions or unsupported usability claims  |

**Author-approved run boundary:** implement Phases 1–3 in the first autonomous run, then end it before Phase 4 and report Manual row 3.3. Keep the change at `implementing` and the Manual row unchecked. The author performs the manual checks; a separate Phase 4 invocation is authorized only after the author confirms that they passed. The first goal must explicitly target Phases 1–3, overriding the skill's default continuation past Manual rows.

**Author-approved gate schedule (review F2, option A):** run `npm run verify:deploy` after every phase, together with that phase's Automated criteria and applicable deliberate-break checks. Full E2E runs in Phases 3–4 and final smoke in Phase 4. Phase 1–2 commits can temporarily contain incompatible DB/API/browser contracts and must not be deployed; no compatibility bypass or weakening of tests is authorized. Persist the Phase 3 SHA write-back in a scoped checkpoint commit before ending the first run, without marking the overall change implemented.

**Prerequisites:** S-03/S-04 delivered; current settlement baseline; Node/dependencies, local Supabase/Docker, configured local credentials and Mailpit for verification.
**Estimated effort:** roughly 4–6 focused implementation/verification sessions for one developer; provisional, excluding environment setup and feedback turnaround.

## Open Risks & Assumptions

- Stable identity requires updating cancellation clients and SQL consumers together; no unversioned bypass may remain.
- Legacy renamed prints must retain reserve replay until an actual S-05 edit; backfill the recalculation marker as NULL.
- After a lost reply, later changes may obscure the exact earlier result. Recovery covers the open page, without durable history.
- Existing automation covers single-worker Chromium; Chrome/Firefox/phone usability and later-login persistence require the recorded human checks.

## Success Criteria (Summary)

- Every reserved save recalculates correctly without overbooking or consuming recorded stock; ID and age survive an eligible continuation.
- Stale cancellation is rejected, exact terminal retries remain harmless, and settlement uses the current assigned spool.
- No-fit edits clearly save unreserved; uncertain requests remain guarded until resolved and both collections are read.

## References

- [Research](research.md), [PRD](../../foundation/prd.md), [roadmap](../../foundation/roadmap.md), [full plan and verification criteria](plan.md).
