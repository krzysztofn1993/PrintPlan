# Personal Planned Prints — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Deliver S-02 so users can keep private planned prints before reserving material, recording material, colour, required grams, and an optional name.
Version checks prevent an older editing form from silently overwriting a newer save.

## Starting Point

Stock CRUD, verified account sessions, restricted-role SQL tests, and HTTP smoke already exist.
At `2b02194`, Carbon shared styles are committed; its remaining page restyle is separate. Print persistence, endpoints, and a view still need to be added.

## Desired End State

Users manage their prints at `/dashboard/prints`, with changes retained after refresh and relogin. Named and unnamed identical prints remain separate and independently editable/deletable.
A stale edit retains its inputs and shows a conflict; saving requirements works without any spools.

## Key Decisions Made

| Decision         | Choice                                                                | Why                                                                 | Source                |
| ---------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------- |
| Grams            | Whole 1–2,147,483,647 g on create/edit; reject zero/fractions         | Match stock's representation without silently rounding requirements | Plan: author          |
| Name             | Optional, up to 80 normalized Unicode code points; blank → null       | Recognize models without a mandatory extra field                    | Plan: author          |
| Identical prints | Separate UUIDs, independent actions                                   | Repeated models are legitimate separate tasks                       | Plan: author          |
| Ordering         | Created newest first, ID ascending on ties; edits do not move entries | Stable and consistent with stock                                    | Plan: author          |
| Editing          | Expected version checked in the write; stale → 409                    | Protect changes made in another tab                                 | Plan: author          |
| Deletion         | Item-specific confirmation, without version comparison                | Retain the accepted edit-only conflict boundary                     | Plan: author          |
| Labels           | Stock's canonical material/colour rules, including multicolour names  | Prepare consistent matching for S-03                                | Research / stock plan |
| Access           | Verified owner, owner-scoped queries, grants and RLS                  | Data remains private through application and direct REST access     | PRD / Research        |

## Scope

**In scope:** CRUD, optional names, positive whole-gram requirements, optimistic editing,
private SSR/API responses, responsive Carbon UI, database/native/HTTP checks, and CI integration.

**Out of scope:** Reservations, stock eligibility, margins, settlement, file imports,
mandatory/unique names, conflict merging, version checks on deletion/stock, realtime,
automatic mutation retries, a new browser runner, and hosted deployment.

## Architecture / Approach

Astro SSR reads → print service → request-scoped Supabase client. React forms → authenticated form endpoints → the same service.
An additive `public.prints` table enforces requirements/privacy and increments an integer version.
Update uses ID + owner + expectedVersion together; an owner-only zero-row probe distinguishes 409 from 404.
Direct writes increment versions, but custom REST clients are not required to supply a version predicate.

## Phases at a Glance

| Phase                                | What it delivers                                                      | Key risk                                    |
| ------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------- |
| 1. Database and Data Contracts       | Print schema, optional name, managed version, RLS and SQL tests       | Direct writes bypassing app validation      |
| 2. Operations and API                | CRUD, strict payloads, private errors and conditional editing         | False success or an unsafe conflict probe   |
| 3. Planned-Print View and Navigation | List/forms, deletion confirmation, conflict recovery and navigation   | Lost input or overlap with Carbon work      |
| 4. Verification and CI               | Persistence/isolation/concurrent-write smoke, gates, browser evidence | Auth expiry timing and unobserved UI states |

**Prerequisites:** F-01 is done; Node 24.21.0, `npm ci`, disposable local Supabase/Postgres 17, Mailpit, matching local credentials, and Chrome/Firefox/phone access for final acceptance.
**Estimated effort:** Approximately 4–6 focused after-hours sessions; an estimate, not a delivery promise.

## Open Risks & Assumptions

- Carbon still touches dashboard/navigation; re-read current files and preserve its semantic contract.
- Network failures, unreadable mutation successes, and every mutation 5xx response are uncertain; retain the list guard until a successful fresh read, including through form cancellation/reopening. GET failures remain retryable; local guards do not provide durable create idempotency.
- Conflict refresh discards unsaved fields only through an explicit action with visible warning.
- Integration smoke must fit existing deadlines and preserve fresh sessions before auth-expiry checks.
- S-03 must later protect all database-accessible mutations before enabling reservations.

## Success Criteria (Summary)

- Own named/unnamed prints persist, identical entries remain independent, and foreign data is inaccessible.
- Zero/fractional requirements fail; one of two competing same-version edits wins and the other returns 409.
- CRUD/conflict flows work in Chrome, Firefox and phone layouts; native, SQL and built-preview checks pass.

## References

- [PRD](../../foundation/prd.md), [roadmap S-02](../../foundation/roadmap.md), and [research](research.md).
- [Stock plan](../../archive/2026-10-10-personal-filament-stock/plan.md) and [Carbon plan](../carbon-terminal-theme/plan.md).
- [Full plan](plan.md) supplies file anchors, exact contracts, verification commands, and canonical Progress.
