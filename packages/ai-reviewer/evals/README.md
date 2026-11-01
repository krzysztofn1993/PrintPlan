# Reviewer evaluation cases

The harness catalogs six development cases (`case-01`–`case-06`) and twelve author-accepted holdout cases (`case-07`–`case-18`). Each case keeps model-visible `input.json` separate from its `oracle.json`. Inputs contain only the fields accepted by `assembleInput()`: title, body, diff, paths, and unreviewedPaths. Oracle labels, reference findings, and deterministic assertion anchors are evaluation metadata and are never sent to the reviewer.

The twelve holdout cases are controlled fixtures grounded in six historical repository changes. Each source area contributes a defect regression and a safe correction: HTTPS cookie security, preserving unsaved print edits during a failed list-refresh retry, rename-aware review input limits, reservation margin arithmetic, retry recovery messaging, and access to saved settlement results. These are not verbatim historical PR diffs. The author accepted all twelve oracle outcomes and the shared pass/fail rubric on 2026-11-01. The case-09 finding anchors and case-09/10 source-pair tests cover the accepted application behavior. The latest offline verification state is recorded in the [verification record](../../../context/changes/code-review-evals/verification.md). Do not tune these checks to model answers.

`cases/catalog.mjs` is the source of the fixed case IDs. `approval.caseIds` selects the exact cases for a comparison. A holdout-only comparison selects cases 07–18; a later candidate-prompt gate must cover all 18 cases. Every case has three repetitions.

## Development reference findings

- **case-01**: the guarded stock helper returns 62 g for 150 g recorded and 88 g reserved. Its visible finite, nonnegative, and reserved-stock checks reject malformed states. Reference verdict: `pass`.
- **case-02**: the changed addition returns 238 g for the same inputs instead of subtracting the reservation to produce 62 g. This can overstate stock available to another print. Reference verdict: `fail`.
- **case-03**: with 300 g recorded, 209 g held elsewhere, and this print's existing 88 g hold, capacity excluding the current hold is 91 g. An 84 g edited request should retain and resize the reservation. The changed checks count the current hold twice, leave only 3 g, and release the reservation. No alternative spool masks the witness. Reference verdict: `fail`.
- **case-04**: settlement above the estimate must leave stock at zero; subtracting 130 g from an estimate of 100 g without the clamp creates invalid negative stock. Reference verdict: `fail`.
- **case-05**: a retry of the same settlement request must return its saved receipt without deducting consumption twice. The changed code deducts the same amount again. Reference verdict: `fail`.
- **case-06**: when stock is short, the newest reservation must be cancelled first. The changed ordering cancels the older reservation and retains the newer one. Reference verdict: `fail`.

The original six-case comparison is historical development evidence. Its 34/36 assertion result is not an unbiased quality score because assertions changed after answers from the same cases had been inspected. See the [verification record](../../../context/changes/code-review-evals/verification.md).

## Holdout oracle review

Every holdout oracle is labeled `author-reviewed-accepted`. The accepted cases are:

| Case | Historical source                                              | Accepted oracle outcome | Review question                                                                                          |
| ---- | -------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| 07   | `bdd22fd` — secure session cookies over HTTPS                  | Defect, `fail`          | Does disabling `Secure` on HTTPS warrant rejection under the reviewer rubric?                            |
| 08   | `bdd22fd` — secure session cookies over HTTPS                  | Safe correction, `pass` | Is transport-aware `Secure` behavior correctly scoped for HTTPS and local HTTP?                          |
| 09   | `6f1f88a` — confirm discarding edits on refresh retry          | Defect, `fail`          | Does the generic retry bypass confirmation and lose unsaved edits?                                       |
| 10   | `6f1f88a` — confirm discarding edits on refresh retry          | Safe correction, `pass` | Does the generic retry preserve the normal unsaved-edit confirmation?                                    |
| 11   | `286c33c` — recognize archive moves and allow larger reviews   | Defect, `fail`          | Are the 256 KiB cap and disabled rename detection clearly evidenced risks?                               |
| 12   | `286c33c` — recognize archive moves and allow larger reviews   | Safe correction, `pass` | Is raising the cap to 1 MiB and enabling exact rename detection sufficient?                              |
| 13   | `b0602de` — resolve reservation implementation review findings | Defect, `fail`          | Is accepting 1 g in both returned fields when the 10% policy requires 110 g a clear invariant violation? |
| 14   | `b0602de` — resolve reservation implementation review findings | Safe correction, `pass` | Is the ceiling-rounded margin calculation represented faithfully?                                        |
| 15   | `3571beb` — resolve retry recovery review findings             | Defect, `fail`          | Is claiming rejection unsafe when the first write may have committed?                                    |
| 16   | `3571beb` — resolve retry recovery review findings             | Safe correction, `pass` | Does neutral stale-version wording accurately represent the recovery state?                              |
| 17   | `d440125` — preserve settlement result access                  | Defect, `fail`          | Is losing the only review action after source deletion a user-visible recovery defect?                   |
| 18   | `d440125` — preserve settlement result access                  | Safe correction, `pass` | Does an in-session review action preserve access without implying durable retention?                     |

These are controlled fixtures based on historical changes, not literal historical pull requests. The source revisions are recorded in each oracle. The author accepted each verdict, expected behavior, and shared rules for what counts as a material finding before the holdout model run. Do not revise anchors in response to holdout answers and then report the same answers as independent evidence.

## Request limits and cost

A two-model, three-repeat comparison over the twelve holdout cases schedules 72 requests. The harness permits up to 162 comparison calls (18 cases × three repetitions × three models). A later recurring one-model gate must use all 18 cases and schedules 54 calls. The checked-in `approval.json` remains disabled; limits do not authorize calls.

The observed six-case run cost $0.1402725 for 36 responses. The completed 12-case run cost an estimated $0.270941 for 72 responses. The earlier linear projection to 72 calls was about $0.280545; neither estimate guarantees the cost of another run. The conservative preflight reserve is $0.0546/request: $3.9312 for 72 holdout calls, $5.8968 for a two-model comparison across all 18 cases, and $8.8452 for 162 calls at three models. The author approved a $4.50 cap for the holdout comparison, under the stated $20.50 available balance and above the holdout reserve. The cap is an admission limit, not a provider-enforced invoice ceiling. A fresh approval must bind exact models, case IDs, prompt, runner, corpus, schema, pricing, request count, expiry, and cap. The temporary 12-hour approval was removed after the run; approval policy rejects validity windows longer than 24 hours. The author reports the GitHub credential is valid through 2026-11-07.

The completed 12-case holdout run used `gpt-6-luna` and `gpt-6.1-sol`, three repetitions, and 72 total requests. The author accepted the final digest manifest before provider calls. The provider token's one-day expiry and GitHub credential validity through 2026-11-07 were author-reported; the local run did not use a GitHub credential. Enabled approvals carry `issuedAt` and `expiresAt`; runtime rejects validity windows longer than 24 hours. The runner identity hashes trusted code and workflow inputs; the corpus identity hashes ordered model inputs, oracles, before/after witnesses, and patches. A recurring gate is separate and not approved.

## Offline harness and authorization

Install the isolated harness with `npm ci --prefix packages/ai-reviewer/evals`. Run `npm run test:ai-review-evals` for native offline cases, policy, provider, and report tests. `npm --prefix packages/ai-reviewer/evals run preflight` reports prompt and pricing identities without reading a key or making a request. `compare` and `gate` require an explicit `EVAL_APPROVAL_FILE`; the checked-in initial state intentionally has no enabled policy, numeric allowance, or default paid model.

The provider wraps the trusted `reviewChange()` path and accepts only catalogued cases and explicitly approved model IDs. Evaluation calls are sequential with three fresh repetitions, no retries, cache disabled, and no grader. Any reviewer failure, missing usage, unknown dated rate, approval mismatch, or exceeded allowance stops further inference and leaves remaining matrix cells marked `not-run`. An operational error is not a reviewer `fail` verdict. Costs use uncached Standard input/output token rates; missing token usage is unknown, never free. Reports omit credentials and raw request/response bodies and escape model text in HTML.

A future comparison report must be reviewed by a human against the accepted reference checklist; deterministic anchors are filters, not semantic proof. The original holdout-fixture offline suite passed 27/27 on 2026-11-01; the current expanded offline verification passes 31/31 as recorded in the verification document. The authorized 12-case, 72-request local comparison completed; its estimated cost was $0.270941. No hosted workflow or branch-protection setting was changed, and the checked-in approval remains disabled.

## Trusted GitHub bootstrap

`.github/workflows/reviewer-evals.yml` runs from trusted `master` code for same-repository, owner-authored prompt PRs. It fetches the PR head as Git objects and reads only the two fixed prompt blobs; it never checks out or executes candidate code. The isolated package, assertions, corpus, schema, and approval policy come from the trusted base. Inference has no GitHub permissions, and the API key is scoped to the evaluation step. Artifacts bind the workflow run and attempt and expire after seven days.

The author confirms the trusted bootstrap workflow is on `master`. The checked-in approval remains disabled, and this local comparison did not dispatch a hosted run, enable recurring spending, or edit branch protection. Any future hosted run needs a fresh exact manifest and approval; making its check required would be a separate decision.
