# Browser Mutation Recovery — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)

## What & Why

Protect rollout risk #6 with browser tests for retained form entries, explicit
discard consent and safe recovery from uncertain operations. Existing server
checks cannot prove these hydrated interactions. The author approved this plan
on 2026-10-15 and requested saving it without starting implementation.

## Starting Point

Node contracts, SQL tests and production-preview HTTP smoke already protect
server behavior. Playwright is not configured. Stock has an active-form uncertainty
guard and navigation reread; prints additionally retain a collection-level guard
through panel changes and failed refreshes, with consent before discarding drafts.

## Desired End State

One focused Chromium suite proves these existing recovery behaviors against a
fresh production preview and real local Supabase. It runs as a required CI step,
cleans up its fixtures and leaves cookbook patterns and actual verification
evidence for future test authors.

## Key Decisions Made

| Decision            | Choice                                            | Why                                                                    | Source                      |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------- |
| Delivery            | One implementation phase, four ordered work steps | Keeps infrastructure, behavior tests and integration coherent.         | Author-approved outline     |
| Test boundary       | Real auth/persistence; HTTP fault injection       | Proves visible recovery while retaining real committed data.           | Research / approved outline |
| Stock versus prints | Preserve their existing contracts                 | Stock has no print-style discard or collection-wide guard requirement. | Research / approved outline |
| Conflict oracle     | Real winner at 90 g, stale browser draft at 100 g | Independently grounded expected values expose lost-input regressions.  | Archived print contract     |
| Exclusion           | Preserve skipped print F1                         | The author accepted the refresh-first/write-overlap tradeoff.          | Archived review / rollout   |
| Test-plan §2        | Defer the separate wording backport               | Plan approval did not separately answer the backport question.         | Approval scope              |
| Current action      | Save documents only                               | Implementation awaits a later author request.                          | Latest author instruction   |

## Scope

**In scope:** runner/configuration, local authenticated fixtures, stock validation
and explicit retry, pending locks, committed writes with unreadable replies,
print conflict/consent, failed-read recovery, generic-retry F2 and uncertain deletes.

**Out of scope:** production behavior changes, migrations, visual tests,
reservations/settlement, reopening F1, hosted mutations and deployment.

## Architecture / Approach

Playwright owns build and preview. Tests use isolated browser contexts and real
local sessions, with unique fixture records and checked cleanup. A fault scenario
can commit a real request before masking its reply; visible state and independent
reads then prove protection. No internal React-state mocks are required.

## Phases at a Glance

| Phase                                        | What it delivers                                                                             | Key risk                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1. Browser recovery coverage and integration | Configure runner/auth; add stock cases; add print cases; wire CI, cookbook and verification. | Lost drafts or unsafe repeated mutations after failures. |

**Prerequisites:** Node from `.nvmrc`, local Supabase/Mailpit and app configuration;
the selected preview port is free. A later author request starts implementation.
**Estimated effort:** One medium-sized implementation phase with four work steps;
browser setup and integration failures may require focused investigation.

## Open Risks & Assumptions

- Local access tokens expire after 120 seconds; independent contexts need usable
  real sessions rather than indefinitely sharing one saved refresh-token copy.
- HTTP fault injection models acknowledgement loss, not an actual provider outage.
- Local browser results cannot establish that hosted CI has run successfully.

## Success Criteria (Summary)

- Browser recovery scenarios, native checks and existing HTTP smoke pass.
- Deliberate regressions make the corresponding tests fail, and source is restored.
- CI/cookbook evidence is accurate; the author confirms final closeout.
