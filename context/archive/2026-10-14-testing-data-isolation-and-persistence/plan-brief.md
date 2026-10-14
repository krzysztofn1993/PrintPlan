# Data isolation and persistence — plan brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Protect the author's two highest-priority concerns: foreign access and lost or altered acknowledged spool/print data. Extend the existing integration tests to close evidenced gaps; finish by documenting verified cookbook patterns in §6.

## Starting Point

Two real-role SQL suites passed 158 assertions during research. Existing two-account HTTP smoke already exercises direct REST, CRUD, duplicates, relogin and competing print edits. Its complete saved-value oracles and anonymous mutation paths need strengthening; a populated migration upgrade has no existing proof.

## Desired End State

The gates reject anonymous/foreign access and prove victim records remain intact. Independent API/REST reads and new authentication sessions retain acknowledged values; selected-ID deletion preserves exact unrelated records. Adding prints to a populated spool database preserves committed stock.

## Key Decisions Made

| Decision           | Choice                                                                                   | Why                                                   | Source              |
| ------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------- |
| Structure          | One implementation phase; medium complexity; no extra product questions                  | Scope and test layers are settled                     | Author confirmation |
| Start              | Save artifacts now; implement in a fresh context                                         | Latest author instruction                             | Author              |
| Test layers        | Existing real-role pgTAP and HTTP smoke                                                  | Cheapest useful boundaries for these gaps             | Research / task     |
| Persistence oracle | Explicit values plus acknowledged snapshots and separate reads/new login                 | Counts, IDs and HTTP success can conceal altered data | Research            |
| Upgrade            | Disposable populated spool baseline → actual print migration                             | This is the applicable upgrade in the known inventory | Research            |
| Privileges         | Infrastructure/fixtures may use admin; protection assertions use restricted roles/tokens | Privileged reads cannot establish owner protection    | Task / research     |
| Finish             | Fill §6.1/§6.2 and Phase 1's §6.5 after verification                                     | Future phases need proven reusable patterns           | Author / test plan  |

## Scope

**In scope:** anonymous mutation and REST denial; owner-side rereads after foreign attempts; two-owner positive controls; full fresh-session value comparison; duplicate/selected-ID survivor checks; populated upgrade runner and existing CI wiring; verification evidence and cookbook.

**Out of scope:** appearance, generated code, reservations/settlement, new browser/unit runners, new feature/schema behavior, hosted deployment, backup/server-restart proof, and invented print upgrades. Preserve existing validation/concurrency coverage.

## Architecture / Approach

Keep SQL tests transactional for access policies. Use real HTTP requests and ordinary account sessions for committed CRUD preservation. Add a bounded native Node upgrade runner that creates a unique database inside the local Supabase container, restores native auth schema only, commits owner fixtures, applies existing migrations and compares complete rows through separate restricted connections. Clean up that database on success and failure.

## Phases at a Glance

| Phase                                            | What it delivers                                                                    | Key risk                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1. Close grounded isolation and persistence gaps | Extended SQL/HTTP protection, populated-upgrade CI gate, evidence, then §6 patterns | False protection from privileged/status-only/rebuild assertions |

**Prerequisites:** pinned Node 24.21.0, installed dependencies, running local Supabase with Docker/PostgreSQL tools, Mailpit, restricted local credentials and a built preview. Stop the stale local dev server before starting preview on port 4321; delivered auth links require that configured origin.

**Estimated effort:** one implementation session plus human evidence/closeout review; runtime failures may require focused follow-up.

## Open Risks & Assumptions

- Scratch auth restoration and upgrade execution are implementation gates; research inspected feasibility but did not create a test database.
- The recognized migration inventory contains the spool and print creation files; extend the scenario when it changes. Existing print-data upgrade preservation is currently not applicable.
- Keep the HTTP smoke within its 300-second limit by reusing accounts and bounded requests.

## Success Criteria (Summary)

- Real restricted-role database, populated-upgrade, native and production-preview HTTP gates pass.
- Complete victim/survivor values persist through independent reads and fresh login; a deliberate migration fault makes the preservation test fail and is restored.
- Verification evidence and §6 patterns describe actual protection and limits, followed by human closeout review.

## References

- [Full implementation plan](plan.md)
- [Research and source anchors](research.md)
- [Change intent](change.md)
- [Test rollout and cookbook](../../foundation/test-plan.md)

Next context: `/10x-implement testing-data-isolation-and-persistence phase 1`.
