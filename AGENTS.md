# Repository Guidelines

PrintPlan plans filament stock and print reservations; the current code is an Astro SSR authentication starter with React, Tailwind, Supabase, and Cloudflare Workers. Start with `npm run dev`; verify changes with `npm run lint` and `npm run build`.

## Project language

Write and maintain project documentation, application text, and source-code content in English. Translate existing Polish project content when updating it. Conversations with the author may remain in Polish.

For library, framework, SDK, API, CLI, or cloud-service questions, fetch current documentation with `npx ctx7@latest library <name> "<query>"`, then `npx ctx7@latest docs <id> "<query>"`. Limit each question to three commands; exclude credentials. Report quota errors and suggest `npx ctx7@latest login` or `CONTEXT7_API_KEY`.

## Commands and verification

Use Node from @.nvmrc and `npm ci`. Scripts live in @package.json.

CI on `master` runs `npx astro sync`, lint, `npx astro check`, and build; see @.github/workflows/ci.yml. Run `npm run smoke` against `npm run preview` with local Supabase configured; `BASE_URL` defaults to `http://localhost:4321`. @scripts/smoke.mjs covers auth redirects and cookie sessions; no unit or browser test runner is configured.

## Structure and conventions

Routes live in `src/pages/`, auth endpoints in `src/pages/api/auth/`, layouts in `src/layouts/`, interactive auth components in `src/components/auth/`, shared UI in `src/components/ui/`, helpers in `src/lib/`.

Use `@/` imports (@tsconfig.json) and `cn()` from @src/lib/utils.ts for merged classes. Follow @.prettierrc.json and @eslint.config.js; pre-commit uses lint-staged (@package.json).

Read @context/foundation/prd.md for product rules and @context/foundation/tech-stack.md for the chosen stack; spool tables and reservation logic are still planned. Change artifacts belong in `context/changes/<change-id>/`.

## Configuration

Set `SUPABASE_URL` and `SUPABASE_KEY` using @.env.example; keep `.env` and `.dev.vars` untracked (@.gitignore). Preserve the server-only secret schema in @astro.config.mjs and cookie handling in @src/lib/supabase.ts.
