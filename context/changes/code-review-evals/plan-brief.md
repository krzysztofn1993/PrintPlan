# Code Reviewer Evaluations — Plan Brief

> Full plan: [plan.md](plan.md)
> Research: [research.md](research.md)
> Current verification and run evidence: [verification.md](verification.md)

## What & Why

The harness was extended from six development cases to twelve author-accepted holdout cases. This brief records the historical and holdout runs, the current harness contract, and the remaining decisions. The checked-in approval remains disabled.

## Historical Run

- 36/36 responses completed with known usage; no operational errors or `not-run` cells.
- Each model matched oracle verdicts in 18/18 trials: 30/30 defective reviews were `fail`, and 6/6 safe controls were `pass`.
- Assertions passed 34/36 (17/18 per model). The two misses are verdict-matching, relevant findings for Luna case-02 repetition 3 and Sol case-03 repetition 3; their consequence wording was not accepted by current anchors.
- Observed cost was $0.1402725: Luna $0.0089325 and Sol $0.13134. Median/p95 duration was Luna 5.069/25.955 s and Sol 6.436/11.976 s.
- Assertions were edited after answers from these same cases were inspected. Treat 34/36 as historical diagnostic evidence, not an independent quality score or model-selection result.

## Holdout Run

- The accepted 12-case comparison completed all 72 requests: zero operational errors, zero `not-run` cells, and known usage for every response.
- Sol matched 36/36 oracle verdicts; Luna matched 33/36. Luna's three misses were all case-09, where it marked the confirmation bypass `pass`; Sol identified the bypass in all three repetitions.
- End-to-end evaluation passed 34/36 Sol cells and 31/36 Luna cells. Four other assertion misses were relevant findings whose wording did not match the deterministic consequence anchors; do not tune anchors to these observed answers.
- Estimated cost was $0.270941: Sol $0.254570 and Luna $0.016371. Median/p95 duration was 6.196/14.056 s for Sol and 5.395/14.487 s for Luna. Actual billing may differ.
- Recommendation: prefer Sol for a bounded, human-reviewed pilot. This curated 12-case set is not a statistical benchmark and does not justify a recurring gate or branch-protection change.

The combined verdict confusion counts are TP 33, TN 36, FP 0, FN 3. These are repeated response cells over six unique defect cases and six unique safe cases; the three misses are one Luna case-09 scenario repeated three times. The counts support verdict-level comparison on this curated set. They do not score unsupported allegations in summary text; the author separately reviewed all 72 saved summaries case by case and found no unsupported or unrelated allegations.

| Model         | TP / 18 defect responses | FN / 18 defect responses | TN / 18 safe responses | FP / 18 safe responses | Defect fixtures hit | Safe fixtures passed |
| ------------- | -----------------------: | -----------------------: | ---------------------: | ---------------------: | ------------------: | -------------------: |
| `gpt-6-luna`  |                       15 |                        3 |                     18 |                      0 |               5 / 6 |                6 / 6 |
| `gpt-6.1-sol` |                       18 |                        0 |                     18 |                      0 |               6 / 6 |                6 / 6 |

The seven failed deterministic assertions comprise three wrong verdicts (all Luna case-09 repetitions) and four verdict-matching text-anchor misses (Luna case-07 rep 1 and case-11 rep 3; Sol case-07 reps 1 and 3). Repetition counts are not independent fixture counts. These assertion results are separate from the completed human audit of unsupported summary allegations.

## Current Corpus and Run Shape

The original six cases remain the development set. Twelve holdout cases (07–18) are based on six historical change areas, each with one defect regression and one safe correction: HTTPS cookie security, preserving unsaved print edits during a failed list-refresh retry, rename-aware diff handling, validation of both returned reservation amounts against the configured margin, retry recovery wording, and access to saved settlement results. These are controlled fixtures grounded in historical revisions, not verbatim historical PRs.

The author accepted all twelve holdout oracle outcomes and the shared pass/fail rubric on 2026-11-01. Cases 09–10 cover the product-level lost-edit regression and its safe correction, grounded in the historical fix and author-confirmed manual behavior recorded in the repository. The former GitHub fork-eligibility pair was removed as unnecessary workflow testing. Do not fit assertions to holdout responses.

| Run                          | Case set            | Models | Requests | Conservative reserve | Cost status                   |
| ---------------------------- | ------------------- | -----: | -------: | -------------------: | ----------------------------- |
| Historical comparison        | 6 development cases |      2 |       36 |              $1.9656 | $0.1402725 observed           |
| Completed holdout comparison | 12 holdout cases    |      2 |       72 |              $3.9312 | $0.270941 observed estimate   |
| Later full comparison        | All 18 cases        |      2 |      108 |              $5.8968 | ~$0.4208175 linear projection |
| Later full comparison        | All 18 cases        |      3 |      162 |              $8.8452 | ~$0.6312263 linear projection |
| Hypothetical larger corpus   | 24 cases            |      2 |      144 |              $7.8624 | ~$0.56109 linear projection   |
| Later recurring gate         | All 18 cases        |      1 |       54 |              $2.9484 | Separate cycle-bound approval |

The reserve is $0.0546 per request, calculated from the current dated uncached price record and preflight token allowances. It is an admission reserve, not a bill or provider-enforced ceiling. Costs of the six-case and 12-case runs are observed token-based estimates; linear projections do not guarantee another run's cost. The author stated $20.50 was available and approved a $4.50 cap for the 72-call holdout run. The provider token was reported to expire after one day, and the separate approval policy enforces a maximum 24-hour approval lifetime. The author reports GitHub credential validity through 2026-11-07. The checked-in `approval.json` remains disabled.

## Code and Workflow State

`cases/catalog.mjs` lists the six development and twelve holdout IDs. Comparison approvals bind exact `caseIds`; the completed holdout run selected 07–18. A gate must select all 18 IDs. Runtime and schema ceilings are 162 comparison calls and 54 gate calls; a 24-case corpus is outside the current catalog and approval schema. The report includes selected case IDs. `github/checks.mjs` expects 54 successful cells for a full-corpus gate.

The current implementation includes the catalog, accepted oracle metadata, fixtures, request-limit changes, and case-09 anchors/source-pair tests. It retains `runner.mjs` as the trusted approval, budget, and report boundary and uses Promptfoo as the compare/gate matrix engine. The production reviewer transport uses Vercel AI SDK 7 with the OpenAI Responses provider. The saved 72-response live comparison remains historical evidence from the earlier custom-runner/direct-API path; a no-network Promptfoo replay exercises those saved responses without new inference. The offline checks now prove that a consumed local approval is rejected in a separate process before any provider request (2.7), and that stalled cloned error-response metadata cannot outlive the SDK request deadline (2.10). The checked-in approval remains disabled. The separately authorized one-request SDK demonstration and existing PR #39 screenshots are complete. The author reviewed all 72 summaries case by case and found no unsupported allegations (4.9). No recurring gate, hosted workflow, or branch-protection change is enabled. The author confirmed the trusted bootstrap is on `master`; Phase 3.5 applies only if a hosted evaluation is later requested, which would require a fresh exact manifest and approval.

## Author Decisions Still Required

1. **Complete:** The author accepted the six original oracle outcomes and confirmed the historic 36 answers need no second review.
2. **Complete:** The author accepted all twelve holdout oracles and the shared rubric on 2026-11-01.
3. **Complete:** The author accepted the exact manifest and the 72-request run completed within the $4.50 cap.
4. No recurring gate or branch-protection decision is needed for this pilot. Revisit only if a concrete future need arises.

## Next Workflow

Use `gpt-6.1-sol` as the preferred model for a bounded manual-review pilot, with human review retained. Per-model holdout metrics come from the saved report and require no provider calls. The SDK-backed synthetic-diff demonstration, existing Champion pipeline/log/PR-comment screenshots, and author audit of all 72 summaries are complete. The grouped audit record is in [summary-audit.md](reviews/summary-audit.md). Course reviewers decide whether the adapted implementation meets submission criteria. No additional paid comparison, recurring gate, or branch-protection change is authorized by this result.
