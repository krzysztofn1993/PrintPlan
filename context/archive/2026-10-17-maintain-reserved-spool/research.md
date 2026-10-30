---
date: 2026-10-17T07:52:25Z
researcher: Codex
git_commit: b8cf7ebaa68272022b89b1717cf4bf491f2b3718
branch: maintain-reserved-spool
repository: PrintPlan
topic: "S-06: Maintain a spool that has active reservations"
tags: [research, codebase, spools, reservations, mutation-recovery]
status: complete
last_updated: 2026-10-17
last_updated_by: Codex
last_updated_note: "Installed dependencies and passed the required stop hook and document formatting checks"
---

# Research: Maintain a spool that has active reservations

**Date:** 2026-10-17T07:52:25Z  
**Researcher:** Codex  
**Git commit:** `b8cf7ebaa68272022b89b1717cf4bf491f2b3718`  
**Branch:** `maintain-reserved-spool`  
**Repository:** PrintPlan

## Research Question

Resolve `/10x-research s-06` to roadmap change `maintain-reserved-spool`: what already supports correcting or deleting a reserved spool, what remains to deliver the declared outcome, and which contracts, decisions and verification seams should inform planning? The roadmap requires corrections to cover active reservations, and deletion to leave affected prints unreserved while identifying their cancelled reservations. [Roadmap:172](../../foundation/roadmap.md#L172)

Scope covers current database operations, services/API, stock UI, prior S-03 decisions and relevant verification definitions. This is source research, not an implementation plan or a runtime verification. Terms follow the PRD's spool, planned print, recorded stock, reserved grams and available grams; no domain glossary is present in this checkout. [PRD:82](../../foundation/prd.md#L82), [PRD:114](../../foundation/prd.md#L114)

## Summary

- **The correction guardrail is implemented.** In the inspected `update_spool` transaction, recorded stock below the current active-reservation sum is rejected; equality is accepted. Reserved matching-key changes require cancellation first. The existing form and API expose these restrictions. [Database:118](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L118), [form:189](../../../src/components/spools/SpoolForm.tsx#L189), [API:41](../../../src/pages/api/spools/[id]/update.ts#L41)
- **Deletion is already safe and informative when its success reply arrives.** The transaction snapshots cancellation identities, print descriptions and released grams, advances surviving print versions, removes reservations and deletes the spool. The UI displays cancellation details from the returned receipt. [Database:143](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L143), [UI:200](../../../src/components/spools/SpoolInventory.tsx#L200)
- **The material S-06 gap is recovery of that cancellation receipt after a lost reply.** The inspected delete operation does not persist its summary or accept a deletion request identity. Retrying encounters a missing spool; stock refresh confirms current inventory but contains no original cancellation list. Existing reserve-request evidence lacks the snapshots needed to reconstruct that list. [Delete:143](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L143), [ledger:40](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L40), [GET:16](../../../src/pages/api/spools/index.ts#L16), [refresh:69](../../../src/components/spools/SpoolInventory.tsx#L69)
- **Planning can reuse the current consistency boundary and test infrastructure.** A durable, owner-scoped source of deletion results and a recovery contract remain to be designed. Retention and recovery across navigation/login are not specified by S-06. Broad malformed-receipt hardening was explicitly deferred by the author in S-03 and is not automatically authorized by this research. [S-03 decisions:24](../../archive/2026-10-16-reserve-and-release-material/plan-brief.md#L24), [accepted deferral:57](../../archive/2026-10-16-reserve-and-release-material/reviews/impl-review.md#L57)

## Detailed Findings

### Recorded-stock correction and matching attributes

`update_spool` derives the owner from `auth.uid()`, acquires the owner's mutation mutex, locks the owned spool, then sums its active reservation rows. It compares normalized matching attributes before checking the proposed stock amount. Changing the canonical material or colour key while reserved produces `reserved_spool_change_requires_cancellation`; a stock amount below the reservation sum produces `stock_below_reservations`. These failures do not implement automatic cancellation. Canonically equivalent input can pass the database matching guard. [Mutation:118](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L118)

For the PRD example of a matching spool with 150 g recorded and an 80 g print reserved at the default 10% margin, the reservation is 88 g. Under `update_spool`, correcting recorded stock to 88 g is allowed and leaves 0 g available; correcting it to 87 g is rejected while that reservation remains active. Cancellation first is the settled product rule, rather than settlement's separate automatic-cancellation policy. [PRD example:48](../../foundation/prd.md#L48), [PRD guardrail:41](../../foundation/prd.md#L41), [comparison:127](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L127), [availability:81](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L81)

The stock form disables material and colour when the displayed DTO has reserved grams and supplies a reservation-aware minimum hint for recorded stock. However, its `noValidate` submission calls shared validation with an edit minimum of zero, without the reservation sum. The server remains authoritative. The stock-conflict message interpolates the existing DTO's `reservedGrams`, so it can display an outdated minimum after another request changes reservations; the HTTP conflict does not include a fresh total. [Form submit:115](../../../src/components/spools/SpoolForm.tsx#L115), [form controls:224](../../../src/components/spools/SpoolForm.tsx#L224), [quantity validation:86](../../../src/lib/spool-validation.ts#L86), [conflict message:189](../../../src/components/spools/SpoolForm.tsx#L189), [API conflict:52](../../../src/pages/api/spools/[id]/update.ts#L52)

The update service calls the RPC, then separately reads `spool_inventory` to return a reservation-aware DTO. A committed update followed by a failed read can therefore produce an uncertain mutation response. The inspected update contract has no expected spool version; owner serialization protects reservation totals but does not reject an older form merely because another stock edit committed. Adding stale-edit conflict detection is a separate scope choice, not an existing S-06 requirement. [Service:142](../../../src/lib/spools.ts#L142), [confirmation read:81](../../../src/lib/spools.ts#L81), [RPC:118](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L118)

### Deletion transaction and surviving prints

Under the owner mutex, `delete_spool` requires the owned spool and snapshots each active reservation on that spool into `{reservationId, printId, printName, material, colour, releasedGrams}`. The snapshot orders entries by reservation creation time and identifier. It updates affected prints, marks their successful reserve requests `deleted`, removes the reservation rows and spool, and returns `{id, cancelledReservations}`. The print update trigger advances versions. The surviving planned-print projection then has no reservation for those removed rows. [Delete:143](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L143), [version trigger:80](../../../supabase/migrations/20261012000000_create_prints.sql#L80), [projection:93](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L93)

The HTTP endpoint accepts an empty form; submitted fields are rejected. The service calls `delete_spool` with the spool ID and returns the RPC receipt. Ownership is enforced inside the RPC, whose owner comes from the authenticated session, rather than from the service's unused owner argument. A repeated delete after successful removal reaches `not_found`, without replaying the earlier receipt. [Route:17](../../../src/pages/api/spools/[id]/delete.ts#L17), [service:166](../../../src/lib/spools.ts#L166), [database absence check:149](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L149)

For a readable success, the collection removes the spool and announces print name or material/colour fallback, full print ID and released grams. The confirmation identifies the spool but does not preview affected prints. A pre-deletion impact preview is not required by the inspected roadmap outcome, which requires identifying cancellations after deletion. [Success handling:200](../../../src/components/spools/SpoolInventory.tsx#L200), [confirmation:440](../../../src/components/spools/SpoolInventory.tsx#L440), [outcome:174](../../foundation/roadmap.md#L174)

### Lost-response recovery and retained evidence

In the inspected collection, network failure, a server error response or an unreadable success activates the uncertainty guard. Opening or submitting stock mutations is blocked while guarded. `refreshStock` reads `/api/spools` without cache; network errors or invalid DTOs retain the guard. A readable list replaces inventory, clears the guard, closes active editors/confirmation and displays a generic refresh message. The deletion error also offers navigation to a fresh SSR stock page. [Uncertain delete:172](../../../src/components/spools/SpoolInventory.tsx#L172), [mutation guards:112](../../../src/components/spools/SpoolInventory.tsx#L112), [refresh:69](../../../src/components/spools/SpoolInventory.tsx#L69), [navigation:456](../../../src/components/spools/SpoolInventory.tsx#L456)

This reconciles current stock, not the earlier deletion's complete effects. GET exposes live spool DTOs with aggregate quantities; a deleted spool and its cancelled reservation rows are absent. The delete payload carries no command identity, and its context is held in component state rather than persisted recovery state. Neither the current GET contract nor mounting the SSR collection supplies the earlier cancellation receipt. [DTO:16](../../../src/lib/spools.ts#L16), [GET:16](../../../src/pages/api/spools/index.ts#L16), [component state:31](../../../src/components/spools/SpoolInventory.tsx#L31), [delete payload:178](../../../src/components/spools/SpoolInventory.tsx#L178), [SSR:16](../../../src/pages/dashboard/spools.astro#L16)

`private.reservation_requests` retains successful reserve-command parameters, owner, request/reservation/print/spool identities, lifecycle state and timestamps. Product deletion preserves that evidence, but the schema lacks released-grams and print-description snapshots, a deletion operation identity and a cancellation batch receipt. Its `deleted` state can result from spool or print deletion. Surviving prints can subsequently be edited or deleted, so their current fields cannot establish the original summary. Exact recovery is unsupported by these inspected persistence paths. [Ledger schema:40](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L40), [spool deletion:159](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L159), [print deletion:198](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L198)

**Planning inference:** recovering the original result requires durable evidence captured with deletion, plus an owner-checked way to retrieve or replay it after the target disappears. Current reserve replay offers an existing pattern: check retained owner/request identity under the mutex, reject changed parameters, and resolve an earlier success before validating live product rows. This is a reusable convention, not a decision to repurpose its current table or adopt a particular endpoint. [Reserve replay:258](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L258)

### Receipt validation and the accepted deferral

The delete service accepts a receipt containing an `id` property, casts its shape and substitutes an empty cancellation array when missing. The browser checks a matching ID and array, then filters malformed entries instead of rejecting the complete receipt. Under the concrete input `{id: spool.id, cancelledReservations: [{}]}`, that browser path removes the spool and reports no active cancellations. This is a parser limitation, not evidence that the current SQL producer emits such a receipt. [Service parser:179](../../../src/lib/spools.ts#L179), [UI parser:200](../../../src/components/spools/SpoolInventory.tsx#L200)

Historical review F3 identified this behavior and records author-approved deferral of broad structured-receipt hardening. That decision remains applicable; S-06's recovery gap exists even with a valid original receipt. Planning should specify validation of any new recovery contract and make explicit whether a narrowly related parser change is needed, without silently reopening the deferred print/reserve/release hardening work. [F3 and decision:57](../../archive/2026-10-16-reserve-and-release-material/reviews/impl-review.md#L57)

### Existing verification and bounded gaps

The following are inspected test definitions, not newly executed results:

- Database reservation tests cover reserved matching edits, below-reservation rejection, exact equality, deletion released grams and a surviving unreserved print. Controlled concurrency scenarios cover reserve versus stock reduction and reserve versus spool deletion in both orderings. These are reusable safety regressions. [SQL:69](../../../supabase/tests/reservations.test.sql#L69), [SQL delete:124](../../../supabase/tests/reservations.test.sql#L124), [races:378](../../../scripts/reservation-concurrency.mjs#L378)
- The native spool update/delete receipt case checks RPC parameters and `not_found`. The reservation contract suite supplies a separate precedent for failed confirmation reads after a successful RPC. [Spool contracts:412](../../../scripts/spool-contracts.test.mjs#L412), [reservation contracts:337](../../../scripts/reservation-contracts.test.mjs#L337)
- The normal reserved-spool browser flow checks disabled labels, the stock minimum hint, readable cancellation feedback and the surviving unreserved print. The lost-delete-reply stock case uses an unreserved target and checks disappearance plus survivor preservation. It does not establish cancellation-list recovery. [Reserved deletion:237](../../../tests/e2e/reservation-recovery.spec.ts#L237), [lost unreserved deletion:174](../../../tests/e2e/spool-recovery.spec.ts#L174)
- Within the inspected complete spool/reservation browser suites, there is no scenario for a completed reserved-stock correction, below-reservation correction rejection, changed reservation totals during editing, a spool deletion with multiple reservations, or recovery of its cancellation details through failed reads and navigation. The existing fixture APIs and real-request-then-mask pattern can support those cases. [Spool suite](../../../tests/e2e/spool-recovery.spec.ts), [reservation suite](../../../tests/e2e/reservation-recovery.spec.ts), [fixtures:54](../../../tests/e2e/fixtures.ts#L54), [masking:194](../../../tests/e2e/spool-recovery.spec.ts#L194)

For planning, the most consequential new proofs are original-summary recovery after a committed reserved deletion loses its reply, multiple-reservation completeness, repeat recovery without another cancellation, owner isolation of retained results, and preserving original details if a surviving print later changes. Add reload/login cases according to the chosen recovery lifetime. Preserve the existing guardrail and concurrency regressions. These are inferred verification needs from the missing persistence/recovery contract, not tests written during research. [Transient summary:151](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L151), [live GET:16](../../../src/pages/api/spools/index.ts#L16)

## Architecture Insights

The inspected spool update/delete and reserve/release RPCs share an owner mutex acquired before product-state checks. Supported authenticated writes use RPC execution grants; direct spool/print/reservation DML is revoked, with owner-scoped SELECT projections retained. Extending deletion must preserve this boundary, same-owner isolation and print version invalidation. [Mutex:55](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L55), [grants:333](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L333)

Collection state and mutations already belong to `SpoolInventory`/`SpoolForm`. Preserve the recorded/reserved/available DTO bindings and the existing dashboard design contract. Recovering a historical operation result and refreshing live inventory answer different questions; a fresh list alone does not prove which reservations that earlier deletion cancelled. [Collection:31](../../../src/components/spools/SpoolInventory.tsx#L31), [DTO parser:8](../../../src/lib/spool-dto.ts#L8), [repository conventions](../../../AGENTS.md)

The repository has a configured Chromium browser suite despite the stale AGENTS statement that no browser runner exists. The AGENTS statement that reservations are planned is also superseded by the inspected migration, services and UI. `verify:deploy` covers native contracts, lint, type checking and build; browser, SQL, migration and concurrency verification have separate commands/jobs. These corrections do not imply a need for runner setup in S-06. [Package scripts:16](../../../package.json#L16), [browser config:12](../../../playwright.config.ts#L12), [CI:51](../../../.github/workflows/ci.yml#L51), [test stack:3](../../foundation/test-stack.md#L3)

## Historical Context

- **Supported:** S-03's approved behavior allows reserved-stock corrections at or above reserved grams and requires cancellation before matching-key changes. Current database and UI paths implement that policy; do not infer automatic cancellation on attribute edits from S-06's title. [Approved decisions:24](../../archive/2026-10-16-reserve-and-release-material/plan-brief.md#L24), [current guard:131](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L131)
- **Supported:** S-03 explicitly supplied cancellation feedback for a received success and deferred full cancellation-list recovery after a lost deletion acknowledgement to S-06. The current transient summary and list-refresh behavior match that boundary. [S-03 plan:24](../../archive/2026-10-16-reserve-and-release-material/plan.md#L24), [current summary:151](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L151), [refresh:99](../../../src/components/spools/SpoolInventory.tsx#L99)
- **Supported decision, still observable limitation:** F3 receipt hardening was skipped by author choice; its spool-delete filtering behavior remains in the inspected code. [Review:57](../../archive/2026-10-16-reserve-and-release-material/reviews/impl-review.md#L57), [filter:207](../../../src/components/spools/SpoolInventory.tsx#L207)
- **Outdated scope assertions:** S-03's historical starting point says reservation persistence did not exist. That describes its planning baseline, not this checkout. Likewise, earlier test-plan text describing stock uncertainty as form-local is superseded by the collection guard. The same test-plan paragraph's statement that the lost-delete browser case covers a committed delete remains supported by that test's real-request forwarding. [Historical baseline:13](../../archive/2026-10-16-reserve-and-release-material/plan.md#L13), [test-plan description:145](../../foundation/test-plan.md#L145), [current collection guard:41](../../../src/components/spools/SpoolInventory.tsx#L41), [committed deletion test:194](../../../tests/e2e/spool-recovery.spec.ts#L194)

## Code References

- `supabase/migrations/20261016000000_reserve_and_release_material.sql:118` — stock correction and reserved matching guards.
- `supabase/migrations/20261016000000_reserve_and_release_material.sql:143` — delete transaction and transient cancellation summary.
- `supabase/migrations/20261016000000_reserve_and_release_material.sql:40` — retained reserve-command evidence, without deletion snapshots.
- `src/lib/spools.ts:142` — update confirmation read; `:166` — delete service contract.
- `src/pages/api/spools/[id]/delete.ts:17` — authenticated empty-form delete boundary.
- `src/components/spools/SpoolInventory.tsx:69` — live-state refresh; `:172` — delete mutation and feedback.
- `src/components/spools/SpoolForm.tsx:189` — conflict messages; `:224` — reserved editing controls.

## Related Research

- [S-03 research](../../archive/2026-10-16-reserve-and-release-material/research.md) — pre-reservation investigation and scope boundary; use current code for implementation claims.
- [S-01 research](../../archive/2026-10-10-personal-filament-stock/research.md) — original stock/quantity contract and later reservation transition.

## Open Questions and Planning Handoff

**Settled:** corrections below active reservations require cancellation first; equality is valid; reserved matching changes require cancellation first under the retained S-03 decision; spool deletion cancels its active reservations, preserves the prints and identifies cancellations. Margin settings, reserved-print recalculation and settlement remain separate roadmap slices. [PRD:41](../../foundation/prd.md#L41), [S-03 decisions:24](../../archive/2026-10-16-reserve-and-release-material/plan-brief.md#L24), [roadmap:150](../../foundation/roadmap.md#L150)

1. **Recovery lifetime — author/product decision during planning.** Must full cancellation details survive a retry in the same mounted page, full reload/navigation, session expiry and later login? How long should they remain available? S-03 explicitly delegates lost-acknowledgement recovery to S-06, but does not define retention, discovery or acknowledgement behavior. Do not silently turn this into a public history feature. [Deferral:63](../../archive/2026-10-16-reserve-and-release-material/plan-brief.md#L63), [scope exclusions:42](../../archive/2026-10-16-reserve-and-release-material/plan.md#L42)
2. **Durable command/result contract — planner, after lifetime is settled.** Choose retained deletion evidence, command identity/replay or lookup semantics, owner isolation, behavior for an absent target without matching evidence, and client recovery identity across the agreed lifetime. Capture the original summary within the deletion consistency boundary; current reservation-request IDs/state alone do not prove its original contents. [Ledger:40](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L40), [delete:143](../../../supabase/migrations/20261016000000_reserve_and_release_material.sql#L143)
3. **Correction recovery and navigation — planner.** Decide how a guardrail rejection exposes current reservation totals and a route to cancellation, while retaining useful draft state. Existing conflict text can use stale grams; the current refresh closes the form. Expected-version protection for competing stock edits would be additional scope and should be named if proposed. [Conflict:189](../../../src/components/spools/SpoolForm.tsx#L189), [refresh:99](../../../src/components/spools/SpoolInventory.tsx#L99), [update parameters:149](../../../src/lib/spools.ts#L149)
4. **Receipt-hardening boundary — planner with the retained author decision.** Define validation for the new deletion/recovery contract and explain any proposed narrow change to the current delete parser. Broad reserve/release/print parser hardening remains deferred unless separately selected. [Accepted F3 decision:57](../../archive/2026-10-16-reserve-and-release-material/reviews/impl-review.md#L57)

Discovery is complete for this source-based planning handoff. No database changes, deployment or production-code edits were performed. Runtime database state and hosted behavior were not inspected. Research completion does not resolve the product choices above or authorize implementation; the next workflow is `/10x-plan maintain-reserved-spool`.

## Verification Follow-up — 2026-10-17

The initial discovery did not run tests or builds. The first required stop-hook run subsequently failed because this worktree lacked installed dependencies, including the Supabase SDK and Astro executable. Its result supersedes the initial statement that no tests had been run; the failed run did not establish a product regression.

Installed the locked dependencies with `npm ci` using Node v24.21.0, matching `.nvmrc`. Re-ran `node .codex/hooks/check-turn.mjs` with this worktree as payload `cwd`: it exited successfully and returned `{}`. On the changed-document checkout, that hook runs the native test files, Astro sync and Astro type checking; no production build or live database/browser suite was run. Both change documents also passed the local Prettier check. These checks resolve the missing-dependency verification failure without changing the research conclusions. [Hook gate:24](../../../.codex/hooks/check-turn.mjs#L24), [native test invocation:222](../../../.codex/hooks/shared.mjs#L222), [Node version](../../../.nvmrc)
