# Accepted verification of operational failures

## Author decision — 2026-10-31

The author accepted verifying 5.7 through the existing automated fault fixtures plus observed hosted failure and recovery behavior. Do not introduce a production fault-injection mode or require another paid run for each fault. This changes the evidence method, not the operational safety requirements or review contract.

Separate live authentication and timeout failures were not induced. Do not report the automated fixtures as real provider outages or claim all four faults were independently reproduced through the production workflow.

## Automated evidence

These tests are part of `npm run test:ai-review`, which the application CI workflow already runs with its offline HTTP guard:

| Condition                                  | Existing evidence                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication and HTTP failure            | `adapter.test.mjs` injects 401, 403, 429, and server errors; asserts a safe operational error, null review, and exactly one request attempt.                                                                                                                       |
| Timeout                                    | The adapter deadline test uses a stalled request and stalled JSON parsing; checks abort behavior, `DEADLINE_EXCEEDED`, and no inference retry.                                                                                                                     |
| Invalid response                           | Adapter and contract tests reject incomplete/failed responses, refusals, unexpected tools, invalid/truncated JSON, missing/extra fields, and invalid metadata; no valid-looking pass can override an operational failure.                                          |
| Publication failure                        | `github.test.mjs` injects comment, label, and check-write failures; asserts no successful check or passed label. Transient writes are bounded to three attempts.                                                                                                   |
| Error presentation and stale-label cleanup | Publisher transitions from pass to rejection to operational error preserve the owned comment, clear result labels, and omit a code verdict for an operational error. Authentication/timeout envelope tests produce failed/timed-out outcomes and no result labels. |

The latest local reviewer suite passed 48 tests, and `npm run verify:deploy` passed. The fixtures verify error-handling contracts without provider credentials or live GitHub mutation.

## Hosted evidence

- PR #40 run `41184712754`: incomplete response produced an operational error without a verdict, a failed exact-head check, and no result labels.
- PR #40 run `41186233676`: a valid provider pass followed by failed publication did not create approval; the custom check failed with `PUBLICATION_FAILED`, and result labels were cleared.
- Protected same-head run `41211037591`: deliberately invalid model configuration produced an error with null review, updated original comment `6541157337`, cleared result labels, and blocked merge despite green application checks and an older successful review on the same SHA.
- Run `41211444016`: restoring the valid model produced pass, successful publication, and `CLEAN` merge eligibility on the same head.

Full SHAs, custom-check IDs, provider metadata where available, and the limitations of each observation are retained in `../verification.md`.

## Outcome

Criterion 5.7 is accepted under this combined evidence method. Authentication, timeout, invalid output, and publication-failure handling have controlled automated coverage; real hosted observations establish operational-error presentation, result cleanup, protected merge blocking, and recovery. GitHub API outages may still prevent cleanup or status updates, as documented in the original design. No additional workflow, test switch, credential change, or inference request was created for acceptance.
