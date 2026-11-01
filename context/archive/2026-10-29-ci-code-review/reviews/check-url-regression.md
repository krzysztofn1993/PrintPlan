# GitHub-managed check URL regression

## Observed failure

The first live acceptance PR, [#37](https://github.com/krzysztofn1993/PrintPlan/pull/37), completed preparation and inference in [run 41174189641](https://github.com/krzysztofn1993/PrintPlan/actions/runs/41174189641), then failed publication. The saved envelope reports `completed`, model `gpt-5-nano`, verdict `pass`, 571 input tokens and 1,569 output tokens. These observations do not establish successful hosted publication.

Check `124458252143` targets head `1130bf01041b4decd8a8c9d16573ce13badd52b6`. Its `external_id` retains the expected repository, PR, head/base and execution identity. GitHub returned `https://github.com/krzysztofn1993/PrintPlan/runs/124458252143` as `details_url`, rather than the requested Actions run/attempt URL. The strict URL comparison rejected our own check, causing `CHECK_NOT_FOUND` before comment publication and leaving the custom check pending.

## Correction

Accept both the existing Actions run/attempt URL and GitHub's check URL, requiring the latter to match the repository and exact positive check ID. Preserve application, name, repository/PR/head identity and workflow-run provenance checks. Update the fake GitHub service to normalize URLs on creation and update, matching the observed API behavior.

## Verification

- The normalized fixture failed against the old implementation: 14 GitHub tests went red, including check recovery and publication.
- The corrected implementation passes all 39 offline reviewer tests, including duplicate preparation/publication, owned-comment lookup, stale results and spoofed metadata rejection.
- Regression assertions reject another check ID, another repository, unrelated URLs, another app and another head SHA; the original Actions URL remains supported.
- Read-only lookup of the real PR #37 check succeeds with the corrected recognizer.
- `npm run verify:deploy`: PASS.
- No new provider request, hosted rerun, GitHub write, push or merge was performed during this fix. Hosted acceptance of the correction remains pending.

## Deployment

Merge the correction into `master`, then open a new test PR or update the existing test branch with the corrected master so a fresh PR event captures the new trusted base SHA. Rerunning the old event continues to use its original base SHA. A fresh eligible review invokes the provider again; the saved result from the original run remains available in its output artifact.
