# Cross-commit comment provenance and publication diagnostics

## Hosted observations

PR #40's deliberate arithmetic defect was correctly rejected in run `41185956948`, but the publisher created comment `6541321187` instead of updating original comment `6541157337`. The later correction received a model pass in run `41186233676`, while publication ended with `PUBLICATION_FAILED` and a red custom check. Result labels were cleared. The existing logs do not identify which API call failed in that second run; its precise cause remains unknown.

For original run `41185691939`, GitHub retained top-level `head_sha` `b60c4d4917740b740f809f4bc0aaf68345b2ebc8` while updating nested `pull_requests[0].head.sha` to the current PR head. The old check retained the original reviewed SHA in both `head_sha` and `external_id`. Comparing the historical check identity to the mutable nested PR refs incorrectly rejected the original comment's provenance.

## Correction

- Bind historical provenance to the run's top-level `head_sha` and associated PR number. Preserve repository, head repository, workflow path, PR event, run attempt, check application/name/URL, and comment ownership checks. Current head/base freshness and envelope context checks remain separate requirements.
- Use each owned comment's exact provenance check rather than comparing it to every check on the current head.
- Cache successful run metadata within one preparation/publication invocation. A higher required run attempt refreshes the cached response. Keep live PR and check reads before each mutation, so caching cannot hide a newer execution or branch update.
- Report fixed operation names and allowlisted error codes in publisher CLI output and check summaries. Never print raw exceptions, response bodies, or credentials.
- Distinguish rate exhaustion from a generic forbidden response. Do not immediately retry rate-limited requests. The workflow still uses anonymous public run reads and the original GitHub permissions.

GitHub documents a 60-request/hour/IP limit for anonymous REST access. Repeated run metadata lookups were an avoidable publication risk; reducing them mitigates that risk but does not prove that rate exhaustion caused run `41186233676` to fail. See [rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api) and [workflow run metadata](https://docs.github.com/en/rest/actions/workflow-runs#get-a-workflow-run), fetched through Context7 during this correction.

## Verification — 2026-10-31

- Updating the fake GitHub API to return mutable nested PR refs reproduced the cross-commit failure before the source fix: two comments instead of one. The regression now passes.
- Added five tests covering historical provenance and spoofed metadata, bounded run reads, later-attempt cache refresh, safe publication diagnostics, and rate-exhaustion classification. Fault fixtures failed against the previous implementation.
- `npm run test:ai-review`: PASS, 44 tests. Tests still cover same-head supersession, head/base changes during publication, marker spoofing, separate credentials, and failed publication remaining red.
- `npm run verify:deploy`: PASS, including native contracts, lint, Astro diagnostics, and production build.
- Read-only lookup using real PR #40 metadata returns original comment `6541157337` for current head `7248ee7f07d194a5fdc0def052e139523d496955`.
- Replayed the saved corrected-head pass against live GitHub reads, simulating an active check and intercepting every write. The replay selects `PATCH /issues/comments/6541157337`, followed by the passed label and successful check completion. It makes no comment POST. There were 17 authenticated read-only proxy requests and zero remote writes or provider calls. This is a simulation, not hosted acceptance.

## Deployment and remaining acceptance

The host published the correction as [PR #41](https://github.com/krzysztofn1993/PrintPlan/pull/41), initially at head `718f8c1f304c6d868c8035f9edf5f2eb489384e0`, and subsequently merged it as `0251d4f89faa166a48be96e013c07d9a0715d6db`. Existing duplicate comments were not deleted or modified. The fixed code reuses the original trusted comment; it does not automatically remove historical duplicates.

After deployment, PR #40 run `41202310623` updated original comment `6541157337` with the deliberate-defect rejection; correction run `41202628985` updated that same comment with a successfully published pass. These observations verify historical comment continuity across new heads. The author confirmed criterion 5.5 in consolidated acceptance on 2026-10-31. An old workflow event still retains its captured base; these acceptance runs used the corrected master.

## PR #41 review assessment — 2026-10-31

Run `41187355156` published a valid model rejection, not an operational publication error. Application `ci` and `smoke` passed. The reviewer alleged that same-attempt run metadata caching could permit stale publication after PR refs move.

The claimed stale-publication defect is not reproduced: cached run metadata establishes historical provenance. `freshness()` separately reads `/pulls/{pr}` and the current-head check list before mutations; neither response is cached. Nested PR head/base refs are deliberately excluded from historical identity, while top-level run `head_sha` identifies the original execution. A later run attempt still forces a run metadata refresh.

Added two targeted regressions without changing functional source behavior:

- Move live head or base after the first run metadata read, within the same attempt and publication invocation. Both cases cancel the execution before comment/result-label publication, with only one run metadata read.
- Change nested PR refs after populating the historical cache. Both cached and freshly fetched run metadata resolve to the same original trusted identity.

At that checkpoint, the reviewer suite passed 46 tests; `npm run verify:deploy` and formatting also passed. A source comment explicitly separates cached historical provenance from live freshness. The hosted review was still red; the assessment itself did not override its verdict or establish hosted recovery.

### Follow-up head `09ef2e7`

Run `41198436249` rejected the test follow-up with different speculative findings. The first alleged a newly split failure-result/exception convention, but handled publication failures already returned `{conclusion: "failure"}` and the CLI already converted that result to a nonzero exit before this change. Added diagnostic fields do not change that contract. The second alleged possible identifier collisions without an actionable foreign-check acceptance scenario; existing repository/check/workflow/head/PR/attempt validation remains in place. These statements did not establish a blocking correctness defect. No further functional change was made in response. At that checkpoint the gate was still red and execution used the old trusted-base publisher.

### Final hosted outcome

The owner updated the branch after the revised prompt reached master. PR #41 run `41201707354` used digest `7e5260d50a6b4d8d42688efc9f07e1faa4b99f6f15f815d540d5b67e8e301631` and completed with a valid published pass. The correction then merged, and the current-publisher acceptance sequence on PR #40 confirmed the original comment was maintained. Complete execution identities and the author's acceptance are retained in `../verification.md`.
