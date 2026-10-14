---
change_id: carbon-terminal-spools
title: Carbon Terminal filament stock view
status: archived
created: 2026-10-12
updated: 2026-10-13
archived_at: 2026-10-13T20:18:34Z
---

## Notes

Adapt `/dashboard/spools` to the presentation in `/home/ubuntu/05-carbon-terminal.html`, using monospace typography and preserving PrintPlan's real stock data and workflows. Extend the existing token source in `src/styles/global.css` and use shared components from `src/components/ui/`. This change covers one view; later views can reuse the established contract.

## Planning Revision — 2026-10-13

The author approved extending this change to the complete Planned Prints restyle and adopting a shared terminal shell on `/dashboard/spools`, `/dashboard/prints` and `/dashboard`. Desktop uses a sidebar; phone navigation stays visible and wraps above content with identity and sign-out. This supersedes the original one-view scope in Notes. Preserve the completed monospace phase, existing Progress IDs/titles and status `implementing`; continue at Phase 2. Data and mutation/recovery contracts remain unchanged.
