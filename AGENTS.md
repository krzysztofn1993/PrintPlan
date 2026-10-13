# Repository Guidelines

PrintPlan manages personal filament stock and planned prints, with reservations still planned; the app uses Astro SSR, React, Tailwind, Supabase, and Cloudflare Workers. Start with `npm run dev`; verify changes with `npm run lint` and `npm run build`.

## Project language

Write and maintain project documentation, application text, and source-code content in English. Translate existing Polish project content when updating it. Conversations with the author may remain in Polish.

For library, framework, SDK, API, CLI, or cloud-service questions, fetch current documentation with `npx ctx7@latest library <name> "<query>"`, then `npx ctx7@latest docs <id> "<query>"`. Limit each question to three commands; exclude credentials. Report quota errors and suggest `npx ctx7@latest login` or `CONTEXT7_API_KEY`.

## Commands and verification

Use Node 24.21.0 from @.nvmrc and `npm ci`. Scripts live in @package.json.

CI on `master` runs the native auth, stock, and planned-print contract tests, `npx astro sync`, lint, `npx astro check`, and build; its integration job runs Supabase database tests and the expanded built-preview smoke against local Supabase and Mailpit. See @.github/workflows/ci.yml. Run `npm run verify:deploy` for the complete native gate and `npm run smoke` against `npm run preview` with local Supabase configured; `BASE_URL` defaults to `http://localhost:4321`. @scripts/smoke.mjs covers auth redirects, cookie sessions, stock and planned-print persistence, owner isolation, and competing print edits. No browser test runner is configured.

## Structure and conventions

Routes live in `src/pages/`, auth endpoints in `src/pages/api/auth/`, layouts in `src/layouts/`, interactive auth components in `src/components/auth/`, shared UI in `src/components/ui/`, helpers in `src/lib/`.

Use `@/` imports (@tsconfig.json) and `cn()` from @src/lib/utils.ts for merged classes. Follow @.prettierrc.json and @eslint.config.js; pre-commit uses lint-staged (@package.json).

Dashboard views use the design contract in [src/styles/global.css](src/styles/global.css), [src/layouts/DashboardShell.astro](src/layouts/DashboardShell.astro) and [src/components/ui/](src/components/ui/). Check those components before creating another presentation component. Keep literal colours and arbitrary sizing out of dashboard views. Reusing the shell and presentation must preserve each collection's data meanings and keep its state, handlers and mutations in the owning collection. See the retained [Carbon Terminal review evidence](context/archive/2026-10-12-carbon-terminal-spools/verification.md) and [screenshots](context/archive/2026-10-12-carbon-terminal-spools/reviews/phase-3/).

Read @context/foundation/prd.md for product rules and @context/foundation/tech-stack.md for the chosen stack; spool and planned-print tables are implemented, while reservation logic is still planned. Change artifacts belong in `context/changes/<change-id>/`.

## Configuration

Set `SUPABASE_URL` and `SUPABASE_KEY` using @.env.example; keep `.env` and `.dev.vars` untracked (@.gitignore). Preserve the server-only secret schema in @astro.config.mjs and cookie handling in @src/lib/supabase.ts.
