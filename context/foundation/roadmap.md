---
project: PrintPlan
version: 2
status: draft
created: 2026-10-09
updated: 2026-10-09
prd_version: 2
main_goal: speed
top_blocker: decisions
milestone_id: usable-filament-planning
milestone_seq: 1
milestone_status: open
---

# Roadmap: PrintPlan

> Derived from context/foundation/prd.md (v2), supplementary discovery and stack decisions, and the auto-researched, user-confirmed codebase baseline.
> Edit in place; archive when superseded.
> Items are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: Usable filament planning** — Status: open

- **Intent:** Deliver the complete declared MVP: users can keep private spool stock and planned prints, reserve available material, adjust their account margin, and settle actual consumption without double booking or double deduction.
- **Source materials:** `context/foundation/prd.md` (v2); supplementary `context/foundation/shape-notes.md` and `context/foundation/tech-stack.md`.
- **Done when:** every F-NN and S-NN below is `done`; both primary PRD success flows pass, including the 150 g / 80 g reservation example and retry-safe settlement.
- **Scope anchors:** FR-001–FR-008, US-01–US-02, Access Control, Business Logic, and the four unnumbered Non-Functional Requirements.

## Vision recap

Before a specific print, a hobbyist wants to check whether enough material is available and select a spool. PrintPlan supports this decision using manually entered stock and print requirements. Entered stock is an estimate rather than a verified physical measurement.

## North star

Here, the north star means the smallest complete user flow that demonstrates the product's intended value.

**S-03: Reserve and release material safely** — Deliver the first primary success flow as soon as account access, spool stock, and planned prints permit it: reserve 88 g from 150 g for an 80 g print, reject an identical second reservation, then release the first reservation so the second can succeed.

The sequencing goal is `speed`, confirmed by the author. The principal constraint is `decisions`: the author must resolve the numeric and ordering policies listed below. Invest in data and operation correctness because PRD guardrails prohibit overbooking and repeated deductions; keep frontend and infrastructure scope minimal.

## At a glance

| ID   | Change ID                    | Outcome (user can …)                                                                                                                                                                        | Prerequisites | PRD refs                                                                                                   | Status   |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| F-01 | verified-account-access      | (foundation) the existing account integration is configured and verified for registration, login, cookie sessions, and the agreed protected-page redirect.                                  | —             | FR-001, Access Control                                                                                     | ready    |
| F-02 | hosted-auth-verification     | (foundation) a hosted instance can run the existing account smoke checks and support verification of persistent product data.                                                               | F-01          | FR-001, Non-Functional Requirements: persistence across refreshes and logins                               | proposed |
| S-01 | personal-filament-stock      | user can add, view, correct, and delete their own unreserved spools, with material, colour, estimated stock, and explained recorded, reserved, and available grams.                         | F-01          | FR-001, FR-002, FR-005                                                                                     | proposed |
| S-02 | personal-planned-prints      | user can create, view, edit, and delete their own unreserved planned prints with material, colour, and required grams.                                                                      | F-01          | FR-001, FR-003                                                                                             | proposed |
| S-03 | reserve-and-release-material | user can reserve material through best-fit or an eligible manual choice with the default 10% margin, see insufficient-material feedback, and cancel a reservation to release its grams.     | S-01, S-02    | US-01, FR-004, FR-005, FR-006                                                                              | blocked  |
| S-04 | account-safety-margin        | user can change their account margin while existing reservations retain their grams and new best-fit or manual reservations use the new value.                                              | S-03          | US-02, FR-004, FR-008                                                                                      | blocked  |
| S-05 | edit-reserved-print          | user can edit a reserved print using the current account margin, retain a manually selected spool when eligible, otherwise use best-fit, and save the print unreserved when no spool fits.  | S-03, S-04    | US-02, FR-003, FR-004, FR-008                                                                              | blocked  |
| S-06 | maintain-reserved-spool      | user can correct a reserved spool's recorded stock subject to the reservation guardrail, or delete it and see which reservations were automatically cancelled.                              | S-03          | FR-002, FR-005, FR-006, Non-Functional Requirements: automatic cancellation feedback                       | proposed |
| S-07 | settle-print-consumption     | user can settle a completed print once, deduct actual consumption, release its reservation, and see other reservations cancelled newest first until they fit the remaining estimated stock. | S-03          | FR-007, FR-005, FR-006, Non-Functional Requirements: automatic cancellation and exceeded-estimate feedback | blocked  |

## Streams

Navigation aid: each item appears once. Arrows show dependencies; ∥ marks independent branches after their shared prerequisite. The item prerequisites below remain authoritative.

| Stream | Theme                             | Chain                                                                       | Note                                                                              |
| ------ | --------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| A      | Personal stock and print workflow | `F-01` → (`S-01` ∥ `S-02`) → `S-03` → ((`S-04` → `S-05`) ∥ `S-06` ∥ `S-07`) | Deliver S-03 first, then finish the remaining required capabilities.              |
| B      | Hosted verification               | `F-02`                                                                      | Joins Stream A at F-01; enables hosted verification while product work continues. |

## Baseline

What's already in place as of `2026-10-09`, auto-researched and confirmed by the author. Existing scaffolding is reused.

- **Frontend:** present — per tech-stack.md: the selected interface and routing scaffold exists; astro.config.mjs:10 and package.json.
- **Backend / API:** present — per tech-stack.md: server-rendered routes and account endpoints exist; src/pages/api/auth/signin.ts:1 and src/middleware.ts:6. Domain operations are still to be built.
- **Data:** partial — per tech-stack.md: persistence is selected, but product tables, migrations, and per-user isolation policies are still required; context/foundation/tech-stack.md:24.
- **Auth:** partial — per tech-stack.md: registration/login routes, cookie sessions, and protected-page handling exist; src/lib/supabase.ts:5 and src/middleware.ts:18. The bootstrap log records that backend configuration and the authentication smoke test were not completed; context/changes/bootstrap-verification/verification.md:167.
- **Deploy / infra:** partial — per tech-stack.md: hosting configuration and CI checks exist; wrangler.jsonc:1 and .github/workflows/ci.yml:1. Hosting integration and deployment were not configured or verified; context/changes/bootstrap-verification/verification.md:1035.
- **Observability:** partial — hosting observability is enabled in wrangler.jsonc:12; no application error-tracking, logging, metrics, or dashboard instrumentation was found. Deployed behavior remains unverified; context/changes/bootstrap-verification/verification.md:1047.

No domain glossary, lessons document, or technical-roadmap forwarding section was found. Domain terms come from the PRD's Business Logic and Functional Requirements.

## Foundations

### F-01: Verify configured account access

- **Outcome:** (foundation) the existing account integration is configured and verified for registration, login, cookie sessions, and the agreed protected-page redirect.
- **Change ID:** verified-account-access
- **PRD refs:** FR-001, Access Control
- **Unlocks:** S-01 and S-02; authenticated verification of the US-01 reservation flow.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Product slices need verified identity; reuse the scaffold and defer domain-data ownership checks to the first slices that persist that data.
- **Status:** ready

### F-02: Enable a hosted verification path

- **Outcome:** (foundation) a hosted instance can run the existing account smoke checks and support verification of persistent product data.
- **Change ID:** hosted-auth-verification
- **PRD refs:** FR-001, Non-Functional Requirements: persistence across refreshes and logins
- **Unlocks:** Hosted account-session verification for S-01 and S-02, followed by the US-01 verification path in S-03.
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02, S-03, S-04, S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The hosting configuration has not been exercised; establish only the deployment and verification path, while product slices still integrate and verify their own behavior.
- **Status:** proposed

## Slices

All slices include their own persistence, business behavior, access isolation, and usable interface. Each must work on phones and in the PRD's supported desktop browsers, and retain data across refreshes and later logins. Introduce domain persistence and ownership protection within S-01/S-02, reservation correctness within S-03, and settlement correctness within S-07.

S-01/S-02 initially support unreserved records. When S-03 introduces reservations, it also makes existing mutation paths safe: reject stock reductions below reserved grams and cancel reservations when a reserved spool or planned print is deleted. S-05 and S-06 deliver the complete reservation-aware editing flows and cancellation feedback. Refs repeated across slices denote incremental coverage; early slices do not claim to satisfy the entire referenced requirement.

### S-01: Record and inspect filament stock

- **Outcome:** user can add, view, correct, and delete their own unreserved spools, with material, colour, estimated stock, and explained recorded, reserved, and available grams.
- **Change ID:** personal-filament-stock
- **PRD refs:** FR-001, FR-002, FR-005
- **Prerequisites:** F-01
- **Parallel with:** F-02, S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Stock is an estimate; establish persistent, user-isolated inventory without suggesting that entered grams are a physical guarantee.
- **Status:** proposed

### S-02: Maintain planned prints

- **Outcome:** user can create, view, edit, and delete their own unreserved planned prints with material, colour, and required grams.
- **Change ID:** personal-planned-prints
- **PRD refs:** FR-001, FR-003
- **Prerequisites:** F-01
- **Parallel with:** F-02, S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Print requirements must persist and remain private before they can safely drive reservations; reservation-aware editing follows in S-05.
- **Status:** proposed

### S-03: Reserve and release material safely

- **Outcome:** user can reserve material through best-fit or an eligible manual choice with the default 10% margin, see insufficient-material feedback, and cancel a reservation to release its grams.
- **Change ID:** reserve-and-release-material
- **PRD refs:** US-01, FR-004, FR-005, FR-006
- **Prerequisites:** S-01, S-02
- **Parallel with:** F-02
- **Blockers:** —
- **Unknowns:**
  - Which numeric precision and rounding rule should reservation calculations use? (PRD question 1) — Owner: author. Block: yes.
  - How should equally eligible best-fit spools be ordered? (PRD question 2) — Owner: author. Block: yes.
- **Risk:** The 150 g / 80 g / 88 g acceptance flow must hold under competing requests; reserve and release form one reversible workflow, with stock corrections below reservations rejected and reserved spool/print deletion safely cancelling reservations.
- **Status:** blocked

### S-04: Configure the account safety margin

- **Outcome:** user can change their account margin while existing reservations retain their grams and new best-fit or manual reservations use the new value.
- **Change ID:** account-safety-margin
- **PRD refs:** US-02, FR-004, FR-008
- **Prerequisites:** S-03
- **Parallel with:** F-02, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Which percentage bounds and input precision are allowed, using the agreed reservation rounding rule? (PRD question 1) — Owner: author. Block: yes.
- **Risk:** A settings change must not silently resize existing reservations; verify 88 g remains reserved while a new 5% reservation requires 84 g.
- **Status:** blocked

### S-05: Recalculate a reservation after editing its print

- **Outcome:** user can edit a reserved print using the current account margin, retain a manually selected spool when eligible, otherwise use best-fit, and save the print unreserved when no spool fits.
- **Change ID:** edit-reserved-print
- **PRD refs:** US-02, FR-003, FR-004, FR-008
- **Prerequisites:** S-03, S-04
- **Parallel with:** F-02, S-06, S-07
- **Blockers:** —
- **Unknowns:**
  - Which agreed margin, rounding, and best-fit tie rules should govern recalculation? (PRD questions 1 and 2) — Owner: author. Block: yes.
- **Risk:** Recalculation must release or replace the prior reservation as one change without transient overbooking; explain when the saved print has become unreserved.
- **Status:** blocked

### S-06: Maintain a spool that has active reservations

- **Outcome:** user can correct a reserved spool's recorded stock subject to the reservation guardrail, or delete it and see which reservations were automatically cancelled.
- **Change ID:** maintain-reserved-spool
- **PRD refs:** FR-002, FR-005, FR-006, Non-Functional Requirements: automatic cancellation feedback
- **Prerequisites:** S-03
- **Parallel with:** F-02, S-04, S-05, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** A reduction below reserved grams must require cancellation first; deletion must leave affected prints unreserved and identify the cancellations.
- **Status:** proposed

### S-07: Settle actual consumption once

- **Outcome:** user can settle a completed print once, deduct actual consumption, release its reservation, and see other reservations cancelled newest first until they fit the remaining estimated stock.
- **Change ID:** settle-print-consumption
- **PRD refs:** FR-007, FR-005, FR-006, Non-Functional Requirements: automatic cancellation and exceeded-estimate feedback
- **Prerequisites:** S-03
- **Parallel with:** F-02, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - How should reservations with equal creation times be ordered during newest-first cancellation? (PRD question 2) — Owner: author. Block: yes.
- **Risk:** Retries and concurrent stock changes must preserve a single settlement; consumption above recorded stock sets the estimate to 0 g, cancels other reservations, and explains that the estimate was exceeded.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID                    | Suggested issue title                             | Ready for `/10x-plan` | Notes                                                 |
| ---------- | ---------------------------- | ------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| F-01       | verified-account-access      | Verify configured account access                  | yes                   | Run `/10x-plan verified-account-access`.              |
| F-02       | hosted-auth-verification     | Enable a hosted verification path                 | no                    | Complete F-01.                                        |
| S-01       | personal-filament-stock      | Record and inspect filament stock                 | no                    | Complete F-01.                                        |
| S-02       | personal-planned-prints      | Maintain planned prints                           | no                    | Complete F-01.                                        |
| S-03       | reserve-and-release-material | Reserve and release material safely               | no                    | Resolve blocking Unknowns and complete prerequisites. |
| S-04       | account-safety-margin        | Configure the account safety margin               | no                    | Resolve blocking Unknowns and complete prerequisites. |
| S-05       | edit-reserved-print          | Recalculate a reservation after editing its print | no                    | Resolve blocking Unknowns and complete prerequisites. |
| S-06       | maintain-reserved-spool      | Maintain a spool that has active reservations     | no                    | Complete S-03.                                        |
| S-07       | settle-print-consumption     | Settle actual consumption once                    | no                    | Resolve blocking Unknowns and complete prerequisites. |

## Open Roadmap Questions

The author resolved the access question: unauthenticated visitors opening protected pages are redirected to sign-in. F-01 is ready for planning; backend configuration and verification remain to be completed.

The remaining source questions below are retained verbatim; the appended Block labels route them to affected items.

1. **Which margin values and numeric rounding rules should be accepted?** Owner: author. Resolve during implementation planning; no percentage bounds or numeric precision have been selected during discovery. **Block:** S-03 (reservation precision and rounding), S-04 (accepted margin values), S-05 (recalculation).
2. **How should equal best-fit results and reservations with equal creation times be ordered?** Owner: author. Resolve during implementation planning; best-fit and newest-first cancellation are confirmed, but tie-breaking rules have not been chosen. **Block:** S-03 and S-05 (best-fit ties), S-07 (cancellation ties).
3. **What secondary success criteria, if any, should be specified?** Owner: author. The author has not specified an additional goal; the confirmed scope covers the primary flow and actual-consumption settlement. **Block:** none; retain the confirmed primary acceptance flows.
4. **Which non-functional qualities are explicitly outside the MVP scope?** Owner: author. No non-functional exclusions are specified in the input. **Block:** none for declared scope; preserve the four explicit quality requirements without inventing additional work.

The roadmap exposes these policies before planning. Their answers are product decisions owned by the author; implementation plans record the agreed answers rather than silently supplying defaults.

## Parked

- **Printer integration and automatic device data collection** — Why parked: PRD Non-Goals specifies manual input.
- **Reading G-code or 3MF files** — Why parked: PRD Non-Goals specifies manual print requirements.
- **Printer-farm management** — Why parked: PRD Non-Goals assumes one printer.
- **Advanced optimisation across all combinations of prints** — Why parked: PRD Non-Goals limits selection to one requested print at a time.
- **Paid API integrations** — Why parked: explicitly excluded in PRD Non-Goals.
- **Print priorities and automatic recalculation of the entire queue after every change** — Why parked: PRD Non-Goals defers these; single-print recalculation remains in S-05.
- **Per-print safety-margin settings** — Why parked: PRD Non-Goals selects one account-level setting.

All eight declared functional requirements remain in this milestone; the speed goal changes ordering rather than dropping required behavior.

## Milestone History

## Done
