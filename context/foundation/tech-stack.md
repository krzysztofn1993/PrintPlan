---
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
---

## Why this stack

PrintPlan is a small web application with a three-week, after-hours MVP budget. The author accepted the recommended TypeScript web starter: Astro, React, Tailwind CSS, npm, and Supabase for email/password authentication and PostgreSQL persistence. The [upstream starter](https://github.com/przeprogramowani/10x-astro-starter) supplies authentication routes and a protected-page example; PrintPlan still needs its own tables, migrations, and per-user Row Level Security policies. Reservation and settlement operations should use [PostgreSQL functions exposed through Supabase RPC](https://supabase.com/docs/guides/database/functions), with consistent locking and idempotency rules planned to prevent overbooking and repeated consumption deductions. Cloudflare Workers was explicitly selected instead of the registry's stale Cloudflare Pages default, matching the upstream deployment configuration verified on 2026-10-09. Cloudflare Builds will connect to GitHub and automatically build and deploy on pushes to master; this branch choice is recorded here because the hand-off schema has no dedicated branch field. The project name is print-plan. Scaffolding confidence is first-class: registered support, but not verified end to end. Payments, realtime, AI, and background jobs are outside the MVP.
