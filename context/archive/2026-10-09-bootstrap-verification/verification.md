---
bootstrapped_at: 2026-10-09T18:17:36.143124Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: print-plan
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

# Bootstrap verification

## Hand-off

**Source**: `context/foundation/tech-stack.md`. No overrides applied.

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: print-plan
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: cloudflare-builds
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

## Why this stack

PrintPlan is a small web application with a three-week, after-hours MVP budget. The author accepted the recommended TypeScript web starter: Astro, React, Tailwind CSS, npm, and Supabase for email/password authentication and PostgreSQL persistence. The [upstream starter](https://github.com/przeprogramowani/10x-astro-starter) supplies authentication routes and a protected-page example; PrintPlan still needs its own tables, migrations, and per-user Row Level Security policies. Reservation and settlement operations should use [PostgreSQL functions exposed through Supabase RPC](https://supabase.com/docs/guides/database/functions), with consistent locking and idempotency rules planned to prevent overbooking and repeated consumption deductions. Cloudflare Workers was explicitly selected instead of the registry's stale Cloudflare Pages default, matching the upstream deployment configuration verified on 2026-10-09. Cloudflare Builds will connect to GitHub and automatically build and deploy on pushes to master; this branch choice is recorded here because the hand-off schema has no dedicated branch field. The project name is print-plan. Scaffolding confidence is first-class: registered support, but not verified end to end. Payments, realtime, AI, and background jobs are outside the MVP.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | Not run | Not applicable | Registry command clones a Git repository; no create-* package. |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12T21:16:08Z | fresh | 27 days before this run. GitHub CLI was not authenticated; public REST API via curl succeeded. |

Command attempted: `gh api repos/przeprogramowani/10x-astro-starter --jq '{pushed_at,default_branch}'`; exit 4. Error: GitHub CLI requires login or GH_TOKEN. Fallback: public `https://api.github.com/repos/przeprogramowani/10x-astro-starter`; default branch `master`.

Current documentation retrieved using Context7: Astro `/withastro/docs` (development and production commands), ESLint `/eslint/eslint` (global ignores). Sources: [Astro development and build](https://docs.astro.build/en/develop-and-build/), [ESLint configuration](https://eslint.org/docs/latest/use/configure/configuration-files).

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Upstream revision**: `4c0b8a0aa09ad74eba612d5df9f3fbefdeb94fef`
**Exit code**: 0
**Files moved**: 30669 (51 project files and 30,618 installed dependency files)
**Conflicts (.scaffold siblings)**: `AGENTS.md.scaffold`, `README.md.scaffold`
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted after successful merge; upstream `.git/` removed before merge.
**Preservation checks**: all six pre-existing context files retained their SHA-256 hashes; existing `AGENTS.md` and `README.md` also verified unchanged.

Installed dependencies were moved as one directory operation. Every project file is listed below. No user files were overwritten.

| Scaffold path | Destination | Action |
| --- | --- | --- |
| `.env.example` | `.env.example` | move |
| `.github/workflows/ci.yml` | `.github/workflows/ci.yml` | Move |
| `.gitignore` | `.gitignore` | move |
| `.husky/pre-commit` | `.husky/pre-commit` | Move |
| `.nvmrc` | `.nvmrc` | move |
| `.prettierrc.json` | `.prettierrc.json` | move |
| `.vscode/extensions.json` | `.vscode/extensions.json` | Move |
| `.vscode/launch.json` | `.vscode/launch.json` | Move |
| `.vscode/settings.json` | `.vscode/settings.json` | Move |
| `AGENTS.md` | `AGENTS.md.scaffold` | preserve existing; move scaffold sibling |
| `CLAUDE.md` | `CLAUDE.md` | move |
| `README.md` | `README.md.scaffold` | preserve existing; move scaffold sibling |
| `astro.config.mjs` | `astro.config.mjs` | move |
| `components.json` | `components.json` | move |
| `eslint.config.js` | `eslint.config.js` | move |
| `node_modules/` | `node_modules/` | Move directory, 30,618 files |
| `package-lock.json` | `package-lock.json` | move |
| `package.json` | `package.json` | move |
| `public/.assetsignore` | `public/.assetsignore` | Move |
| `public/favicon.png` | `public/favicon.png` | Move |
| `public/template.png` | `public/template.png` | Move |
| `scripts/smoke.mjs` | `scripts/smoke.mjs` | Move |
| `src/components/Banner.astro` | `src/components/Banner.astro` | Move |
| `src/components/Topbar.astro` | `src/components/Topbar.astro` | Move |
| `src/components/Welcome.astro` | `src/components/Welcome.astro` | Move |
| `src/components/auth/FormField.tsx` | `src/components/auth/FormField.tsx` | Move |
| `src/components/auth/PasswordToggle.tsx` | `src/components/auth/PasswordToggle.tsx` | Move |
| `src/components/auth/ServerError.tsx` | `src/components/auth/ServerError.tsx` | Move |
| `src/components/auth/SignInForm.tsx` | `src/components/auth/SignInForm.tsx` | Move |
| `src/components/auth/SignUpForm.tsx` | `src/components/auth/SignUpForm.tsx` | Move |
| `src/components/auth/SubmitButton.tsx` | `src/components/auth/SubmitButton.tsx` | Move |
| `src/components/ui/LibBadge.astro` | `src/components/ui/LibBadge.astro` | Move |
| `src/components/ui/button.tsx` | `src/components/ui/button.tsx` | Move |
| `src/env.d.ts` | `src/env.d.ts` | Move |
| `src/layouts/Layout.astro` | `src/layouts/Layout.astro` | Move |
| `src/lib/config-status.ts` | `src/lib/config-status.ts` | Move |
| `src/lib/supabase.ts` | `src/lib/supabase.ts` | Move |
| `src/lib/utils.ts` | `src/lib/utils.ts` | Move |
| `src/middleware.ts` | `src/middleware.ts` | Move |
| `src/pages/api/auth/signin.ts` | `src/pages/api/auth/signin.ts` | Move |
| `src/pages/api/auth/signout.ts` | `src/pages/api/auth/signout.ts` | Move |
| `src/pages/api/auth/signup.ts` | `src/pages/api/auth/signup.ts` | Move |
| `src/pages/auth/confirm-email.astro` | `src/pages/auth/confirm-email.astro` | Move |
| `src/pages/auth/signin.astro` | `src/pages/auth/signin.astro` | Move |
| `src/pages/auth/signup.astro` | `src/pages/auth/signup.astro` | Move |
| `src/pages/dashboard.astro` | `src/pages/dashboard.astro` | Move |
| `src/pages/index.astro` | `src/pages/index.astro` | Move |
| `src/styles/global.css` | `src/styles/global.css` | Move |
| `supabase/.gitignore` | `supabase/.gitignore` | Move |
| `supabase/config.toml` | `supabase/config.toml` | Move |
| `tsconfig.json` | `tsconfig.json` | move |
| `wrangler.jsonc` | `wrangler.jsonc` | move |

#### Captured CLI output

**Stdout**:

```text

added 658 packages, and audited 659 packages in 28s

237 packages are looking for funding
  run `npm fund` for details

11 vulnerabilities (2 moderate, 9 high)

To address all issues, run:
  npm audit fix

Run `npm audit` for details.
```

**Stderr**:

```text
Cloning into '.bootstrap-scaffold'...
npm warn install-scripts 3 packages have install scripts not yet covered by allowScripts:
npm warn install-scripts   esbuild@0.28.2 (postinstall: node install.js)
npm warn install-scripts   workerd@1.20260911.1 (postinstall: node install.js)
npm warn install-scripts   esbuild@0.28.1 (postinstall: node install.js)
npm warn install-scripts
npm warn install-scripts Run `npm install-scripts ls` to review, or `npm install-scripts approve <pkg>` to allow.
```

#### Local verification and configuration adjustment

The first `npm run lint` failed on nine existing `.agents/skills/**` scripts because the application TypeScript project does not include that tooling. Added `globalIgnores([".agents/"])` to `eslint.config.js`, using the official ESLint flat-config helper. The final lint passed. This is the only scaffold configuration change; dependency versions were not patched.

| Check | Exit code | Result |
| --- | --- | --- |
| `npm run build` | 0 | Production build passed; sitemap skipped because `site` is not set. |
| `astro check` | 0 | 29 files, zero errors, warnings, or hints. |
| `npm run lint`, initial | 1 | Nine parsing errors in existing agent tooling. |
| `npm run lint`, final | 0 | Passed after excluding `.agents/`. |

Authentication smoke test was not run: no configured Supabase backend or credentials. Build success does not verify login or deployed Cloudflare behavior.

<details>
<summary>Captured verification output</summary>

**Production build**, exit 0:

```text
> 10x-astro-starter@0.0.1 build
> astro build

▶ Astro collects anonymous usage data.
  This information helps us improve Astro.
  Run "astro telemetry disable" to opt-out.
  https://astro.build/telemetry

20:15:22 [@astrojs/cloudflare] Enabling image processing with Cloudflare Images for production with the "IMAGES" Images binding.
20:15:22 [@astrojs/cloudflare] Enabling sessions with Cloudflare KV with the "SESSION" KV binding.
20:15:23 [types] Generated 269ms
20:15:23 [build] output: "server"
20:15:23 [build] mode: "server"
20:15:23 [build] directory: /root/work/PrintPlan/dist/
20:15:23 [build] adapter: @astrojs/cloudflare
20:15:23 [build] Collecting build info...
20:15:23 [build] ✓ Completed in 320ms.
20:15:23 [build] Building server entrypoints...
20:15:23 [vite] ✓ built in 269ms
20:15:24 [vite] ✓ built in 588ms
20:15:24 [vite] ✓ built in 235ms
20:15:24 [build] Rearranging server assets...
20:15:24 [build] ✓ Completed in 1.15s.
20:15:24 [@astrojs/cloudflare] Injected immutable Cache-Control for /_astro/* into _headers.
20:15:24 [WARN] [@astrojs/sitemap] The Sitemap integration requires the `site` astro.config option. Skipping.
20:15:24 [build] Server built in 1.47s
20:15:24 [build] Complete!
```

**Type check**, exit 0:

```text
20:15:40 [@astrojs/cloudflare] Enabling image processing with Cloudflare Images for production with the "IMAGES" Images binding.
20:15:40 [@astrojs/cloudflare] Enabling sessions with Cloudflare KV with the "SESSION" KV binding.
20:15:40 [types] Generated 86ms
20:15:40 [check] Getting diagnostics for Astro files in /root/work/PrintPlan...
Result (29 files): 
- 0 errors
- 0 warnings
- 0 hints
```

**Initial lint**, exit 1:

```text
> 10x-astro-starter@0.0.1 lint
> eslint .


/root/work/PrintPlan/.agents/skills/10x-observability-audit/scripts/fake-ingest.mjs
  0:0  error  Parsing error: /root/work/PrintPlan/.agents/skills/10x-observability-audit/scripts/fake-ingest.mjs was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject

/root/work/PrintPlan/.agents/skills/10x-plan/scripts/metadata-guard.mjs
  0:0  error  Parsing error: /root/work/PrintPlan/.agents/skills/10x-plan/scripts/metadata-guard.mjs was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject

/root/work/PrintPlan/.agents/skills/10x-plan/scripts/metadata-guard.test.mjs
  0:0  error  Parsing error: /root/work/PrintPlan/.agents/skills/10x-plan/scripts/metadata-guard.test.mjs was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject

/root/work/PrintPlan/.agents/skills/10x-ray/scripts/xray.mjs
  0:0  error  Parsing error: /root/work/PrintPlan/.agents/skills/10x-ray/scripts/xray.mjs was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject

/root/work/PrintPlan/.agents/skills/10x-repo-map/scripts/graph-metrics.mjs
  0:0  error  Parsing error: /root/work/PrintPlan/.agents/skills/10x-repo-map/scripts/graph-metrics.mjs was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject

/root/work/PrintPlan/.agents/skills/10x-repo-map/scripts/graph-metrics.test.mjs
  0:0  error  Parsing error: /root/work/PrintPlan/.agents/skills/10x-repo-map/scripts/graph-metrics.test.mjs was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject

/root/work/PrintPlan/.agents/skills/10x-research/scripts/metadata-guard.mjs
  0:0  error  Parsing error: /root/work/PrintPlan/.agents/skills/10x-research/scripts/metadata-guard.mjs was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject

/root/work/PrintPlan/.agents/skills/10x-research/scripts/prose-json-check.mjs
  0:0  error  Parsing error: /root/work/PrintPlan/.agents/skills/10x-research/scripts/prose-json-check.mjs was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject

/root/work/PrintPlan/.agents/skills/10x-research/scripts/prose-json-check.test.mjs
  0:0  error  Parsing error: /root/work/PrintPlan/.agents/skills/10x-research/scripts/prose-json-check.test.mjs was not found by the project service. Consider either including it in the tsconfig.json or including it in allowDefaultProject

✖ 9 problems (9 errors, 0 warnings)
```

**Final lint**, exit 0:

```text
> 10x-astro-starter@0.0.1 lint
> eslint .
```

</details>

## Post-scaffold audit

**Tool**: `npm audit --json`
**Exit code**: 1 (findings present; informational)
**Summary**: 0 CRITICAL, 9 HIGH, 2 MODERATE, 0 LOW, 0 INFO

Counts are npm affected-package records, including packages affected through transitive dependencies; they are not a count of unique advisories. No automatic fixes were applied.

| Severity | Total affected packages | Direct | Transitive |
| --- | --- | --- | --- |
| CRITICAL | 0 | 0 | 0 |
| HIGH | 9 | 1 | 8 |
| MODERATE | 2 | 0 | 2 |
| LOW | 0 | 0 | 0 |
| INFO | 0 | 0 | 0 |

**Dependency metadata**: `{"prod": 377, "dev": 269, "optional": 167, "peer": 0, "peerOptional": 0, "total": 804}`

#### CRITICAL findings

None.

#### HIGH findings

**`@cloudflare/vite-plugin`** — installed versions: 1.54.8; transitive.
Affected range: `<=0.0.0-7ae5dd357 || 1.2.3 - 1.63.0 || >=2.0.0-beta.sha-238e489d5`. Fix: Available according to npm; exact fixed package version not provided.

- Affected through `miniflare`; inspect its findings above or below.
- Affected through `wrangler`; inspect its findings above or below.

**`brace-expansion`** — installed versions: 1.1.18, 5.0.9; transitive.
Affected range: `<=1.1.20 || 4.0.0 - 5.0.11`. Fix: Available according to npm; exact fixed package version not provided.

- [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), MODERATE: brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service. Affected range: `<1.1.21`.
- [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), MODERATE: brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service. Affected range: `>=4.0.0 <5.0.12`.
- [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), HIGH: brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion. Affected range: `<1.1.20`.
- [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), HIGH: brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion. Affected range: `>=4.0.0 <5.0.11`.
- [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), HIGH: brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion. Affected range: `<1.1.19`.
- [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), HIGH: brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion. Affected range: `>=4.0.0 <5.0.10`.

**`devalue`** — installed versions: 5.9.2; transitive.
Affected range: `<=5.9.2`. Fix: Available according to npm; exact fixed package version not provided.

- [GHSA-j22f-vq7h-c4qm](https://github.com/advisories/GHSA-j22f-vq7h-c4qm), HIGH: devalue: `stringify`/`uneval` serialize shared memory. Affected range: `>=5.1.0 <=5.9.2`.
- [GHSA-hx4r-w6wj-j8fg](https://github.com/advisories/GHSA-hx4r-w6wj-j8fg), MODERATE: devalue: Residual sparse-array CPU amplification in uneval. Affected range: `<=5.9.2`.
- [GHSA-mcm9-63f2-9j32](https://github.com/advisories/GHSA-mcm9-63f2-9j32), HIGH: devalue: Repeated primitive strings cause quadratic expansion in uneval. Affected range: `<=5.9.2`.
- [GHSA-wf3x-273g-mvxv](https://github.com/advisories/GHSA-wf3x-273g-mvxv), LOW: devalue: Sparse arrays emitted by uneval cause eager allocation when evaluated. Affected range: `>=1.0.0 <=5.9.2`.
- [GHSA-x5rw-q4pp-hg5g](https://github.com/advisories/GHSA-x5rw-q4pp-hg5g), HIGH: devalue: stringifyAsync can cause an unhandled rejection despite a caught returned promise. Affected range: `>=5.8.0 <=5.9.2`.
- [GHSA-4q55-j62x-fr9h](https://github.com/advisories/GHSA-4q55-j62x-fr9h), MODERATE: devalue: Malformed null-prototype object keys bypass __proto__ rejection via property-key coercion. Affected range: `<=5.9.2`.

**`http-cache-semantics`** — installed versions: 4.2.0; transitive.
Affected range: `<=4.2.0`. Fix: Available according to npm; exact fixed package version not provided.

- [GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp), HIGH: http-cache-semantics max-stale handling can disclose cross-user cached responses. Affected range: `<=4.2.0`.

**`miniflare`** — installed versions: 5.20260911.0-alpha; transitive.
Affected range: `<=0.0.0-fec45ed61 || 4.20250508.3 - 5.20261006.0-alpha`. Fix: Available according to npm; exact fixed package version not provided.

- Affected through `sharp`; inspect its findings above or below.
- Affected through `undici`; inspect its findings above or below.

**`sharp`** — installed versions: 0.35.4; transitive.
Affected range: `<0.35.5`. Fix: Available according to npm; exact fixed package version not provided.

- [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w), HIGH: sharp : Vulnerability in librsvg dependency CVE-2026-96889. Affected range: `<0.35.5`.

**`source-map-js`** — installed versions: 1.2.1; transitive.
Affected range: `1.0.0 - 1.2.1`. Fix: Available according to npm; exact fixed package version not provided.

- [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q), HIGH: source-map-js allows event-loop denial of service through indexed source-map section offsets. Affected range: `>=1.0.0 <1.2.2`.

**`undici`** — installed versions: 7.29.0; transitive.
Affected range: `7.0.0 - 7.29.0`. Fix: Available according to npm; exact fixed package version not provided.

- [GHSA-3wwx-pv8p-q78v](https://github.com/advisories/GHSA-3wwx-pv8p-q78v), MODERATE: undici vulnerable to Denial of Service via unhandled error in WebSocket permessage-deflate decompression. Affected range: `>=7.28.0 <7.29.1`.
- [GHSA-pmjh-fq2x-6v4x](https://github.com/advisories/GHSA-pmjh-fq2x-6v4x), MODERATE: undici vulnerable to Denial of Service via orphaned RetryHandler response body. Affected range: `>=7.11.0 <7.29.1`.
- [GHSA-r53p-7pc4-xj5r](https://github.com/advisories/GHSA-r53p-7pc4-xj5r), LOW: undici vulnerable to downstream response splitting via retry interceptor. Affected range: `>=7.0.0 <7.29.1`.
- [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5), HIGH: undici vulnerable to Denial of Service via unrequested WebSocket subprotocol. Affected range: `>=7.0.0 <7.29.1`.
- [GHSA-3xpg-4rpp-hhhm](https://github.com/advisories/GHSA-3xpg-4rpp-hhhm), MODERATE: undici vulnerable to Denial of Service via unbounded decompression of compressed responses. Affected range: `>=7.15.0 <7.29.1`.
- [GHSA-2jfj-6hjv-fm6j](https://github.com/advisories/GHSA-2jfj-6hjv-fm6j), MODERATE: undici vulnerable to cross-user cookie disclosure via Set-Cookie caching in shared caches. Affected range: `>=7.0.0 <7.29.1`.
- [GHSA-2gqq-gqf2-x968](https://github.com/advisories/GHSA-2gqq-gqf2-x968), LOW: undici vulnerable to response truncation via oversized chunked responses in the dump interceptor. Affected range: `>=7.1.0 <7.29.1`.
- [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3), HIGH: undici vulnerable to TLS certificate validation bypass via dropped connect options in BalancedPool. Affected range: `>=7.24.1 <7.29.1`.
- [GHSA-8436-99hf-9mmv](https://github.com/advisories/GHSA-8436-99hf-9mmv), LOW: undici vulnerable to caching and replay of unsafe HTTP method responses. Affected range: `>=7.0.0 <7.29.1`.
- [GHSA-rx4f-c7p8-82vq](https://github.com/advisories/GHSA-rx4f-c7p8-82vq), MODERATE: undici vulnerable to Denial of Service via WebSocketStream unclean close. Affected range: `>=7.0.0 <7.29.1`.

**`wrangler`** — installed versions: 4.131.1; direct.
Affected range: `<=0.0.0-7ae5dd357 || 4.16.0 - 4.148.0`. Fix: Available according to npm; exact fixed package version not provided.

- Affected through `miniflare`; inspect its findings above or below.

#### MODERATE findings

**`fast-uri`** — installed versions: 3.1.7; transitive.
Affected range: `3.0.0 - 3.1.7`. Fix: Available according to npm; exact fixed package version not provided.

- [GHSA-hrr3-gc8f-f4qj](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj), MODERATE: fast-uri vulnerable to inconsistent host case normalization via percent-encoded octets. Affected range: `>=3.0.0 <3.1.8`.

**`smol-toml`** — installed versions: 1.8.0; transitive.
Affected range: `<=1.8.0`. Fix: Available according to npm; exact fixed package version not provided.

- [GHSA-r4xh-jqrq-34v2](https://github.com/advisories/GHSA-r4xh-jqrq-34v2), MODERATE: smol-toml: Quadratic-time parse() from parseKey rescanning to end of document on each key line. Affected range: `<=1.8.0`.

#### LOW findings

None.

#### INFO findings

None.

<details>
<summary>Full raw npm audit output</summary>

```json
{
  "auditReportVersion": 2,
  "vulnerabilities": {
    "@cloudflare/vite-plugin": {
      "name": "@cloudflare/vite-plugin",
      "severity": "high",
      "isDirect": false,
      "via": [
        "miniflare",
        "wrangler"
      ],
      "effects": [],
      "range": "<=0.0.0-7ae5dd357 || 1.2.3 - 1.63.0 || >=2.0.0-beta.sha-238e489d5",
      "nodes": [
        "node_modules/@cloudflare/vite-plugin"
      ],
      "fixAvailable": true
    },
    "brace-expansion": {
      "name": "brace-expansion",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1240100,
          "name": "brace-expansion",
          "dependency": "brace-expansion",
          "title": "brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service",
          "url": "https://github.com/advisories/GHSA-q2hr-2g5m-vwhr",
          "severity": "moderate",
          "cwe": [
            "CWE-400",
            "CWE-407"
          ],
          "cvss": {
            "score": 5.3,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"
          },
          "range": "<1.1.21"
        },
        {
          "source": 1240103,
          "name": "brace-expansion",
          "dependency": "brace-expansion",
          "title": "brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service",
          "url": "https://github.com/advisories/GHSA-q2hr-2g5m-vwhr",
          "severity": "moderate",
          "cwe": [
            "CWE-400",
            "CWE-407"
          ],
          "cvss": {
            "score": 5.3,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"
          },
          "range": ">=4.0.0 <5.0.12"
        },
        {
          "source": 1240104,
          "name": "brace-expansion",
          "dependency": "brace-expansion",
          "title": "brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion",
          "url": "https://github.com/advisories/GHSA-qhr7-859c-m2p7",
          "severity": "high",
          "cwe": [
            "CWE-400",
            "CWE-674"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": "<1.1.20"
        },
        {
          "source": 1240107,
          "name": "brace-expansion",
          "dependency": "brace-expansion",
          "title": "brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion",
          "url": "https://github.com/advisories/GHSA-qhr7-859c-m2p7",
          "severity": "high",
          "cwe": [
            "CWE-400",
            "CWE-674"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": ">=4.0.0 <5.0.11"
        },
        {
          "source": 1240108,
          "name": "brace-expansion",
          "dependency": "brace-expansion",
          "title": "brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion",
          "url": "https://github.com/advisories/GHSA-6j4f-fj2g-mc7p",
          "severity": "high",
          "cwe": [
            "CWE-400",
            "CWE-674"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": "<1.1.19"
        },
        {
          "source": 1240111,
          "name": "brace-expansion",
          "dependency": "brace-expansion",
          "title": "brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion",
          "url": "https://github.com/advisories/GHSA-6j4f-fj2g-mc7p",
          "severity": "high",
          "cwe": [
            "CWE-400",
            "CWE-674"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": ">=4.0.0 <5.0.10"
        }
      ],
      "effects": [],
      "range": "<=1.1.20 || 4.0.0 - 5.0.11",
      "nodes": [
        "node_modules/brace-expansion",
        "node_modules/eslint-plugin-jsx-a11y/node_modules/brace-expansion",
        "node_modules/eslint-plugin-react/node_modules/brace-expansion"
      ],
      "fixAvailable": true
    },
    "devalue": {
      "name": "devalue",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1240870,
          "name": "devalue",
          "dependency": "devalue",
          "title": "devalue: `stringify`/`uneval` serialize shared memory",
          "url": "https://github.com/advisories/GHSA-j22f-vq7h-c4qm",
          "severity": "high",
          "cwe": [
            "CWE-200",
            "CWE-226"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N"
          },
          "range": ">=5.1.0 <=5.9.2"
        },
        {
          "source": 1240871,
          "name": "devalue",
          "dependency": "devalue",
          "title": "devalue: Residual sparse-array CPU amplification in uneval",
          "url": "https://github.com/advisories/GHSA-hx4r-w6wj-j8fg",
          "severity": "moderate",
          "cwe": [
            "CWE-400",
            "CWE-407"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": "<=5.9.2"
        },
        {
          "source": 1240872,
          "name": "devalue",
          "dependency": "devalue",
          "title": "devalue: Repeated primitive strings cause quadratic expansion in uneval",
          "url": "https://github.com/advisories/GHSA-mcm9-63f2-9j32",
          "severity": "high",
          "cwe": [
            "CWE-400",
            "CWE-409"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": "<=5.9.2"
        },
        {
          "source": 1240873,
          "name": "devalue",
          "dependency": "devalue",
          "title": "devalue: Sparse arrays emitted by uneval cause eager allocation when evaluated",
          "url": "https://github.com/advisories/GHSA-wf3x-273g-mvxv",
          "severity": "low",
          "cwe": [
            "CWE-400",
            "CWE-789"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": ">=1.0.0 <=5.9.2"
        },
        {
          "source": 1240874,
          "name": "devalue",
          "dependency": "devalue",
          "title": "devalue: stringifyAsync can cause an unhandled rejection despite a caught returned promise",
          "url": "https://github.com/advisories/GHSA-x5rw-q4pp-hg5g",
          "severity": "high",
          "cwe": [
            "CWE-248",
            "CWE-755"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": ">=5.8.0 <=5.9.2"
        },
        {
          "source": 1240875,
          "name": "devalue",
          "dependency": "devalue",
          "title": "devalue: Malformed null-prototype object keys bypass __proto__ rejection via property-key coercion",
          "url": "https://github.com/advisories/GHSA-4q55-j62x-fr9h",
          "severity": "moderate",
          "cwe": [
            "CWE-1321"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": "<=5.9.2"
        }
      ],
      "effects": [],
      "range": "<=5.9.2",
      "nodes": [
        "node_modules/devalue"
      ],
      "fixAvailable": true
    },
    "fast-uri": {
      "name": "fast-uri",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        {
          "source": 1240091,
          "name": "fast-uri",
          "dependency": "fast-uri",
          "title": "fast-uri vulnerable to inconsistent host case normalization via percent-encoded octets",
          "url": "https://github.com/advisories/GHSA-hrr3-gc8f-f4qj",
          "severity": "moderate",
          "cwe": [
            "CWE-178"
          ],
          "cvss": {
            "score": 4.8,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:L/A:N"
          },
          "range": ">=3.0.0 <3.1.8"
        }
      ],
      "effects": [],
      "range": "3.0.0 - 3.1.7",
      "nodes": [
        "node_modules/fast-uri"
      ],
      "fixAvailable": true
    },
    "http-cache-semantics": {
      "name": "http-cache-semantics",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1240991,
          "name": "http-cache-semantics",
          "dependency": "http-cache-semantics",
          "title": "http-cache-semantics max-stale handling can disclose cross-user cached responses",
          "url": "https://github.com/advisories/GHSA-ch52-4w7c-c8xp",
          "severity": "high",
          "cwe": [
            "CWE-524"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N"
          },
          "range": "<=4.2.0"
        }
      ],
      "effects": [],
      "range": "<=4.2.0",
      "nodes": [
        "node_modules/http-cache-semantics"
      ],
      "fixAvailable": true
    },
    "miniflare": {
      "name": "miniflare",
      "severity": "high",
      "isDirect": false,
      "via": [
        "sharp",
        "undici"
      ],
      "effects": [
        "@cloudflare/vite-plugin",
        "wrangler"
      ],
      "range": "<=0.0.0-fec45ed61 || 4.20250508.3 - 5.20261006.0-alpha",
      "nodes": [
        "node_modules/miniflare"
      ],
      "fixAvailable": true
    },
    "sharp": {
      "name": "sharp",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1241331,
          "name": "sharp",
          "dependency": "sharp",
          "title": "sharp : Vulnerability in librsvg dependency CVE-2026-96889",
          "url": "https://github.com/advisories/GHSA-wq5f-xc86-pv6w",
          "severity": "high",
          "cwe": [
            "CWE-416",
            "CWE-1395"
          ],
          "cvss": {
            "score": 0,
            "vectorString": null
          },
          "range": "<0.35.5"
        }
      ],
      "effects": [
        "miniflare"
      ],
      "range": "<0.35.5",
      "nodes": [
        "node_modules/sharp"
      ],
      "fixAvailable": true
    },
    "smol-toml": {
      "name": "smol-toml",
      "severity": "moderate",
      "isDirect": false,
      "via": [
        {
          "source": 1241205,
          "name": "smol-toml",
          "dependency": "smol-toml",
          "title": "smol-toml: Quadratic-time parse() from parseKey rescanning to end of document on each key line",
          "url": "https://github.com/advisories/GHSA-r4xh-jqrq-34v2",
          "severity": "moderate",
          "cwe": [
            "CWE-407"
          ],
          "cvss": {
            "score": 5.3,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L"
          },
          "range": "<=1.8.0"
        }
      ],
      "effects": [],
      "range": "<=1.8.0",
      "nodes": [
        "node_modules/smol-toml"
      ],
      "fixAvailable": true
    },
    "source-map-js": {
      "name": "source-map-js",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1241209,
          "name": "source-map-js",
          "dependency": "source-map-js",
          "title": "source-map-js allows event-loop denial of service through indexed source-map section offsets",
          "url": "https://github.com/advisories/GHSA-68fv-2mgg-jv7q",
          "severity": "high",
          "cwe": [
            "CWE-1284"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": ">=1.0.0 <1.2.2"
        }
      ],
      "effects": [],
      "range": "1.0.0 - 1.2.1",
      "nodes": [
        "node_modules/source-map-js"
      ],
      "fixAvailable": true
    },
    "undici": {
      "name": "undici",
      "severity": "high",
      "isDirect": false,
      "via": [
        {
          "source": 1239933,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to Denial of Service via unhandled error in WebSocket permessage-deflate decompression",
          "url": "https://github.com/advisories/GHSA-3wwx-pv8p-q78v",
          "severity": "moderate",
          "cwe": [
            "CWE-248"
          ],
          "cvss": {
            "score": 5.9,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": ">=7.28.0 <7.29.1"
        },
        {
          "source": 1240036,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to Denial of Service via orphaned RetryHandler response body",
          "url": "https://github.com/advisories/GHSA-pmjh-fq2x-6v4x",
          "severity": "moderate",
          "cwe": [
            "CWE-772"
          ],
          "cvss": {
            "score": 5.9,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": ">=7.11.0 <7.29.1"
        },
        {
          "source": 1240038,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to downstream response splitting via retry interceptor",
          "url": "https://github.com/advisories/GHSA-r53p-7pc4-xj5r",
          "severity": "low",
          "cwe": [
            "CWE-444"
          ],
          "cvss": {
            "score": 3.7,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N"
          },
          "range": ">=7.0.0 <7.29.1"
        },
        {
          "source": 1240041,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to Denial of Service via unrequested WebSocket subprotocol",
          "url": "https://github.com/advisories/GHSA-rfgv-xxqx-mfg5",
          "severity": "high",
          "cwe": [
            "CWE-248",
            "CWE-252"
          ],
          "cvss": {
            "score": 7.5,
            "vectorString": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": ">=7.0.0 <7.29.1"
        },
        {
          "source": 1240044,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to Denial of Service via unbounded decompression of compressed responses",
          "url": "https://github.com/advisories/GHSA-3xpg-4rpp-hhhm",
          "severity": "moderate",
          "cwe": [
            "CWE-770"
          ],
          "cvss": {
            "score": 5.9,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": ">=7.15.0 <7.29.1"
        },
        {
          "source": 1240046,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to cross-user cookie disclosure via Set-Cookie caching in shared caches",
          "url": "https://github.com/advisories/GHSA-2jfj-6hjv-fm6j",
          "severity": "moderate",
          "cwe": [
            "CWE-200",
            "CWE-524"
          ],
          "cvss": {
            "score": 6.5,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:L/A:N"
          },
          "range": ">=7.0.0 <7.29.1"
        },
        {
          "source": 1240048,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to response truncation via oversized chunked responses in the dump interceptor",
          "url": "https://github.com/advisories/GHSA-2gqq-gqf2-x968",
          "severity": "low",
          "cwe": [
            "CWE-20",
            "CWE-248"
          ],
          "cvss": {
            "score": 3.7,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N"
          },
          "range": ">=7.1.0 <7.29.1"
        },
        {
          "source": 1240050,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to TLS certificate validation bypass via dropped connect options in BalancedPool",
          "url": "https://github.com/advisories/GHSA-w293-vg96-wgc3",
          "severity": "high",
          "cwe": [
            "CWE-295"
          ],
          "cvss": {
            "score": 7.4,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N"
          },
          "range": ">=7.24.1 <7.29.1"
        },
        {
          "source": 1240052,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to caching and replay of unsafe HTTP method responses",
          "url": "https://github.com/advisories/GHSA-8436-99hf-9mmv",
          "severity": "low",
          "cwe": [
            "CWE-345"
          ],
          "cvss": {
            "score": 3.7,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N"
          },
          "range": ">=7.0.0 <7.29.1"
        },
        {
          "source": 1240055,
          "name": "undici",
          "dependency": "undici",
          "title": "undici vulnerable to Denial of Service via WebSocketStream unclean close",
          "url": "https://github.com/advisories/GHSA-rx4f-c7p8-82vq",
          "severity": "moderate",
          "cwe": [
            "CWE-248",
            "CWE-754"
          ],
          "cvss": {
            "score": 5.9,
            "vectorString": "CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:N/A:H"
          },
          "range": ">=7.0.0 <7.29.1"
        }
      ],
      "effects": [
        "miniflare"
      ],
      "range": "7.0.0 - 7.29.0",
      "nodes": [
        "node_modules/undici"
      ],
      "fixAvailable": true
    },
    "wrangler": {
      "name": "wrangler",
      "severity": "high",
      "isDirect": true,
      "via": [
        "miniflare"
      ],
      "effects": [
        "@cloudflare/vite-plugin"
      ],
      "range": "<=0.0.0-7ae5dd357 || 4.16.0 - 4.148.0",
      "nodes": [
        "node_modules/wrangler"
      ],
      "fixAvailable": true
    }
  },
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 0,
      "moderate": 2,
      "high": 9,
      "critical": 0,
      "total": 11
    },
    "dependencies": {
      "prod": 377,
      "dev": 269,
      "optional": 167,
      "peer": 0,
      "peerOptional": 0,
      "total": 804
    }
  }
}
```

**Stderr**:

```text
(empty)
```

</details>

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| team_size | `solo` |
| deployment_target | `cloudflare-workers` |
| ci_provider | `cloudflare-builds` |
| ci_default_flow | `auto-deploy-on-merge` |
| bootstrapper_confidence | `first-class` |
| path_taken | `standard` |
| quality_override | `false` |
| self_check_answers | `null` |
| has_auth | `true` |
| has_payments | `false` |
| has_realtime | `false` |
| has_ai | `false` |
| has_background_jobs | `false` |

Deployment and CI hints were recorded only. The upstream `wrangler.jsonc` and `package.json` retain the name `10x-astro-starter`; `print-plan` is hand-off metadata under this skill. The GitHub Actions workflow and `CLAUDE.md` were inherited from the starter; no new agent instructions or CI workflows were authored. Existing `AGENTS.md` remains canonical. Cloudflare Builds was not connected or configured.

## Next steps

Next: a future skill will set up agent context. This project already has `AGENTS.md`; review the preserved starter copy before incorporating any guidance. The project is scaffolded, with build, type, and lint checks passing; audit findings remain recorded above.

- Review `AGENTS.md.scaffold` and `README.md.scaffold` and decide which guidance to incorporate.
- Configure Supabase using the inherited `README.md.scaffold` and `.env.example`; local Cloudflare secrets belong in `.dev.vars`.
- Review the audit findings before deployment.
- Set the Cloudflare Worker name to `print-plan` and connect Cloudflare Builds when implementing deployment.
- Set the canonical `site` URL in `astro.config.mjs` when known to enable sitemap generation.

The current repository history was preserved. No deployment or external service configuration was performed.
