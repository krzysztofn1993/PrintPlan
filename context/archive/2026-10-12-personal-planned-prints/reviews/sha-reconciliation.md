# Commit SHA reconciliation

The Progress suffixes in `plan.md` were checked against the merged implementation on `master` at `87a4c2d3213d06c631d2a7b0d1e31e6be2e65517` (2026-10-14). The prior Phase 1 and Phase 2 suffixes did not resolve to commits; the prior Phase 3 and Phase 4 suffixes resolved locally but were not ancestors of the merged `master` history.

| Phase | Progress rows | Previous suffix | Reconciled commit | Integrated commit |
| --- | --- | --- | --- | --- |
| 1: Database and Data Contracts | 1.1–1.4 | `b36d527` (unresolvable) | `7f5a389422c80adb1d86d0a78eb2c4bbd7b48fde` | Yes |
| 2: Operations and API | 2.1–2.3 | `6f8c1a9` (unresolvable) | `bf82453657e330c6b07df82176b0957850af9d30` | Yes |
| 3: Planned-Print View and Navigation | 3.1–3.5 | `c5d6bde` (local-only) | `7f5a26e6bb7f13dee39781ca4a5e9e3763141b56` | Yes |
| 4: Verification and CI | 4.1–4.6 | `05ccddd` (local-only) | `9f96f073e4a227ce584239dd6f69e1e02fec06be` | Yes |

The reconciled commits are the matching phase commits in merged PR #20. Their commit titles and changed-file scopes match the Progress phases. The changed implementation files for each phase have the same contents as the corresponding locally retained earlier phase commits where those commits are available. All four reconciled commits resolve to commit objects and are ancestors of the recorded `master` snapshot.

The historical SHAs in `reviews/impl-review.md` are retained because they identify the revision the reviewer actually examined. The upstream starter revision in `bootstrap-verification/verification.md` is also retained; it belongs to the separate starter repository, not PrintPlan's Git history.
