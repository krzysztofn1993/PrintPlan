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

The correction is local and uncommitted. Existing duplicate comments were not deleted or modified. The fixed code will reuse the original trusted comment; it does not automatically remove historical duplicates.

Merge the correction into trusted `master` before issuing a fresh eligible review. An old event retains its old trusted base. Updating the test branch with the corrected master and pushing requests replacement review automatically and incurs a new provider call. Verify original-comment continuity and successful publication before closing 5.5; retain the other pending Manual criteria.
