---
project: PrintPlan
context_type: greenfield
product_type: web-app
target_scale:
  users: small
created: 2026-10-09
updated: 2026-10-09
timeline_budget:
  mvp_weeks: 3
  hard_deadline: 2026-11-04
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: Primary need
      decision: Check whether enough material is available for a specific print and select a spool; planning multiple prints is not the primary goal.
    - topic: Initial stock on an opened spool
      decision: Use approximate spool markings or try weighing the spool; deliberately underestimate the entered amount when uncertain.
    - topic: Access and roles
      decision: Email-and-password registration and login; each user accesses only their own spools and prints; one user type with no additional roles.
    - topic: First working flow
      decision: Log in, add a 150 g spool and an 80 g print, reserve 88 g with a 10% margin, reject another identical reservation, and release material when the first reservation is cancelled.
    - topic: Delivery timeline
      decision: First working version in one week and the complete MVP in three weeks; the weekly budget is 20 hours including reading learning materials.
    - topic: Stock corrections that conflict with reservations
      decision: Reservations must not exceed recorded stock; the user must cancel enough reservations before reducing stock below the total active reservations.
    - topic: Single settlement
      decision: A completed print can be settled only once; retrying the operation does not deduct filament again.
    - topic: MVP requirements
      decision: The original seven capabilities are mandatory; the account-level safety-margin setting was subsequently approved as an eighth mandatory capability.
    - topic: Project language
      decision: Write all project content in English and translate existing Polish project content.
    - topic: Account scope challenge (FR-001)
      decision: Keep simple registration and login with no additional roles despite the added scope for an initially personal use case.
    - topic: Deleting a reserved spool (FR-002)
      decision: Deleting a spool automatically cancels its active reservations.
    - topic: Editing a reserved print (FR-003)
      decision: Recalculate the reservation automatically after editing the print; if no eligible spool exists, save the edit and release the old reservation.
    - topic: Stock display challenge (FR-005)
      decision: Show recorded stock, reserved grams, and available grams with brief explanations of each value.
    - topic: Cancellation after printing has started (FR-006)
      decision: Cancellation only releases the reservation; if filament was consumed, the user separately corrects the recorded spool stock.
    - topic: Best-fit and manual override (FR-004)
      decision: Keep best-fit and a safety margin defaulting to 10%, communicate that suggestions depend on entered estimates, and allow the user to choose another eligible spool manually. The margin is now configurable at account level.
    - topic: Actual consumption conflicting with other reservations (FR-007)
      decision: Settle actual consumption and cancel other reservations newest first, stopping as soon as the remaining reservations fit the remaining stock.
    - topic: Failed recalculation after editing a reserved print
      decision: Save the edited print, release the previous reservation, and leave the print unreserved with an insufficient-material message if no spool is eligible.
    - topic: Manual choice and later print edits
      decision: Allow manual selection before confirming a reservation; after later edits, retain the selected spool if it is still eligible, otherwise attempt best-fit.
    - topic: Consumption exceeding recorded stock
      decision: Allow settlement, set estimated remaining stock to 0 g, cancel all other reservations on that spool, and explain that consumption exceeded the entered estimate rather than claiming the physical spool is empty.
    - topic: Observable quality requirements
      decision: Support all MVP functions on desktop and phone, support current Chrome and Firefox on desktop, preserve data across refreshes and logins, and inform users which reservations were automatically cancelled.
    - topic: Initial user scale
      decision: The author and possibly a few other users.
    - topic: Working-hours arrangement
      decision: The project is developed outside regular working hours, within the weekly 20-hour budget that includes learning materials.
    - topic: Configurable safety margin (FR-008)
      decision: One account-level setting defaults to 10%; new reservations and recalculation after print edits use the current setting; changing the setting alone does not alter existing reservations. The same margin applies to best-fit and manual spool selection.
    - topic: Final non-goals review
      decision: Keep the previously stated exclusions except that an account-level configurable margin is now included in the MVP; per-print margin settings remain outside the scope.
  frs_drafted: 8
  quality_check_status: accepted
---

## Vision & Problem Statement

A hobbyist occasionally prints models requested by family members or created for household needs. They do not regularly plan prints and do not remember how many grams of filament remain on opened spools. Before a specific print, they want to check whether enough material is available and select a spool. The confirmed primary problem is uncertainty about stock; conflicting reservations across multiple jobs were an anticipated problem in the initial idea rather than a reported incident.

PrintPlan should support this decision using manually entered stock and the requirements of a specific print. The author intends to use approximate spool markings or try weighing spools when markings are unavailable. Because measurements may be unreliable, they intend to deliberately underestimate recorded stock to increase the chance that enough material remains. The entered amount is an estimate rather than a verified physical measurement.

## User & Persona

Primary user: a 3D-printing hobbyist with several filament spools and one printer. The author describes their own use: infrequent printing for family members or household needs. They reach for the application before a specific print to check material sufficiency and select a spool. Data entry is manual. The initial user base is the author and possibly a few other users.

## Success Criteria

### Primary

- With the default 10% margin, a user can log in, add a spool with 150 g of recorded stock and a print requiring 80 g, and reserve 88 g. Another identical print cannot reserve material from that spool and receives an insufficient-material message. Cancelling the first reservation allows the second print to reserve material.
- A user can settle a completed print using actual consumption. Recorded stock is reduced by that consumption, the print's reservation is released, and retries do not deduct consumption again. If other reservations no longer fit, they are cancelled newest first until the remaining reservations fit. If consumption exceeds recorded stock itself, stock becomes 0 g, all other reservations on that spool are cancelled, and the user is informed that the entered estimate was exceeded.

### Secondary

The author has not specified an additional goal; the confirmed scope covers the primary flow and actual-consumption settlement.

### Guardrails

- Total active reservations must not exceed recorded spool stock. If a proposed stock correction would violate this condition, the user must cancel enough reservations first.
- Each print is settled only once. Repeated clicks or retries must not deduct consumption again.

## User Stories

### US-01: Reserve material without double booking

- **Given** a logged-in user with the default 10% account margin, a matching spool containing 150 g of recorded stock, and two planned prints requiring 80 g each
- **When** the user reserves material for the first print
- **Then** the application reserves 88 g, including the 10% safety margin, and another identical reservation cannot be made from the same spool

#### Acceptance Criteria

- The first reservation leaves 62 g available on the spool.
- Attempting the second reservation reports insufficient material without adding another reservation.
- Cancelling the first reservation releases its 88 g.
- The user can then reserve material for the second print.

### US-02: Change the account margin without changing existing reservations

- **Given** a user with an existing 88 g reservation for an 80 g print, created with a 10% margin
- **When** the user changes the account margin to 5%
- **Then** the existing reservation remains 88 g, while new reservations and recalculation after print edits use the current 5% margin

#### Acceptance Criteria

- Changing the setting alone does not recalculate existing reservations.
- A new reservation for an 80 g print requires 84 g when enough eligible material is available.
- Best-fit and manual spool selection apply the same configured margin.

These stories format flows and rules approved by the author. Additional edge-case scenarios can be detailed during planning.

## Functional Requirements

The original seven capabilities and the subsequently added account-level margin setting are mandatory. The counter-arguments and accepted resolutions are recorded for all eight requirements. FR-004 includes the author's requested manual spool override.

### Account access

- FR-001: User can register and log in using email and password to access only their own data. Priority: must-have
  > Socrates: Counter-argument considered: accounts add scope even though the application initially serves the author. Resolution: keep simple registration and login with no additional roles.

### Spools and planned prints

- FR-002: User can create, read, update, and delete filament spools. Priority: must-have
  > Socrates: Counter-argument considered: deleting a spool with reservations can leave planned prints without a usable assignment. Resolution: deleting a spool automatically cancels its active reservations.
- FR-003: User can create, read, update, and delete planned prints. Priority: must-have
  > Socrates: Counter-argument considered: editing a reserved print can change its material requirements and invalidate the reservation. Resolution: recalculate the reservation automatically; if no eligible spool exists, save the edit, release the previous reservation, and leave the print unreserved with an insufficient-material message.

### Material reservations

- FR-004: User can reserve material for a selected print using a default best-fit spool selection or a manually chosen eligible spool, with the configured account safety margin. Priority: must-have
  > Socrates: Counter-argument considered: best-fit relies on approximate stock and cannot guarantee that physical filament will be sufficient. Resolution: retain best-fit and a margin defaulting to 10%, explain that the suggestion depends on entered estimates, and allow an eligible manual choice before reservation confirmation. After later print edits, retain that spool if it remains eligible under the current account margin; otherwise attempt best-fit.
- FR-005: User can view recorded spool stock, reserved grams, and available grams. Priority: must-have
  > Socrates: Counter-argument considered: showing three values for a spool can confuse the user. Resolution: retain all three values with brief explanations.
- FR-006: User can cancel a material reservation. Priority: must-have
  > Socrates: Counter-argument considered: cancelling after physical printing has started can leave consumed material unrecorded. Resolution: cancellation only releases the reservation; the user separately corrects recorded spool stock if material was consumed. The stock-correction guardrail still applies.

### Actual consumption

- FR-007: User can settle a completed print by entering its actual filament consumption, automatically cancelling other reservations that no longer fit the remaining stock. Priority: must-have
  > Socrates: Counter-argument considered: actual consumption can exceed the reservation and leave too little material for other reserved prints. Resolution: settle actual consumption and automatically cancel other reservations newest first, stopping when the remaining reservations fit the remaining stock.

### Account preferences

- FR-008: User can configure an account-level safety margin, defaulting to 10%, for new reservations and recalculation after print edits. Priority: must-have
  > Socrates: Counter-argument considered: configurable margins add scope and can unexpectedly change existing reservations. Resolution: use one account-level setting rather than per-print settings; changing the setting alone does not alter existing reservations. New reservations and recalculation after print edits use the current setting.

## Non-Functional Requirements

- All MVP functions are usable on desktop computers in current Chrome and Firefox versions and on phones.
- Recorded data remains available after a page refresh, logout, and subsequent login.
- Users are informed which reservations were automatically cancelled.
- When actual consumption exceeds recorded stock, users are informed that the entered estimate was exceeded; the application does not claim that the physical spool is necessarily empty.

## Business Logic

PrintPlan selects an eligible filament spool for a specific print using best-fit by default, applies the user's configured safety margin, and prevents the same recorded grams from being reserved for multiple prints.

The inputs are manually entered spool stock, a print's material, colour, and filament requirement, and an account-level safety margin defaulting to 10%. Stock is an estimate and may be deliberately understated. Before confirming a reservation, the user can accept the best-fit choice or manually choose another eligible spool; both apply the same margin. Changing the margin alone leaves existing reservations unchanged. New reservations and recalculation after print edits use the current setting. Recorded stock, reserved grams, and available grams are shown separately with explanations; suggestions depend on the entered estimates.

Reserving material does not consume it. Cancellation releases the reservation without changing recorded stock; if a cancelled print consumed material, the user corrects stock separately. A manual stock correction that would reduce stock below active reservations requires the user to cancel enough reservations first. Deleting a spool automatically cancels its active reservations. When a reserved print is edited, a manually selected spool is retained if it remains eligible; otherwise best-fit is attempted. If no spool is eligible, the edit is saved and the old reservation is released, leaving the print unreserved with an insufficient-material message.

A completed print is settled by deducting actual consumption from recorded stock and releasing its reservation, and the same print cannot be settled twice. If settlement leaves insufficient material for other reservations, other reservations are cancelled newest first until the remaining reservations fit the remaining stock. If actual consumption exceeds recorded stock itself, settlement is allowed, estimated stock becomes 0 g, and all other reservations on the spool are cancelled. The user is informed that the entered stock estimate was exceeded; 0 g is not a claim that the physical spool is necessarily empty.

## Access Control

Users register and log in using email and password. Each user can access only their own spools and prints. The MVP has one user type and no additional roles. Behaviour when an unauthenticated person attempts to access protected content remains to be clarified.

## Non-Goals

These exclusions come from the author's initial description and accepted scope decisions. The initially deferred configurable margin was subsequently included as an account-level setting.

- Printer integration and automatic device data collection: input is manual.
- Reading G-code or 3MF files: print requirements are entered manually.
- Printer-farm management: the use case assumes one printer.
- Advanced optimisation across all combinations of prints: the MVP selects a spool for one requested print at a time.
- Paid API integrations: explicitly excluded by the author.
- Print priorities and automatic recalculation of the entire queue after every change: deferred to keep the first version focused. Recalculation of a single reservation after editing its print remains in scope.
- Per-print safety-margin settings: one account-level setting was selected to keep configuration simple.

## Open Questions

1. **How should protected content behave when accessed without logging in?** Owner: author. Resolve before implementation; access to other users' data is already excluded by the confirmed access model.
2. **Which margin values and numeric rounding rules should be accepted?** Owner: author. Resolve during implementation planning; no percentage bounds or numeric precision have been selected during discovery.
3. **How should equal best-fit results and reservations with equal creation times be ordered?** Owner: author. Resolve during implementation planning; best-fit and newest-first cancellation are confirmed, but tie-breaking rules have not been chosen.

## Seed idea

Translated from the author's initial description at their request. The project name reflects their later decision. This is the initial idea, not the final scope.

> PrintPlan is a simple web application for 3D-printing hobbyists who own several filament spools and want to plan prints while accounting for available material.
>
> The main problem: a user has several opened spools and a list of models to print. They want to know which prints they can complete, how to make good use of available filament, and how to avoid reserving the same material for multiple jobs.

## Session status

Phases 1–7 are complete. Eight functional requirements are confirmed as must-have, including the account-level margin setting. The author accepted the closing quality cross-check and requested completion. Discovery is finalized and ready for handoff to /10x-prd. No PRD or detailed architecture has been created.

## Quality cross-check

- Access Control: present; email-and-password accounts, isolated user data, one user type.
- Business Logic: present; one-sentence rule followed by confirmed reservation and settlement policies.
- Project artifacts: present; this document has a checkpoint and confirmed greenfield context.
- Timeline-cost acknowledgment: present; the author accepted a three-week MVP and an after-hours weekly budget of 20 hours including learning materials.
- Non-Goals: present; explicit exclusions reflect the accepted configurable-margin addition.
- Preserved behavior: not applicable to a greenfield project.

No closing-gate gaps were found. The author accepted the result. The open questions above remain explicit downstream decisions rather than assumed product rules.

## Timeline notes

First working version: one week. Complete MVP: three weeks. The author has 20 hours per week outside regular working hours, including reading learning materials, and is targeting 4 November 2026.

## Forward: tech-stack

The author wants a simple database and explicitly excludes an elaborate database. No technology has been selected.
