---
date: 2026-10-29T14:24:02Z
researcher: Codex
git_commit: 43ccc7f2d5003a2d9cfc477cf84dd57cbd865dff
branch: roadmap-close-milestone
repository: PrintPlan
topic: "PR review with Codex Business on a self-hosted Linux GitHub Actions runner"
tags: [research, ci, code-review, codex, github-actions, self-hosted-runner]
status: complete
last_updated: 2026-10-29
last_updated_by: Codex
last_updated_note: "Initial repository audit and current documentation verification; no implementation."
---

# Research: PR review on a local Linux runner

## Research question and scope

Inspect the current workflows and local reviewer; establish how a private repository can run automatic PR review through GitHub Actions on the author's Linux computer using their ChatGPT Business Codex access. Identify permissions, runner-account authentication, and manual computer/GitHub configuration. Save research without implementation.

The requested output is a PR conversation comment, as recorded in [change.md](change.md:16). This investigation did not register a runner, log in to an account, create credentials, publish comments, or change workflows. Repository evidence describes the inspected working tree, not verified live GitHub settings. Existing edits to AGENTS.md and README.md were left intact.

## Summary

- **This is supported in principle:** current OpenAI documentation lists Codex access tokens for Business and Enterprise trusted automation. A token is the preferred candidate here if the workspace exposes the required permission. A persistent ChatGPT login on the runner is a documented alternative. Actual workspace availability remains an operator check. See [Access tokens](https://learn.chatgpt.com/docs/enterprise/access-tokens).
- **The existing reviewer requires an adapter.** The local skill is interactive and plan-driven; its CI sibling writes reports, changes metadata, commits, and pushes. The bundled workflow uses Claude and an Anthropic API key. These are instructions/templates, not an active Codex review workflow. See [local reviewer](../../../.agents/skills/10x-impl-review/SKILL.md:18), [CI sibling](../../../.agents/skills/10x-impl-review-ci/SKILL.md:14), and [template](../../../.agents/skills/10x-impl-review-ci/references/workflow-template.yml:124).
- **GitHub credentials are separate from Codex credentials.** Same-repository checkout and a PR summary comment can use the job's temporary `GITHUB_TOKEN` with `contents: read` and `pull-requests: write`; branch-write permissions and a personal GitHub login are unnecessary for that path. See [GitHub token authentication](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token) and [comment permissions](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment).
- **Recommended direction for planning:** a dedicated review job on an isolated Linux environment hosted on the author's computer, a non-root runner account, Codex CLI with read-only review permissions, trusted review instructions, and deterministic comment publication. Retain the existing validation/integration jobs. This is a recommendation, not an approved implementation plan.

## Detailed findings

### 1. Current workflows and reviewer

The inspected `.github/workflows/` contains `ci.yml`. It runs on pushes and PRs targeting `master`; its `ci` and `smoke` jobs use `ubuntu-latest`. The native job runs contract tests, lint, types, and build. The integration job starts local Supabase/Mailpit, checks the database/migrations/concurrency, runs browser tests, and performs HTTP smoke scenarios. This workflow does not invoke a reviewer or publish PR comments. Evidence: [ci.yml](../../../.github/workflows/ci.yml:1), especially lines 10–35 and 43–113. This finding is limited to the checked-out workflow inventory; GitHub Apps installed outside the repository were not inspected.

The project's runtime pin is Node `24.21.0` in [.nvmrc](../../../.nvmrc:1); it uses npm and package-lock, with scripts in [package.json](../../../package.json:6). The repo has no demonstrated standalone reviewer binary in the inspected `.github/`, `.agents/`, `.codex/`, and `scripts/` review-related paths.

The reusable pieces have different contracts:

- **`10x-impl-review`:** resolves a change/plan/phase, loads the plan, gathers evidence through agents, runs verification commands, saves the review, and changes lifecycle metadata. The no-argument path asks for confirmation; the closing triage is interactive. See [resolution and evidence](../../../.agents/skills/10x-impl-review/SKILL.md:18), [verification](../../../.agents/skills/10x-impl-review/SKILL.md:88), [persistence](../../../.agents/skills/10x-impl-review/SKILL.md:251), and [triage](../../../.agents/skills/10x-impl-review/SKILL.md:331).
- **`10x-impl-review-ci`:** designed for unattended operation, but assumes a plan, authenticated `gh`, a toolchain, and subagents. A missing plan leads to a neutral skip comment. Its persistence path changes `change.md`, commits and pushes the report, then publishes inline and summary comments. See [inputs and plan discovery](../../../.agents/skills/10x-impl-review-ci/SKILL.md:20), [missing-plan behavior](../../../.agents/skills/10x-impl-review-ci/SKILL.md:63), [report/metadata](../../../.agents/skills/10x-impl-review-ci/SKILL.md:154), and [commit/push](../../../.agents/skills/10x-impl-review-ci/SKILL.md:224).
- **Shared review criteria:** plan adherence, scope, safety, architecture, consistency, coverage, and success criteria are described separately from provider/publishing mechanics. This is the strongest reuse point. The file also instructs test execution, so a static-only adapter must explicitly explain how current CI evidence replaces that execution; it cannot silently claim the original full verification contract. See [criteria](../../../.agents/skills/10x-impl-review-ci/references/impl-review-instructions.md:5) and [test verification](../../../.agents/skills/10x-impl-review-ci/references/impl-review-instructions.md:75).
- **Other toolkit templates:** `m5l3-review.yml.template` points at `./.github/actions/ai-reviewer`, while `m5l3-action.yml.template` expects a built `dist/review.js` and `LLM_PROVIDER_API_KEY`. These templates do not establish an installed reviewer in this checkout. See [workflow template](../../../.agents/config-templates/m5l3-review.yml.template:39) and [action template](../../../.agents/config-templates/m5l3-action.yml.template:4).
- **Codex hooks:** PostToolUse/Stop invoke local quality checks; they do not provide runner registration, Codex login, or GitHub comment publication. See [hooks.json](../../../.codex/hooks.json:3).

The bundled CI workflow cannot be adopted by changing `runs-on` alone: it uses pnpm, `.claude/skills`, `anthropics/claude-code-action`, and `ANTHROPIC_API_KEY`, with contents/statuses write permissions. See [template toolchain](../../../.agents/skills/10x-impl-review-ci/references/workflow-template.yml:70), [skill staging](../../../.agents/skills/10x-impl-review-ci/references/workflow-template.yml:104), and [action](../../../.agents/skills/10x-impl-review-ci/references/workflow-template.yml:124).

Specific template issues to avoid carrying forward:

- The skill commits as `ai-assistant[bot]`, whereas the workflow's author checks expect `claude[bot]`: [skill](../../../.agents/skills/10x-impl-review-ci/SKILL.md:238), [guard](../../../.agents/skills/10x-impl-review-ci/references/workflow-template.yml:92), [validation](../../../.agents/skills/10x-impl-review-ci/references/workflow-template.yml:182).
- Verdict selection uses report modification time across active changes rather than the resolved change and reviewed SHA; an unparseable verdict becomes a success status: [selection](../../../.agents/skills/10x-impl-review-ci/references/workflow-template.yml:250), [fallback](../../../.agents/skills/10x-impl-review-ci/references/workflow-template.yml:282).
- Executing commands taken from a PR plan exposes the machine to PR-controlled code: [test execution](../../../.agents/skills/10x-impl-review-ci/SKILL.md:122), [other commands](../../../.agents/skills/10x-impl-review-ci/SKILL.md:130). A comment-only adapter does not need the branch-write mechanism or its extra permissions.

### 2. Codex access, account identity, and billing

Distinguish the Linux account running the service, the ChatGPT workspace identity authorizing inference, and the job's GitHub token. Naming the Linux account `printplan-runner` does not create a ChatGPT service account or a GitHub bot.

**Option A — workspace access token, preferred if available.** The workspace owner enables token creation and local Codex access under Permissions & roles. The workflow owner creates a time-limited token at [Access tokens](https://chatgpt.com/admin/access-tokens), selecting the Codex scope if shown. Supply it as `CODEX_ACCESS_TOKEN` to the Codex process, or persist it by piping it to `codex login --with-access-token`. The token represents its workspace creator. Keep it out of logs, rotate it, and verify any minimum CLI version shown by the creation dialog. Source: [Access tokens setup and CLI usage](https://learn.chatgpt.com/docs/enterprise/access-tokens).

**Option B — persistent ChatGPT login.** Run `codex login` as the runner's Linux user and complete browser sign-in to the Business identity. For a headless session use `codex login --device-auth`; a workspace administrator must permit device authentication. Cache location is the OS credential store or `auth.json` under `CODEX_HOME`. Source: [Authentication](https://learn.chatgpt.com/docs/auth#login-on-headless-devices).

For a system service without an unlocked desktop keyring, file storage is a practical choice if workspace policy permits it. Use a persistent directory outside the checkout, restrict directory/file access, and keep login and service runs on the same effective user and `CODEX_HOME`. Codex can refresh managed ChatGPT credentials during normal execution; retain its updated file rather than restoring an old seed each run. Use a serialized stream per credential cache and reauthenticate when recovery fails. Source: [advanced CI authentication](https://learn.chatgpt.com/docs/auth/ci-cd-auth). This path is documented for trusted private infrastructure, matching the requested repository type but still requiring runner isolation.

**Option C — OpenAI API key.** The official GitHub Action's published example uses an API key and an API proxy. That is a separate credential/billing route; possessing Business access does not supply the key used in that example. Direct CLI invocation with Option A/B is the clearer fit to the requested workspace access. Avoid copying the action's irreversible `drop-sudo` strategy onto a personal computer without an isolated environment. Source: [Codex GitHub Action](https://learn.chatgpt.com/docs/github-action).

**Optional non-human ChatGPT identity:** OpenAI documents service accounts for pay-as-you-go plans, managed by workspace owners/admins. Do not assume the author's existing Business seat includes that arrangement. It is not required to use a personal workspace token or managed ChatGPT login. Source: [Service accounts](https://learn.chatgpt.com/docs/enterprise/service-accounts).

**Limits and costs:** CLI reviews use general Codex usage, even when GitHub Actions launches them; they do not become the native GitHub Code Review product's usage merely by posting a PR comment. Included usage, purchased credits, and workspace billing depend on the account's plan. Check the actual usage dashboard; this research does not establish a fixed PR allowance or unlimited included automation. Source: [Pricing and Code Review usage](https://learn.chatgpt.com/docs/pricing#what-counts-as-code-review-usage).

**Alternative product:** native Codex GitHub review supports connected repositories, automatic review settings, `@codex review`, and repository `AGENTS.md` guidance. It runs through OpenAI's GitHub integration, so it does not execute this project's local review skill on the author's runner. This is an alternative if custom local reviewer execution is later dropped, not the selected architecture. Source: [Review GitHub pull requests with Codex](https://learn.chatgpt.com/docs/third-party/github).

### 3. Permissions and GitHub authentication

For the same-repository comment-only design:

- Checkout/repository content: `contents: read`.
- PR metadata/diff and conversation-comment publication: `pull-requests: write` (read is included). The issue-comment endpoint also accepts `issues: write` as an alternative; granting both is unnecessary for this path. Formal PR reviews use a different endpoint and also require Pull requests write. Sources: [issue comments](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment), [PR reviews](https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request).
- A separated inference job can receive read permissions while a trusted publisher receives `pull-requests: write`. Source and recommendation basis: [token permissions](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).
- The proposed path does not need `contents: write`, custom `statuses: write`, `checks: write`, `actions: write`, or `id-token: write`. Actions creates its normal workflow check; custom status publishing is an additional capability, not needed to post a comment. The existing template's extra rights support its commit/status design.
- Use the automatic job token, passing it as `GH_TOKEN` to `gh` if that CLI is chosen. No persistent `gh auth login`, PAT, or separate GitHub App installation is needed for same-repository checkout/comment. Cross-repository access or a different bot identity would be a separate requirement. Source: [GITHUB_TOKEN authentication](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).

Registering a repository runner requires the personal repository's owner, or appropriate organization-owner/repository-admin rights for an organization repository, subject to organization policy. The generated runner registration token expires after one hour; it is distinct from the job token and Codex credentials. Source: [Adding self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).

### 4. Linux runner operation and trust boundary

A supported Linux distribution/architecture, running runner application, and outbound HTTPS on port 443 are required. GitHub lists endpoint groups for job orchestration, action download, logs/artifacts, and runner updates; OpenAI and any package registry require additional access. A shell-only reviewer does not require Docker merely because the runner is self-hosted. The computer must remain online/awake for timely reviews. Source: [self-hosted runner reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners).

Use a custom label such as `printplan-review` alongside the installed runner's default labels. An x64 example is `[self-hosted, linux, x64, printplan-review]`; use the actual architecture. Labels route jobs and do not establish authorization boundaries. Sources: [workflow routing](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/use-in-a-workflow), [labels](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/apply-labels).

**Material risk for this project:** the existing reviewer can execute PR-plan commands. On a persistent runner, those commands can access files and credentials available to its OS account. A private repository and GitHub withholding Actions secrets do not protect an existing local Codex credential cache from code already executing as that account. GitHub specifically cautions about self-hosted runners with untrusted PR code, including private repositories. Source: [self-hosted runner hardening](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners).

Recommended boundary: an isolated VM on the Linux computer, dedicated non-root runner user, restricted repository access, no personal credentials/data mounted into it, trusted orchestration, and no PR-controlled lifecycle hooks or scripts executing with Codex credentials available. Read-only Codex permissions constrain model shell commands; they do not sandbox surrounding Actions steps, installs, or hooks. Fetch reviewer instructions from a trusted revision and treat PR files, plans, titles, and comments as review data. Do not interpolate PR text into shell commands. These recommendations follow the runner threat model and the inspected command-execution paths.

For an initial trusted same-repository trigger, use `pull_request`; opened/synchronize/reopened are default activity types. If drafts are skipped, include `ready_for_review`. Pin the reviewed head SHA explicitly because default PR checkout targets a synthetic merge commit. Fork and Dependabot runs have different token/secret restrictions. Do not bypass them with broad secret/write-token access, or by checking out and executing PR code under `pull_request_target`. PRs with merge conflicts do not trigger `pull_request` workflows. Source: [workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request).

## What the author must configure manually

These are an operator checklist for a future implementation, not actions performed by this research.

### On the Linux computer

1. Choose the supported distro/architecture and isolation arrangement described above; create a dedicated `printplan-runner` user with its own home. Provision Git, Node/npm, and a pinned Codex CLI accessible from the service environment. Match [.nvmrc](../../../.nvmrc:1) if the project toolchain runs there. Codex's documented npm installation command is `npm install -g @openai/codex`; pin the selected version for repeatable automation. Source: [Codex CLI installation](https://learn.chatgpt.com/docs/cli#getting-started).
2. Download and configure the runner using the commands generated by GitHub's New self-hosted runner screen. Run configuration as the intended service user; select the repository, architecture, installation directory and label. Do not put Codex credentials in the checkout. Source: [runner registration](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).
3. Configure Option A or B from the authentication section as that Linux user. For Option B, a manual session can start with `sudo -iu printplan-runner`, followed by `codex login` or `codex login --device-auth`. For file storage, put `cli_auth_credentials_store = "file"` in that account's Codex config; use directory mode `700` and credential-file mode `600`. Set any custom `CODEX_HOME` consistently in the service and login session. `codex login status` checks a persisted login; it does not prove an upcoming run has quota or that a token injected only into a future job is valid. Sources: [authentication](https://learn.chatgpt.com/docs/auth), [CI credential persistence](https://learn.chatgpt.com/docs/auth/ci-cd-auth).
4. After runner configuration, install/start/check the systemd service from its installation directory: `sudo ./svc.sh install printplan-runner`, `sudo ./svc.sh start`, `sudo ./svc.sh status`. Confirm the effective service user and PATH; a desktop user's nvm initialization is not evidence that systemd can find Codex. Source: [runner service configuration](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application).
5. Verify connectivity, updates, restart-after-reboot behavior, and suspend settings. A later acceptance run must exercise Codex from the actual service context and publish a test PR comment through the implemented workflow; it has not been performed here.

### In GitHub

1. As an authorized owner/admin, open **Settings → Actions → Runners → New self-hosted runner**, choose Linux/architecture, and obtain the commands used above. Confirm the runner appears online and has the chosen label. Source: [add runner](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners).
2. Confirm Actions and required actions/runners are permitted by repository/organization policy. Keep default token permissions conservative; the future workflow should request the explicit rights identified above. Enabling “Allow GitHub Actions to create and approve pull requests” is not needed for the conversation-comment endpoint.
3. If selecting token injection, store the Codex token in an appropriate repository/environment secret, expose it to the Codex step, and define rotation ownership. Alternatively keep a persisted login outside the checkout on the isolated runner. Do not upload `auth.json` as a normal artifact or repository file.
4. Decide which contributors/events may schedule work on this credential-bearing runner. Define fork and Dependabot handling explicitly. An opt-in label alone does not prevent malicious workflow changes from targeting a repository runner; runner access and trusted orchestration must enforce the boundary.
5. Add a required review check to branch protection/rulesets only if a blocking gate is later chosen and validated. Comment publication does not itself require a blocking review or automatic PR approval.

### In the ChatGPT Business workspace

Ask the workspace owner to confirm the local-access and token permissions described in Option A, or device-code permission for Option B. Confirm the selected identity belongs to the intended workspace and has sufficient usage. A missing/forbidden token screen requires checking workspace access and availability; this research cannot inspect the author's admin console. Runtime restrictions may also come from managed configuration. Sources: [roles and permission boundaries](https://learn.chatgpt.com/docs/enterprise/roles-and-workspace-permissions), [access-token troubleshooting](https://learn.chatgpt.com/docs/enterprise/access-tokens#troubleshooting).

## Planning handoff and affected contracts

Recommended flow to plan: trusted event metadata → exact head/base/merge-base resolution → scoped source and plan inputs → noninteractive Codex review → validated result → deterministic PR comment tied to reviewed SHA and run URL.

- Reuse the project's review dimensions and severity/impact vocabulary. Decide explicitly whether report markers and `Decision: PENDING` remain relevant when no report is committed. Avoid lifecycle changes from a comment-only run.
- Use `codex exec` for a custom plan-aware prompt. Documented output options include `--output-last-message` and `--output-schema`; JSONL is an event stream, not the final review object. Specify read-only sandbox/approval behavior explicitly. Source: [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode).
- Keep GitHub publishing outside model tools and separate its write credential where practical. Validate the expected output and SHA. A missing/invalid report, failed authentication, quota exhaustion, timeout, or publishing error must be represented as incomplete/failed operation rather than an approved review. This avoids the inspected template's permissive verdict fallback.
- Resolve planless and multiple-plan PR behavior deliberately. The current CI skill skips a missing plan and uses reverse path sorting as a heuristic, not a reliable link to PR intent. A `Plan:` reference can be supported as validated input. Define a generic-review fallback or explicit skip; do not imply plan-adherence review occurred without a plan.
- Preserve current contract/integration gates. If the reviewer consumes existing CI results, bind them to the relevant commit and distinguish observed passes from checks not run. Do not copy arbitrary PR-plan commands into a privileged host shell.
- Use a stable comment marker plus author/ownership checks for idempotent updates. Handle stale runs and changed PR heads explicitly. The selected first version should publish feedback without source edits, branch pushes, or formal approval decisions.

## Documentation verification and contradictions

Context7 requests succeeded; no quota or network fallback was needed. Selected `/openai/codex` for official CLI source coverage and `/websites/github_en_actions` for official Actions documentation. Each topic used a library resolution followed by two focused documentation calls:

```text
npx ctx7@latest library Codex "ChatGPT Business authentication device auth headless CLI non-interactive code review GitHub Actions self-hosted runner"
npx ctx7@latest docs /openai/codex "Authenticate non-interactive Codex CLI in CI with ChatGPT Business workspace subscription using CODEX_ACCESS_TOKEN or codex login --device-auth; credential persistence under CODEX_HOME"
npx ctx7@latest docs /openai/codex "codex exec non-interactive review output-last-message output-schema sandbox read-only approval never GitHub Actions API key action versus ChatGPT login"

npx ctx7@latest library 'GitHub Actions' 'Register self-hosted Linux runner for private repository, configure systemd service and outbound network requirements'
npx ctx7@latest docs /websites/github_en_actions 'Set up repository-level self-hosted Linux runner: admin permissions, registration token lifetime, systemd svc.sh service user, outbound HTTPS and runner labels'
npx ctx7@latest docs /websites/github_en_actions 'GITHUB_TOKEN least privilege contents read issues write pull-requests write for PR comment; self-hosted runner private fork pull_request security and pull_request_target'
```

Decisive documentation was also fetched directly from the official pages linked above. Context7 excerpts are evidence pointers, not authority over their surrounding source:

- Context7 inferred that `ChatgptAuthTokensRefresh` rejection means headless execution cannot refresh subscription credentials. That inference conflates externally supplied token refresh with Codex-managed ChatGPT auth. The [official CI-auth guide](https://learn.chatgpt.com/docs/auth/ci-cd-auth) explicitly documents managed refresh during `codex exec` and excludes `chatgptAuthTokens` from its scope. The broader negative conclusion is rejected.
- The general authentication page describes automation tokens in Enterprise terms, while the [dedicated access-token page](https://learn.chatgpt.com/docs/enterprise/access-tokens) and [pricing feature matrix](https://learn.chatgpt.com/docs/pricing#feature-availability) explicitly include Business. Use the specific availability documentation and verify the actual workspace UI; do not infer that Business lacks tokens from the general paragraph.
- API keys remain the general automation recommendation in the CI-auth/noninteractive guides; the dedicated token guide documents workspace-authenticated trusted automation. These are distinct supported credential choices. The recommendation here follows the user's request to use Business access and remains conditional on workspace permissions.

Local CLI inspection found `codex-cli 0.165.0`; `codex login --help` exposes `--with-access-token` and `--device-auth`, and `codex exec --help` exposes read-only sandbox, output schema, final-message output and a review subcommand. This verifies syntax in the research environment, not installation/authentication on the author's computer. No inference request was made with the author's credentials.

## Historical context and related research

The current [change identity](change.md:1) supplies the private-repository/local-Linux/Business/comment requirement. [Lessons](../../foundation/lessons.md:5) contains a commit-message convention, which does not decide runner authentication. The shipped reviewer templates are the relevant prior design evidence assessed above; archived product review reports are examples of reviews, not evidence of a deployed PR-review service. No prior runner setup research was needed to answer the current question.

## Remaining operator checks and decisions

- Actual Linux distribution/architecture, systemd availability, chosen isolation, service user/PATH and runner label.
- Live repository/organization policies, authorized trigger identities, and fork/Dependabot handling.
- Business token UI availability/permissions, identity, quota/billing and any managed runtime restrictions.
- Comment-only advisory feedback versus a blocking check; planless/multiple-plan policy; whether to consume CI evidence or run checks in separately isolated infrastructure.

These do not prevent the documentation/codebase research conclusion. They must be checked before provisioning and implementation acceptance. No builds or application tests were run: they would not establish runner-account access or live GitHub settings. Research validation consists of source inspection, successful Context7 lookups, local CLI help checks, and document/metadata verification.
