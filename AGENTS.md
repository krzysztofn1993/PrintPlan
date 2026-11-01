# Repository Guidelines

PrintPlan manages personal filament stock, planned and completed prints, reservations, account safety settings, and one-time consumption settlement; the app uses Astro SSR, React, Tailwind, Supabase, and Cloudflare Workers. Start with `npm run dev`; verify changes with `npm run lint` and `npm run build`.

## Project language

Write and maintain project documentation, application text, and source-code content in English. Translate existing Polish project content when updating it. Conversations with the author may remain in Polish.

For library, framework, SDK, API, CLI, or cloud-service questions, fetch current documentation with `npx ctx7@latest library <name> "<query>"`, then `npx ctx7@latest docs <id> "<query>"`. Limit each question to three commands; exclude credentials. Report quota errors and suggest `npx ctx7@latest login` or `CONTEXT7_API_KEY`.

## Commands and verification

Use the Node version from @.nvmrc and install dependencies with `npm ci`. Scripts live in @package.json.

Run `npm run verify:deploy` for the native, lint, type, and build gate, including account-settings and settlement contracts. Run `npm run test:e2e` for the single-worker Chromium recovery suite against its built preview, with local Supabase configured. Run `npm run smoke` against `npm run preview` with local Supabase and Mailpit configured; `BASE_URL` defaults to `http://localhost:4321`. Database acceptance uses `npx supabase test db`, `npm run test:reservations:concurrency`, and `npm run test:migrations`. See @package.json for gate commands, @.github/workflows/ci.yml for CI jobs, and @scripts/smoke.mjs for HTTP smoke coverage, including settings and settlement acceptance.

## Structure and conventions

Routes live in `src/pages/`, auth endpoints in `src/pages/api/auth/`, layouts in `src/layouts/`, interactive auth components in `src/components/auth/`, shared UI in `src/components/ui/`, helpers in `src/lib/`.

Use `@/` imports (@tsconfig.json) and `cn()` from @src/lib/utils.ts for merged classes. Follow @.prettierrc.json and @eslint.config.js; pre-commit uses lint-staged (@package.json).

Dashboard views use the design contract in [src/styles/global.css](src/styles/global.css), [src/layouts/DashboardShell.astro](src/layouts/DashboardShell.astro) and [src/components/ui/](src/components/ui/). Check those components before creating another presentation component. For collection records, use `CollectionTableRecord`, `CollectionTableRow`, `CollectionTableDetailRow` and `CollectionTableCell` from [src/components/ui/CollectionTable.tsx](src/components/ui/CollectionTable.tsx): keep five logical summary cells together and put row-local actions such as deletion in separate detail rows with one spanning cell. Keep record editing, reservations, and settlement panels in the shared [CollectionRecordWorkbench](src/components/ui/CollectionRecordWorkbench.tsx), outside the table; stack its context below the form on mobile. Derive geometry and surfaces from Carbon tokens. Keep literal colours and arbitrary sizing out of dashboard views. During dashboard presentation refactors, preserve the existing DTO bindings for `recordedGrams`, `reservedGrams`, `availableGrams`, and `requiredGrams`. Keep collection state, handlers and API mutations in the owning collection under `src/components/spools/` or `src/components/prints/`. See the retained [Carbon Terminal review evidence](context/archive/2026-10-12-carbon-terminal-spools/verification.md) and [screenshots](context/archive/2026-10-12-carbon-terminal-spools/reviews/phase-3/) plus this change's [current verification index](context/archive/2026-10-25-carbon-terminal-planned-prints/verification.md).

Read @context/foundation/prd.md for product rules and @context/foundation/tech-stack.md for the chosen stack; spool, planned-print, reservation, account-settings, reserved-print recalculation, and settlement flows are implemented. Change artifacts belong in `context/changes/<change-id>/`.

## Configuration

Set `SUPABASE_URL` and `SUPABASE_KEY` using @.env.example; keep `.env` and `.dev.vars` untracked (@.gitignore). Preserve the server-only secret schema in @astro.config.mjs and cookie handling in @src/lib/supabase.ts.

## Static reviewer evaluations

The isolated harness lives in `packages/ai-reviewer/evals/`. Install with `npm ci --ignore-scripts --prefix packages/ai-reviewer/evals`, run its offline suite with `npm run test:ai-review-evals`, and use `npm --prefix packages/ai-reviewer/evals run preflight` for a no-key check. The trusted eval workflow reads only the fixed reviewer prompt blobs from PR heads as data. Keep its checked-in approval disabled until the author approves a specific budget; do not dispatch paid workflows or edit branch protection during bootstrap.
<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 5, Lesson 5 (Async & Remote Agents)

Delegate a bounded, planned change and come back to review it. Control doesn't disappear; it moves to the task contract, the sandbox setup and the review at the end.

```
/10x-plan -> /goal + /10x-goal-implement (interactive or your AI coding assistant in non-interactive mode) -> review the commits and the manual checklist
```

### Task Router - Where to start

| Skill                             | Use it when                                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/10x-goal-implement <change-id>` | An approved `context/changes/<id>/plan.md` should run unattended. Pair it with `/goal <condition>`; it commits each phase on green and ends with pending manual checks. |
| `/10x-implement`                  | You want to steer each phase yourself.                                                                                                                                  |

### Hard rules

- **Delegate only planned work.** No approved `plan.md`, no unattended run.
- **Bound every run.** The `/goal` condition names the finish state and a turn limit.
- **A green run is not a finished change.** Review the commits and work through the manual checklist before merging.
- **Give the sandbox only the secrets and network access the task needs.**
- **Watch parallel and remote runs from one place.** Run each unattended session in its own herdr workspace so you can see which agents are working, blocked or done and step in from the browser (setup in the M2L6 Deep Dive).

<!-- END @przeprogramowani/10x-cli -->
