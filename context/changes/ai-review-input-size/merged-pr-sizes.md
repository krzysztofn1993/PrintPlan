# Merged PR size audit

Measured at 2026-11-01T07:00:15.119Z. All 33 merged PRs returned by `gh pr list --state merged --limit 1000` were measured; none required fallback or unavailable refs.

GitHub additions/deletions and file counts are current PR metadata. Byte counts apply the reviewer retrospectively to each recorded base/head merge-base range, using current PR title/body. They do not reconstruct original workflow events or imply the reviewer existed for these PRs. Binary payload sizes are excluded from text patches.

Both byte variants retain the no-renames old/new path inventory and binary disclosure. Input bytes count compact UTF-8 JSON of title, body, diff, paths, and unreviewedPaths. Measurement used a larger subprocess buffer to measure oversized diffs; runtime guards still apply. Exact rename detection changes the patch only.

| PR                                                                                                                           | Added lines (GitHub) | Deleted lines (GitHub) | Files (GitHub) | Raw patch bytes, exact renames | Input bytes, no renames | Input bytes, exact renames |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------: | ---------------------: | -------------: | -----------------------------: | ----------------------: | -------------------------: |
| [#10: feat: bootstrap PrintPlan and verify account access](https://github.com/krzysztofn1993/PrintPlan/pull/10)              |                51087 |                      0 |            232 |                        2584037 |                 2700194 |                    2700194 |
| [#28: feat(reservations): reserve and release material](https://github.com/krzysztofn1993/PrintPlan/pull/28)                 |                 5578 |                   1383 |             53 |                         519891 |                  536436 |                     536436 |
| [#33: feat: edit reserved prints](https://github.com/krzysztofn1993/PrintPlan/pull/33)                                       |                 6583 |                    557 |             43 |                         464282 |                  479007 |                     479007 |
| [#34: Carbon Terminal planned prints UI](https://github.com/krzysztofn1993/PrintPlan/pull/34)                                |                 4558 |                    717 |            125 |                         409545 |                  449612 |                     449612 |
| [#30: Settle completed prints and consume actual filament](https://github.com/krzysztofn1993/PrintPlan/pull/30)              |                 6520 |                    148 |             44 |                         429369 |                  443088 |                     443088 |
| [#31: feat(account-safety-margin): Configure the account safety margin](https://github.com/krzysztofn1993/PrintPlan/pull/31) |                 4570 |                    114 |             45 |                         340421 |                  351507 |                     351507 |
| [#32: Preserve reservations during spool edits and recovery](https://github.com/krzysztofn1993/PrintPlan/pull/32)            |                 4021 |                   1481 |             37 |                         315286 |                  334278 |                     334278 |
| [#20: Implement personal planned prints through Phase 4](https://github.com/krzysztofn1993/PrintPlan/pull/20)                |                 5248 |                    214 |             31 |                         279362 |                  290526 |                     290526 |
| [#16: feat: add personal filament stock](https://github.com/krzysztofn1993/PrintPlan/pull/16)                                |                 4688 |                     37 |             32 |                         265000 |                  274497 |                     274497 |
| [#21: Implement Carbon Terminal Spools UI](https://github.com/krzysztofn1993/PrintPlan/pull/21)                              |                 1669 |                    754 |             78 |                         202855 |                  220925 |                     220315 |
| [#36: feat: add trusted static AI code reviewer](https://github.com/krzysztofn1993/PrintPlan/pull/36)                        |                 3149 |                      3 |             40 |                         206915 |                  216119 |                     216119 |
| [#26: test: isolate data and verify persistence](https://github.com/krzysztofn1993/PrintPlan/pull/26)                        |                 2790 |                    112 |             24 |                         207054 |                  214678 |                     214678 |
| [#19: Add personal planned prints](https://github.com/krzysztofn1993/PrintPlan/pull/19)                                      |                 3505 |                      4 |             24 |                         204673 |                  211419 |                     211419 |
| [#27: test: cover mutation sessions and browser recovery](https://github.com/krzysztofn1993/PrintPlan/pull/27)               |                 3149 |                     85 |             33 |                         194013 |                  201710 |                     201710 |
| [#17: feat: add carbon terminal theme](https://github.com/krzysztofn1993/PrintPlan/pull/17)                                  |                 1537 |                    312 |             72 |                         157842 |                  170022 |                     170022 |
| [#15: Complete hosted auth verification follow-up](https://github.com/krzysztofn1993/PrintPlan/pull/15)                      |                  631 |                    168 |             10 |                         158438 |                  211918 |                     161612 |
| [#29: feat(agent-hook-latency): apply verified hook improvements](https://github.com/krzysztofn1993/PrintPlan/pull/29)       |                 1027 |                    135 |             17 |                         110024 |                  113504 |                     113504 |
| [#13: Prepare hosted authentication verification](https://github.com/krzysztofn1993/PrintPlan/pull/13)                       |                 1124 |                    193 |             10 |                          97839 |                  100614 |                     100614 |
| [#46: fix(ai-reviewer): preserve usage metadata on failed reviews](https://github.com/krzysztofn1993/PrintPlan/pull/46)      |                  493 |                     52 |             13 |                          89360 |                   92306 |                      92306 |
| [#41: fix(ai-reviewer): preserve historical comment publication](https://github.com/krzysztofn1993/PrintPlan/pull/41)        |                  351 |                     34 |             10 |                          54652 |                   57214 |                      57214 |
| [#18: chore: archive carbon terminal theme](https://github.com/krzysztofn1993/PrintPlan/pull/18)                             |                    2 |                      2 |             50 |                          20065 |                  239082 |                      35220 |
| [#14: Secure hosted auth cookies over HTTPS](https://github.com/krzysztofn1993/PrintPlan/pull/14)                            |                   95 |                     42 |              8 |                          21411 |                   22472 |                      22472 |
| [#35: chore: close usable filament planning milestone](https://github.com/krzysztofn1993/PrintPlan/pull/35)                  |                   21 |                     19 |             14 |                          16070 |                  267531 |                      18551 |
| [#42: fix(ai-reviewer): require evidence for blocking findings](https://github.com/krzysztofn1993/PrintPlan/pull/42)         |                  118 |                      8 |              5 |                          15252 |                   16649 |                      16649 |
| [#45: fix(ai-reviewer): exclude forks before owner validation](https://github.com/krzysztofn1993/PrintPlan/pull/45)          |                  107 |                     12 |              6 |                          15030 |                   16295 |                      16295 |
| [#23: docs: reconcile planned prints commit SHAs](https://github.com/krzysztofn1993/PrintPlan/pull/23)                       |                   35 |                     20 |              4 |                          12012 |                   12931 |                      12931 |
| [#24: chore(archive): close personal-planned-prints](https://github.com/krzysztofn1993/PrintPlan/pull/24)                    |                    7 |                      5 |              9 |                           8964 |                  194883 |                      10737 |
| [#11: chore(archive): close verified-account-access](https://github.com/krzysztofn1993/PrintPlan/pull/11)                    |                    7 |                      5 |              7 |                           7197 |                  177051 |                       8397 |
| [#38: fix(ai-reviewer): recognize GitHub-managed check links](https://github.com/krzysztofn1993/PrintPlan/pull/38)           |                   56 |                      2 |              4 |                           7157 |                    7636 |                       7636 |
| [#22: docs: clarify agent guidelines](https://github.com/krzysztofn1993/PrintPlan/pull/22)                                   |                    4 |                      4 |              1 |                           4370 |                    4851 |                       4851 |
| [#12: Use Node 24 and configure Cloudflare Worker](https://github.com/krzysztofn1993/PrintPlan/pull/12)                      |                    6 |                      4 |              4 |                           1606 |                    2305 |                       2305 |
| [#25: docs(roadmap): mark planned prints archived](https://github.com/krzysztofn1993/PrintPlan/pull/25)                      |                    1 |                      1 |              1 |                           1844 |                    2145 |                       2145 |
| [#43: docs: describe master merge requirements](https://github.com/krzysztofn1993/PrintPlan/pull/43)                         |                    6 |                      0 |              1 |                            716 |                    1195 |                       1195 |

## Source refs

Each measurement runs `git merge-base <base> <head>` and then `git diff <flags> <merge-base> <head> --`, with external diff/textconv disabled and the collector environment. Path listing and binary classification use `--no-renames -z`; patch variants use `--no-renames` or `--find-renames=100%`.

| PR  | Recorded base                              | Recorded head                              | Calculated merge-base                      |
| --- | ------------------------------------------ | ------------------------------------------ | ------------------------------------------ |
| #10 | `6dcbe409be8f0c84fd5360a5cc24895762e4c120` | `65b082f33669fdb6578b2f1524c1a90e1aa5b80f` | `6dcbe409be8f0c84fd5360a5cc24895762e4c120` |
| #11 | `7d57f5dc8439fe9814143fca76ded52ec7d947fc` | `19fc5ed724e035e3b573c1cf7bb8b547f1af2aeb` | `7d57f5dc8439fe9814143fca76ded52ec7d947fc` |
| #12 | `0b6adcb68d8b252c4bf57dd731b667c6ff698db2` | `ccafdefcd80ba31cce304f1de3d404d48bde05c0` | `0b6adcb68d8b252c4bf57dd731b667c6ff698db2` |
| #13 | `c5af7e5a7703a2a676c501dfdde745a777ea06ed` | `2e3d8cbec4790ae8c3ad9b4be7bd336e2b08c7ee` | `c5af7e5a7703a2a676c501dfdde745a777ea06ed` |
| #14 | `b8c64235b1b155e72b46dcb32d08c6a3805130a8` | `5af64032161bb073b24958342f8439cd3bbab10b` | `b8c64235b1b155e72b46dcb32d08c6a3805130a8` |
| #15 | `17e7ae434f494a7c7b12e813db3c4661ff561456` | `ed97d7c8ba7150ef495ea3b9fad478a9a8ad14c8` | `5af64032161bb073b24958342f8439cd3bbab10b` |
| #16 | `d4827f59133bb27407cf99ae4644bc3f0d8edcd7` | `88e7b28b0f3bd120057c035140a9ebfe27e73d71` | `d4827f59133bb27407cf99ae4644bc3f0d8edcd7` |
| #17 | `41e27b6f776af65dbae5ed35e64847e4a08797a1` | `f45c4a8ad316b699a6e75d971826714dffd2c8b0` | `41e27b6f776af65dbae5ed35e64847e4a08797a1` |
| #18 | `f1b020317f0b8b97cb5ce45b0314630afc24e125` | `c1d0e9e5b7c4de2ed895519b3e639316ca8bc073` | `f1b020317f0b8b97cb5ce45b0314630afc24e125` |
| #19 | `af4ae8eea9133eb744eee12745778e897c0fa9e6` | `65151ce5e6dcfc9ff32db7046130ff62e370a7e2` | `c1d0e9e5b7c4de2ed895519b3e639316ca8bc073` |
| #20 | `c27337695452c3d9051f85560629fd351f35600a` | `0b44d575702f29fd1fe9fd335d860ca0f4d4d52a` | `c27337695452c3d9051f85560629fd351f35600a` |
| #21 | `c54c0f0e56df82a7af23dbed3850635056675455` | `6914464b77cee01363a24d199e2f05dd89c469e3` | `c54c0f0e56df82a7af23dbed3850635056675455` |
| #22 | `c9551fc243cb625195be7ab81269fe44cd04c790` | `f33d2cf89291d733579a01ca9f8e36cd88a2fb89` | `c9551fc243cb625195be7ab81269fe44cd04c790` |
| #23 | `38c74a77297a25a0128a3cb96006bfac33e4b718` | `0ab13a488dac555cb2cd442506edb2d9e9d1cffe` | `38c74a77297a25a0128a3cb96006bfac33e4b718` |
| #24 | `2f526b1db87a7d97e39e70f56449c08bb7e8c2b9` | `f297e40e13bf76159b759e5ecb38df7c44175e6f` | `2f526b1db87a7d97e39e70f56449c08bb7e8c2b9` |
| #25 | `b44dbd3e5fc7b0160183fd341da90ab51566b59c` | `13980e1db3806538e9ce905b6bba7a70d0417074` | `b44dbd3e5fc7b0160183fd341da90ab51566b59c` |
| #26 | `778a01e129630c3ccafce31ebac99b5fd70b7dfc` | `103ed9ae25705924e74b51e6d3f3c9a665f1af4f` | `778a01e129630c3ccafce31ebac99b5fd70b7dfc` |
| #27 | `af2743c61cbc233bf86ecfe6e8d7a9ff08891745` | `dbc632689d635aa00753c26b191c302455865bc0` | `af2743c61cbc233bf86ecfe6e8d7a9ff08891745` |
| #28 | `12740e410d13a8d098093a9bfa57ae147a673dd4` | `7fb0e05e0c3aca78a6724290d6108dd612bc80b0` | `12740e410d13a8d098093a9bfa57ae147a673dd4` |
| #29 | `5587b2184b889c752f8d615ed7728c3221e2b1ef` | `35a22f323878df564bcd9e5029ddffbcb4e0c593` | `5587b2184b889c752f8d615ed7728c3221e2b1ef` |
| #30 | `f9be5d3dbb7953a5cf0b304b5a7ad0f5a8e0696b` | `d004843f2fbf60cb4c5e1194ef428fabb3d64c3a` | `f9be5d3dbb7953a5cf0b304b5a7ad0f5a8e0696b` |
| #31 | `261fc502fae1cccf5c8548f05ed414335024dadd` | `f338bc66c42704f9307613f67249684ab02c5653` | `261fc502fae1cccf5c8548f05ed414335024dadd` |
| #32 | `f6819388ff356a72d8a4dcdc7f50f7073944822e` | `3fefddd30e5c06bf49467025f47d6ded134eb388` | `f6819388ff356a72d8a4dcdc7f50f7073944822e` |
| #33 | `4a722a8e5dcc172353d889de884603b48bc6b707` | `140d7ad3bdd2a3dcb91134d70b75a59107ca045d` | `4a722a8e5dcc172353d889de884603b48bc6b707` |
| #34 | `4bb86afedb80379ac438545d0f47513c829a6ca4` | `b4da5261096da50fcab449f3855c5b4d821f2afc` | `4bb86afedb80379ac438545d0f47513c829a6ca4` |
| #35 | `34ede5ea19e54d127d609ef82e8928c959a5b7e6` | `43ccc7f2d5003a2d9cfc477cf84dd57cbd865dff` | `4bb86afedb80379ac438545d0f47513c829a6ca4` |
| #36 | `6c2166adcd755623e2512b981fac87012324b74c` | `3ed8a2f4c890a93608598e84f69d64037c1b3539` | `6c2166adcd755623e2512b981fac87012324b74c` |
| #38 | `a67b3a4157acd217198208803aeca6db042d1071` | `7521f12c499f6dc13df88ba41a4ae04b7003a6f7` | `a67b3a4157acd217198208803aeca6db042d1071` |
| #41 | `8e701a0fc9eac1786ceced0887a6dd4ee66ee0f6` | `efc18843f0a650392fe37976153b628b714524a4` | `8e701a0fc9eac1786ceced0887a6dd4ee66ee0f6` |
| #42 | `10421c8a4713d4e6035db128f082f0e3795b4455` | `e162e7bd1f9a2e66225725202f8356e977f47d6e` | `10421c8a4713d4e6035db128f082f0e3795b4455` |
| #43 | `0251d4f89faa166a48be96e013c07d9a0715d6db` | `617384ca88f274b38bc9aa142da896102e1eb057` | `0251d4f89faa166a48be96e013c07d9a0715d6db` |
| #45 | `8cbd8035e36c29be3f051996289a8002936d5f58` | `a2301cd310fa1bc647b894ec0c4cb1ed1f9fbbe3` | `8cbd8035e36c29be3f051996289a8002936d5f58` |
| #46 | `99d17808b65558685af13f359d63fada34279fab` | `e9eb86c4ac44add5bf0f66955464fe016a54f227` | `99d17808b65558685af13f359d63fada34279fab` |
