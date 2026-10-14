# Commit SHA reconciliation

The Progress suffixes in `plan.md` were checked against the merged implementation on `master` at `38c74a77297a25a0128a3cb96006bfac33e4b718` (2026-10-14). The prior Phase 1 and Phase 2 suffixes did not resolve to commits; the prior Phase 3 and Phase 4 suffixes resolved locally but were not ancestors of the merged `master` history.

| Phase | Progress rows | Previous suffix | Reconciled commit | Integrated commit |
| --- | --- | --- | --- | --- |
| 1: Database and Data Contracts | 1.1–1.4 | `b36d527` (unresolvable) | `83940a395d69056410ec74b9a168d0355e17112c` | Yes |
| 2: Operations and API | 2.1–2.3 | `6f8c1a9` (unresolvable) | `fede152aa356c95d36b07428cea79339fcc1852c` | Yes |
| 3: Planned-Print View and Navigation | 3.1–3.5 | `c5d6bde` (local-only) | `a35b3a933d38a8d3251ad72c19ab0439d9dd7782` | Yes |
| 4: Verification and CI | 4.1–4.6 | `05ccddd` (local-only) | `d6d17f0bb2141be327b092f974f46aac17399d0a` | Yes |

The reconciled commits are the matching phase commits in merged PR #20. Their commit titles and changed-file scopes match the Progress phases. The changed implementation files for each phase have the same contents as the corresponding locally retained earlier phase commits where those commits are available. All four reconciled commits resolve to commit objects and are ancestors of the recorded `master` snapshot.

The historical SHAs in `reviews/impl-review.md` are retained because they identify the revision the reviewer actually examined. The upstream starter revision in `bootstrap-verification/verification.md` is also retained; it belongs to the separate starter repository, not PrintPlan's Git history.
