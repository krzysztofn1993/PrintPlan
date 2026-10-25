# Repository Guidelines

PrintPlan manages personal filament stock, planned and completed prints, reservations, account safety settings, and one-time consumption settlement; the app uses Astro SSR, React, Tailwind, Supabase, and Cloudflare Workers. Start with `npm run dev`; verify changes with `npm run lint` and `npm run build`.

## Project language

Write and maintain project documentation, application text, and source-code content in English. Translate existing Polish project content when updating it. Conversations with the author may remain in Polish.

For library, framework, SDK, API, CLI, or cloud-service questions, fetch current documentation with `npx ctx7@latest library <name> "<query>"`, then `npx ctx7@latest docs <id> "<query>"`. Limit each question to three commands; exclude credentials. Report quota errors and suggest `npx ctx7@latest login` or `CONTEXT7_API_KEY`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 4, Lesson 5 (DDD Modernisation)

### Hard rules

- **Discover the domain; don't assume it.** Start with no entity names, aggregates or paths, and cite where every term comes from (a document or the code).
- **For domain discovery and DDD mapping/planning tasks, produce a map or a plan.** Modify only context artifacts during these tasks. Implement production changes through `/10x-plan` -> `/10x-implement`.
- **Use the glossary's terms.** Once `context/domain/glossary.md` exists, use its terms in code, plans and conversations, and avoid the names it marks "don't call it".

### Task Router - Where to start

For domain distillation, read @.agents/skills/10x-domain-distillation/SKILL.md. For invariant aggregates and anti-corruption layers, use @.agents/prompts/m4l5-2-invariant-aggregate-refactor.md and @.agents/prompts/m4l5-3-anti-corruption-layer.md. Feed domain artifacts into `/10x-shape` -> `/10x-roadmap` -> `/10x-research` -> `/10x-plan`.

<!-- END @przeprogramowani/10x-cli -->

## Commands and verification

Use the Node version from @.nvmrc and install dependencies with `npm ci`. Scripts live in @package.json.

Run `npm run verify:deploy` for the native, lint, type, and build gate, including account-settings and settlement contracts. Run `npm run test:e2e` for the single-worker Chromium recovery suite against its built preview, with local Supabase configured. Run `npm run smoke` against `npm run preview` with local Supabase and Mailpit configured; `BASE_URL` defaults to `http://localhost:4321`. Database acceptance uses `npx supabase test db`, `npm run test:reservations:concurrency`, and `npm run test:migrations`. See @package.json for gate commands, @.github/workflows/ci.yml for CI jobs, and @scripts/smoke.mjs for HTTP smoke coverage, including settings and settlement acceptance.

## Structure and conventions

Routes live in `src/pages/`, auth endpoints in `src/pages/api/auth/`, layouts in `src/layouts/`, interactive auth components in `src/components/auth/`, shared UI in `src/components/ui/`, helpers in `src/lib/`.

Use `@/` imports (@tsconfig.json) and `cn()` from @src/lib/utils.ts for merged classes. Follow @.prettierrc.json and @eslint.config.js; pre-commit uses lint-staged (@package.json).

Dashboard views use the design contract in [src/styles/global.css](src/styles/global.css), [src/layouts/DashboardShell.astro](src/layouts/DashboardShell.astro) and [src/components/ui/](src/components/ui/). Check those components before creating another presentation component. For collection records, use `CollectionTableRecord`, `CollectionTableRow`, `CollectionTableDetailRow` and `CollectionTableCell` from [src/components/ui/CollectionTable.tsx](src/components/ui/CollectionTable.tsx): keep five logical summary cells together and put expanded content in separate detail rows with one spanning cell. Derive geometry and surfaces from Carbon tokens. Keep literal colours and arbitrary sizing out of dashboard views. During dashboard presentation refactors, preserve the existing DTO bindings for `recordedGrams`, `reservedGrams`, `availableGrams`, and `requiredGrams`. Keep collection state, handlers and API mutations in the owning collection under `src/components/spools/` or `src/components/prints/`. See the retained [Carbon Terminal review evidence](context/archive/2026-10-12-carbon-terminal-spools/verification.md) and [screenshots](context/archive/2026-10-12-carbon-terminal-spools/reviews/phase-3/) plus this change's [current verification index](context/changes/carbon-terminal-planned-prints/verification.md).

Read @context/foundation/prd.md for product rules and @context/foundation/tech-stack.md for the chosen stack; spool, planned-print, reservation, account-settings, and settlement flows are implemented. Reserved-print recalculation remains planned. Change artifacts belong in `context/changes/<change-id>/`.

## Configuration

Set `SUPABASE_URL` and `SUPABASE_KEY` using @.env.example; keep `.env` and `.dev.vars` untracked (@.gitignore). Preserve the server-only secret schema in @astro.config.mjs and cookie handling in @src/lib/supabase.ts.
