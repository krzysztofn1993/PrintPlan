# Verification: Static reviewer evaluations

## Current authorization and bootstrap state

The trusted evaluation workflow and 18-case catalog/selected-case harness are implemented. The author accepted all twelve holdout outcomes and the shared pass/fail rubric on 2026-11-01. The checked-in `packages/ai-reviewer/evals/approval.json` remains disabled (`enabled: false`) with no models, zero requests, and no numeric USD allowance. The temporary one-time approval for the 72-call holdout was removed after completion and does not authorize another comparison or recurring gate calls.

The existing trusted workflow is on `master`; no hosted evaluation was dispatched and no branch-protection change was made. Screenshots of the existing successful PR #39 pipeline, AI review job/log, and review comment are in `reviews/ci_run.png`, `reviews/run.png`, `reviews/run_ai_reviewer.png`, and `reviews/reviewer-coment.png`. One separately approved SDK-backed synthetic-diff request completed; its sanitized result and usage are in `reviews/sdk-smoke.json`. No further paid request is authorized.

## Offline verification evidence

The latest offline gates passed:

- `npm run test:ai-review`: **53/53 passed**, including the Vercel AI SDK adapter and its fake Responses boundary.
- `npm run test:ai-review-evals`: **31/31 passed**, including the Promptfoo CLI replay of the saved 72-response matrix and offline fake compare/gate runs.
- `npm run lint`: passed.
- `npm run build`: passed. Astro emitted its existing warning that sitemap generation is skipped because `site` is not configured.
- `git diff --check`: passed.

The Promptfoo replay records 72 saved response cells, 65 passing and 7 failing deterministic assertions, zero operational errors, zero provider request attempts, and `inferencePerformed: false`. Promptfoo reports its expected nonzero matrix result for those seven reproduced assertion failures; the replay wrapper exits successfully because replay completed and saved the report. This is integration evidence, not a new model comparison.

For 2.7, a new test starts two separate processes against one temporary approval ledger. The first consumes the approval; the second is rejected with `APPROVAL_CONSUMED` before the fake provider fetch runs. Hosted one-shot comparison remains fail-closed because this local ledger does not protect isolated workflow attempts.

For 2.10, cloned error-response metadata parsing is bounded by the request deadline. An offline test stalls the cloned error body and confirms the call returns `DEADLINE_EXCEEDED` without waiting for the body or retrying the request.

The seven replay assertion failures remain split into **three wrong reviewer verdicts** (Luna case-09 repetitions 1–3) and **four verdict-matching text-anchor misses** (Luna case-07 repetition 1 and case-11 repetition 3; Sol case-07 repetitions 1 and 3). This is separate from the unsupported-allegation audit. The author completed the case-by-case review of all 72 summaries under 4.9; no unsupported allegations were recorded, and no new provider calls were made.

## Manual verification status

- **Phase 1.4:** Complete. The author accepted the reference outcomes and limits of the original development corpus.
- **Phase 2.11:** Complete. The author approved one live SDK-backed synthetic-diff request and confirmed its sanitized result; no further request is authorized.
- **Phase 2.12:** Complete. The existing PR #39 pipeline, job/log, and reviewer-comment screenshots are captured; no new model run was needed.
- **Phase 3.5:** No hosted evaluation was requested. The author confirmed the trusted workflow is on `master`; any future hosted run needs a new exact manifest and approval. This is not required for the current pilot.
- **Phase 4.3–4.6:** Complete or deferred as recorded in the plan. The author reviewed the historical run, accepted the twelve holdout oracles and the exact one-shot manifest, and deferred recurring-gate planning.
- **Phase 4.9:** Complete. The author reviewed the grouped summaries of all 72 responses and found no unsupported or unrelated allegations. Wrong verdicts and text-anchor misses remain reported separately. No provider calls were needed.

## Historical no-key comparison preflight (2026-11-01)

This is the preflight for the six-case comparison that was later run. It did not read an API key or probe account access. Its stated $2.50 cap applied to that one exact comparison only.

- Models: `gpt-6-luna` and `gpt-6.1-sol`; no third model. These IDs were used as aliases, not dated immutable snapshots. Account-level access and rate limits were not established by documentation.
- Request behavior: existing Responses reviewer path, production prompt/schema/settings, 8,000-token output limit, six cases, three repetitions per model, sequential, no cache, retries, or grader.
- Planned calls: 36 (6 cases × 3 repeats × 2 models).
- Prompt digest: `7e5260d50a6b4d8d42688efc9f07e1faa4b99f6f15f815d540d5b67e8e301631`.
- Preflight runner SHA-256: `97197a7b772fcbf7b96454717e957ebc7dd9b38131ca335b2e0e667fe73dfddc`.
- Preflight corpus SHA-256: `b9327d8950b8a62e32bcf644bfa512677e31616e20b3c7daf1a3fdd5419a3c84`.
- Schema SHA-256: `df1014233fe292d17327d6d94d95076734bf1c873e4c69b1198b29e112f33843`.
- Pricing digest: `93c65fbb27e7ee05aad38628c6d68242d170eb935e9501212df8f6c876e24d01`.
- Input allowance: 12,000 tokens per request; output allowance: 8,000. Standard uncached rates in the pricing record: Luna $0.10/$0.50 and Sol $2.00/$10.00 per million input/output tokens.
- Conservative maximum reserve: Luna $0.0936 for 18 calls + Sol $1.872 for 18 calls = **$1.9656**. The one-run proposed limit was **$2.50**.

The report records that the comparison ran with one-time approval ID `printplan-review-comparison-2026-11-01-assertions-once` and remained within its $2.50 limit. This does not change the disabled checked-in policy.

## Observed comparison report

Source: [`packages/ai-reviewer/evals/reports/report.json`](../../../packages/ai-reviewer/evals/reports/report.json). Report manifest prompt digest: `7e5260d50a6b4d8d42688efc9f07e1faa4b99f6f15f815d540d5b67e8e301631`.

| Measure                             | Observed result         |
| ----------------------------------- | ----------------------- |
| Planned / completed responses       | 36 / 36                 |
| Operational errors / not-run cells  | 0 / 0                   |
| Responses with known usage          | 36 / 36                 |
| Assertion results                   | 34/36 passed; 2 failed  |
| Per-model assertions                | Luna 17/18; Sol 17/18   |
| Oracle verdict agreement            | 18/18 per model         |
| Defective cases marked `fail`       | 30/30                   |
| Control cases marked `pass`         | 6/6                     |
| Confusion counts                    | TP 30, TN 6, FP 0, FN 0 |
| Observed estimated cost             | $0.1402725 total        |
| Luna cost                           | $0.0089325              |
| Sol cost                            | $0.13134                |
| Luna median / p95 reviewer duration | 5.069 / 25.955 seconds  |
| Sol median / p95 reviewer duration  | 6.436 / 11.976 seconds  |

The p95 values are descriptive for 18 calls per model. They do not establish a latency SLA. Cost is the report's token-based uncached estimate, not a billing receipt.

### The two failed assertions

Both responses have schema-valid `fail` verdicts matching the oracle and pass the changed-location and mechanism anchors. They miss the current consequence wording patterns:

1. `gpt-6-luna`, case-02, repetition 3: describes addition replacing subtraction and explicitly says valid 100 g recorded / 20 g reserved input should leave 80 g but the PR returns 120 g, overstating available material. Oracle verdict is `fail`.
2. `gpt-6.1-sol`, case-03, repetition 3: describes a changed capacity calculation yielding zero, causing a valid 100 g reservation to be released instead of retained. Oracle verdict is `fail`.

These are semantic false negatives in the deterministic anchors for these outputs, not demonstrated false verdicts by the reviewers. Since assertions were adjusted after earlier answers from the same six cases were inspected, the final 34/36 must not be presented as an unbiased quality score. Do not broaden assertions to accept these exact summaries and then rerun the same sample as if it were independent.

## Observed 12-case holdout comparison (2026-11-01)

Source: [`packages/ai-reviewer/evals/reports/report.json`](../../../packages/ai-reviewer/evals/reports/report.json). The author accepted all twelve holdout oracles and the shared rubric before this run. The exact accepted models, case IDs, 72-request count, prompt/runner/corpus/schema/pricing digests, and $4.50 limit were bound by the one-time approval `printplan-code-review-evals-holdout-2026-11-01-once`. The approval file was temporary and removed after completion; the checked-in approval remains disabled.

| Measure                            |           Holdout result |
| ---------------------------------- | -----------------------: |
| Planned / completed requests       |                  72 / 72 |
| Operational errors / not-run cells |                    0 / 0 |
| Responses with known usage         |                  72 / 72 |
| End-to-end evaluation passes       |                  65 / 72 |
| Oracle verdict agreement           |                  69 / 72 |
| Confusion counts                   | TP 33, TN 36, FP 0, FN 3 |
| Estimated observed cost            |                $0.270941 |
| Authorized limit                   |                    $4.50 |

| Model         | Verdict agreement | End-to-end passes | Assertion passes | Estimated cost | Median / p95 duration |
| ------------- | ----------------: | ----------------: | ---------------: | -------------: | --------------------: |
| `gpt-6-luna`  |           33 / 36 |           31 / 36 |          31 / 36 |      $0.016371 |      5.395 / 14.487 s |
| `gpt-6.1-sol` |           36 / 36 |           34 / 36 |          34 / 36 |      $0.254570 |      6.196 / 14.056 s |

### Per-model verdict metrics and distinct fixtures (derived from the saved matrix)

Each denominator below is a response-cell count: six defect fixtures and six accepted safe fixtures, each repeated three times, produce 18 defect and 18 safe responses per model. Repetitions are repeated trials, not additional independent fixtures.

| Model         | TP / 18 defect responses | FN / 18 defect responses | TN / 18 safe responses | FP / 18 safe responses | Distinct defect fixtures hit | Distinct safe fixtures passed |
| ------------- | -----------------------: | -----------------------: | ---------------------: | ---------------------: | ---------------------------: | ----------------------------: |
| `gpt-6-luna`  |                       15 |                        3 |                     18 |                      0 |                        5 / 6 |                         6 / 6 |
| `gpt-6.1-sol` |                       18 |                        0 |                     18 |                      0 |                        6 / 6 |                         6 / 6 |

The seven failed end-to-end assertions split into **three wrong reviewer verdicts** and **four verdict-matching text-anchor misses**. The wrong verdicts are Luna case-09 repetitions 1–3 (expected `fail`, returned `pass`). The four anchor misses still returned the expected `fail` verdict: Luna case-07 repetition 1 and case-11 repetition 3, plus Sol case-07 repetitions 1 and 3. Assertion status therefore does not equal verdict accuracy. These deterministic anchors do not score unsupported allegations in summary text; the separate human audit of all 72 summaries is complete under 4.9.

All three Luna verdict misses were case-09 repetitions 1–3. Luna marked the change `pass`, reasoning that the supplied diff did not show what `loadLatest` does to the open form. Sol marked all three `fail`: it showed that forwarding a truthy editing ID bypasses the supplied `confirmDiscard` callback and proceeds to load. Sol also noted that the snippet alone cannot prove the downstream form reset. The accepted historical oracle establishes that application behavior, but the model-visible fixture omits that surrounding implementation. Record this as a case-context limitation; do not change the accepted oracle or tune assertions from these responses.

There were four additional assertion misses where verdicts matched the oracle and the summaries described relevant behavior: Luna case-07 repetition 1 and case-11 repetition 3, plus Sol case-07 repetitions 1 and 3. These are anchor wording false negatives, not reviewer verdict errors. Do not broaden the anchors to fit these exact answers and treat a rerun of this same set as independent evidence.

**Interpretation:** `gpt-6.1-sol` is the stronger choice on this accepted, curated 12-case set: it matched all 36 oracle verdicts, while Luna missed the same defect three times. Sol's estimated cost was about 15.5 times Luna's on this run, but remained within the $4.50 cap. The repeated case-09 result is one distinct scenario, not three independent examples. This evidence supports preferring Sol for a bounded, human-reviewed pilot; it does not establish general superiority, a statistical benchmark, or readiness for a recurring gate.

## Cost comparison for the historical, holdout-only, and full-corpus run shapes

The current preflight reserve is **$1.9656 / 36 = $0.0546 per request**. This is a conservative authorization-planning reserve, not an invoice estimate. Scaling assumes two models and three repetitions per case.

| Run shape                             | Two-model requests | Observed cost | Linear projection from observed run | Conservative reserve |
| ------------------------------------- | -----------------: | ------------: | ----------------------------------: | -------------------: |
| Historical: 6 development cases       |                 36 |    $0.1402725 |               $0.1402725 (observed) |              $1.9656 |
| Holdout run: 12 new cases             |                 72 |     $0.270941 |                          ~$0.280545 |              $3.9312 |
| Full corpus: all 18 cases             |                108 |             — |                         ~$0.4208175 |              $5.8968 |
| Full corpus: all 18 cases, 3 models   |                162 |             — |                         ~$0.6312263 |              $8.8452 |
| Hypothetical 24-case corpus, 2 models |                144 |             — |                           ~$0.56109 |              $7.8624 |

The six-case and 12-case costs are observed token-based estimates, not billing receipts. Larger observed-cost figures are arithmetic projections, not forecasts or guarantees; different case data, answer length, token use, rates, and billing can change cost. The conservative reserve line is not a charge. The previous $2.50 one-run ceiling applied only to the historical 36-request run; the separate $4.50 holdout approval has now been consumed.

The 24-case scenario is arithmetic only; the current catalog/schema supports 18 IDs. It would require six additional fixtures and a fresh code/corpus manifest. A later single-model gate over all 18 cases would require 54 calls (reserve $2.9484). Each recurring gate needs a separate cycle-bound approval and numeric per-run cap.

## Current recommendation after the holdout run

**Recommendation: prefer `gpt-6.1-sol` for a bounded, human-reviewed reviewer pilot; keep recurring gate and branch-protection work deferred.** Sol matched all 36 holdout verdicts, while Luna matched 33/36 and missed case-09 in all three repetitions. This is enough to choose a candidate for the current pilot, but the result covers only twelve curated cases. It does not establish broad model superiority or justify a recurring gate. Luna cost less ($0.016371 vs. $0.254570); Sol's estimate remained under the approved $4.50 cap. Keep manual review and do not make an automatic CI gate from this result.

The holdout comprises six historical change areas with one defect regression and one safe correction each: HTTPS cookie security, preserving unsaved print edits during a failed list-refresh retry, rename-aware diff size, validation of both returned reservation amounts against the configured margin, retry recovery wording, and access to saved settlement results. These are controlled fixture diffs based on historical revisions rather than verbatim PRs. All twelve oracles carry `author-reviewed-accepted`; the author also accepted the shared rubric. Cases 09–10 replace the previously proposed GitHub Actions eligibility pair with a product-level lost-edit regression and safe correction. The historical review-fix record says the retry could discard unsaved edits without confirmation and that the author manually confirmed the correction. The case-09 finding anchors and case-09/10 offline source-pair tests match that behavior. The offline suite passed 27/27, and the accepted one-shot manifest has completed.

The holdout comparison ran on cases 07–18 with `gpt-6-luna` and `gpt-6.1-sol`, three repetitions, 72 requests. Its estimated cost was $0.270941, below the $3.9312 conservative reserve and the $4.50 one-run cap. The cap is a local admission limit, not a provider-enforced billing ceiling. The checked-in approval remains disabled. A later gate would run all 18 cases (54 calls for one model) and require separate cycle-bound approval; it is not necessary for this model-selection decision.

After all twelve oracle outcomes were accepted and the case-09 assertion anchors/source-pair tests were updated, the current identities are:

- Prompt: `7e5260d50a6b4d8d42688efc9f07e1faa4b99f6f15f815d540d5b67e8e301631`
- Runner: `f8eaef803a61fb13329ae645e1ddf50e61d5fef5e44d0830cdbc3f48649e8b69`
- Corpus: `4410bb89a99b1dfe70474a707ced436746836bbff7bd9e194589440e5a180ec1`
- Reviewer schema: `df1014233fe292d17327d6d94d95076734bf1c873e4c69b1198b29e112f33843`
- Pricing: `93c65fbb27e7ee05aad38628c6d68242d170eb935e9501212df8f6c876e24d01`

These are the file identities used for the completed run. The accepted manifest applied to one run only; it authorizes neither another comparison nor recurring calls. The checked-in approval remains disabled.

The provider token's one-day expiry and GitHub credential date of 2026-11-07 are author-reported; no credential was created or altered here. The approval policy separately limits its issue-to-expiry interval to 24 hours. The current one-shot run is complete; the author has not approved a recurring gate or another paid run.

## Author decisions required

1. **Complete:** The author accepted the six original oracle outcomes and confirmed the historic 36 responses remain development evidence, not an independent benchmark.
2. **Complete:** The author accepted all twelve holdout oracle outcomes and the shared rubric on 2026-11-01.
3. **Complete:** The author accepted the exact one-shot manifest; the 72-request comparison completed within its $4.50 cap. A new approval is required for any future paid run.
4. No recurring gate decision is needed now. Revisit only if a concrete future need arises; this does not enable approval or branch protection.

## 10xChampion evidence map (lessons 22–24)

| Course requirement                                                                                                                                  | Evidence/state                                                                                                                                                                                                                                                                                                                                                                         | Remaining work                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M5L1 / lesson 22: pipeline view with a job, job or pipeline logs, and the LLM review comment on a PR                                                | The archived CI review record documents successful AI Code Review run `41175988320`, check `124463575649`, and the owned review comment on PR #39.                                                                                                                                                                                                                                     | Captured the CI summary, Static AI review workflow summary, AI reviewer job log, and PR comment in `reviews/ci_run.png`, `reviews/run.png`, `reviews/run_ai_reviewer.png`, and `reviews/reviewer-coment.png`. No new model run was needed.                                                                 |
| M5L2 / lesson 23: agent SDK integrated in an independent package and demonstrated against a synthetic diff                                          | `packages/ai-reviewer` is an independent package; the production review path now uses Vercel AI SDK 7's `ToolLoopAgent` and OpenAI Responses provider. Offline fake-fetch checks cover the adapter contract.                                                                                                                                                                           | One separately approved live synthetic-diff request completed on 2026-11-01. Its sanitized result and usage are in `reviews/sdk-smoke.json`; the author confirmed the saved result on 2026-11-01. No further request is authorized.                                                                        |
| M5L3 / lesson 24: Promptfoo evaluates the same diffs across 2–3 models with pass/fail, cost, and time, then remains available for prompt regression | Compare/gate now run their matrix through Promptfoo behind the trusted custom runner. A no-network replay of the saved 72 responses completed through Promptfoo. The historical live matrix itself used the earlier custom runner and direct API transport; it covered two models, twelve cases, three repetitions, verdict/assertion outcomes, estimated cost, and reviewer duration. | Replay validates Promptfoo mapping and assertions but is not fresh model inference. The checked-in approval remains disabled, so no new live Promptfoo comparison or recurring gate was run. Course reviewers decide whether this adapted implementation and historical evidence meet submission criteria. |
| 10xChampion certification: show the workflow exists and works in this project context                                                               | Existing workflow, exact-head check, successful run, and PR comment are recorded in [the archived CI review verification](../../../context/archive/2026-10-29-ci-code-review/verification.md).                                                                                                                                                                                         | Keep the course evidence screenshots with the submission. The supplied certification material permits an existing project when the connection to course skills, tests, and CI/CD is demonstrated; acceptance remains with course reviewers.                                                                |

The SDK intentionally changes the wire encoding: its request represents instructions and review criteria as a system input message, the diff as `input_text`, and omits empty `tools`/`tool_choice` fields because no tools are registered. The Responses endpoint, selected model, `store: false`, structured schema, output cap, and no-tool behavior are retained. Offline tests verify this encoding; the one live request used a synthetic diff and made no further inference calls.

## Manual verification evidence

- **4.9:** Complete. The author reviewed all 72 saved summaries using the [grouped review](reviews/summary-audit.md), one case at a time. The review found no unsupported or unrelated allegations. Wrong verdicts and anchor misses were kept separate. No provider calls were made.
- **2.11:** One separately approved SDK-backed review completed on a synthetic diff. Result: `completed`, 1,406 input tokens, 306 output tokens, estimated cost `$0.005872`; sanitized evidence is in `reviews/sdk-smoke.json`. The author confirmed the saved result on 2026-11-01. No further call is authorized.
- **Champion screenshots:** Complete. Captured the existing pipeline/job view, AI reviewer job log, and PR review comment from run `41175988320` / PR #39 in `reviews/ci_run.png`, `reviews/run.png`, `reviews/run_ai_reviewer.png`, and `reviews/reviewer-coment.png`. No new inference was made.

## Next workflow

The manual pilot comparison is complete. Prefer Sol for the bounded reviewer pilot while retaining human review. The 36 historical responses need no second review. Phase 3.5 remains relevant only for any future hosted GitHub run; it was not needed here. Do not run another paid comparison, enable a recurring gate, or change branch protection without a new explicit decision.
