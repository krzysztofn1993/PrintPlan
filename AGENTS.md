# Repository Guidelines

PrintPlan plans filament stock and print reservations; the current code is an Astro SSR authentication starter with React, Tailwind, Supabase, and Cloudflare Workers. Start with `npm run dev`; verify changes with `npm run lint` and `npm run build`.

## Project language

Write and maintain project documentation, application text, and source-code content in English. Translate existing Polish project content when updating it. Conversations with the author may remain in Polish.

For library, framework, SDK, API, CLI, or cloud-service questions, fetch current documentation with `npx ctx7@latest library <name> "<query>"`, then `npx ctx7@latest docs <id> "<query>"`. Limit each question to three commands; exclude credentials. Report quota errors and suggest `npx ctx7@latest login` or `CONTEXT7_API_KEY`.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 4, Lesson 5 (DDD Modernisation)

### Hard rules

- **Discover the domain; don't assume it.** Start with no entity names, aggregates or paths, and cite where every term comes from (a document or the code).
- **Produce a map or a plan, not code.** These artifacts don't modify production code; the change happens later through `/10x-plan` -> `/10x-implement`.
- **Use the glossary's terms.** Once `context/domain/glossary.md` exists, use its terms in code, plans and conversations, and avoid the names it marks "don't call it".

### Task Router - Where to start

For domain distillation, read @.agents/skills/10x-domain-distillation/SKILL.md. For invariant aggregates and anti-corruption layers, use @.agents/prompts/m4l5-2-invariant-aggregate-refactor.md and @.agents/prompts/m4l5-3-anti-corruption-layer.md. Feed domain artifacts into `/10x-shape` -> `/10x-roadmap` -> `/10x-research` -> `/10x-plan`.

<!-- END @przeprogramowani/10x-cli -->

## Commands and verification

Use Node 24.21.0 from @.nvmrc and `npm ci`. Scripts live in @package.json.

CI on `master` runs the native auth and stock contract tests, `npx astro sync`, lint, `npx astro check`, and build; its integration job runs Supabase database tests and the expanded built-preview smoke against local Supabase and Mailpit. See @.github/workflows/ci.yml. Run `npm run smoke` against `npm run preview` with local Supabase configured; `BASE_URL` defaults to `http://localhost:4321`. @scripts/smoke.mjs covers auth redirects, cookie sessions, stock persistence, and owner isolation. No browser test runner is configured.

## Structure and conventions

Routes live in `src/pages/`, auth endpoints in `src/pages/api/auth/`, layouts in `src/layouts/`, interactive auth components in `src/components/auth/`, shared UI in `src/components/ui/`, helpers in `src/lib/`.

Use `@/` imports (@tsconfig.json) and `cn()` from @src/lib/utils.ts for merged classes. Follow @.prettierrc.json and @eslint.config.js; pre-commit uses lint-staged (@package.json).

Read @context/foundation/prd.md for product rules and @context/foundation/tech-stack.md for the chosen stack; spool tables and reservation logic are still planned. Change artifacts belong in `context/changes/<change-id>/`.

## Configuration

Set `SUPABASE_URL` and `SUPABASE_KEY` using @.env.example; keep `.env` and `.dev.vars` untracked (@.gitignore). Preserve the server-only secret schema in @astro.config.mjs and cookie handling in @src/lib/supabase.ts.
