---
date: 2026-10-12T11:30:43Z
researcher: Codex
git_commit: f0c9a754608c96214175e1054ec91baf3a3b6c42
branch: master
repository: PrintPlan
topic: "Integrating the Carbon Terminal theme"
tags: [research, codebase, theme, tailwind, shadcn]
status: complete
last_updated: 2026-10-12
last_updated_by: Codex
---

# Research: Integrating the Carbon Terminal theme

## Research Question

Where should the supplied Carbon Terminal shadcn CSS, including `@theme`, integrate into PrintPlan, which existing styles bypass it, and which contracts and choices must implementation planning preserve?

The request is recorded in [change.md:12](change.md#L12). The author supplied the token configuration and the expanded globals configuration during research. The expanded configuration is retained in [target-theme.css](target-theme.css), with English comments, as a reference asset that is not imported by application code. Its palette and radius mappings match the supplied token configuration; the expanded version additionally defines fonts, native color scheme and optional `carbon-*` classes.

## Summary

PrintPlan already has the appropriate integration point: `src/styles/global.css`, imported by `Layout.astro`, contains light and dark semantic variables and `@theme inline`. The supplied color mappings fit this structure; radius mappings and font mappings need merging into it ([global.css:6](../../../src/styles/global.css#L6), [global.css:75](../../../src/styles/global.css#L75), [Layout.astro:2](../../../src/layouts/Layout.astro#L2), [target-theme.css:11](target-theme.css#L11)).

Replacing variables alone would leave the inspected landing, auth, dashboard and stock surfaces with cosmic backgrounds and explicit white/blue/purple styling. The stock controls already consume semantic tokens, while their surrounding panels largely bypass them. There is also a standalone auth outage response with independent inline CSS ([Welcome.astro:5](../../../src/components/Welcome.astro#L5), [signin.astro:21](../../../src/pages/auth/signin.astro#L21), [dashboard.astro:9](../../../src/pages/dashboard.astro#L9), [SpoolInventory.tsx:182](../../../src/components/spools/SpoolInventory.tsx#L182), [auth-response.ts:41](../../../src/lib/auth-response.ts#L41)).

The supplied globals require an import decision: `shadcn/tailwind.css` is referenced, but `shadcn` is absent from the inspected manifest and lockfile. This shared utility stylesheet is separate from the palette and `@theme` mappings. Preserve the current animation import when integrating tokens; importing the additional stylesheet requires its dependency ([target-theme.css:5](target-theme.css#L5), [package.json:21](../../../package.json#L21), [global.css:1](../../../src/styles/global.css#L1); [official shadcn installation](https://ui.shadcn.com/docs/installation/manual)).

Static contrast calculations reveal specific light-theme readability concerns and a destructive-button foreground mismatch. These are integration constraints, not browser acceptance results. The initial color mode and use of the optional industrial decorations remain planning choices.

## Detailed Findings

### Existing theme pipeline and supplied configuration

- The Vite configuration already registers Tailwind; the lockfile resolves `tailwindcss` and `@tailwindcss/vite` to 4.3.3, while package.json specifies compatible ranges starting at 4.2.4 ([astro.config.mjs:14](../../../astro.config.mjs#L14), [package-lock.json:3319](../../../package-lock.json#L3319), [package-lock.json:9504](../../../package-lock.json#L9504), [package.json:30](../../../package.json#L30), [package.json:40](../../../package.json#L40)). No framework migration is implied by this theme request.
- The shadcn configuration points at `src/styles/global.css` with CSS variables enabled and the `new-york` style. The supplied Next.js-style path comments should be adapted to this existing Astro path ([components.json:3](../../../components.json#L3), [components.json:6](../../../components.json#L6)).
- In the supplied configuration, light background/foreground are `#F5F5F3` / `#2C2E2D`; dark background/foreground are `#090C0D` / `#F0F3F1`; primary is `#FF7058` with `#170C0B` foreground in these selectors ([target-theme.css:52](target-theme.css#L52), [target-theme.css:87](target-theme.css#L87)). The dark selector is a provided option, not evidence that the application currently activates it.
- The existing radius mapping uses additions/subtractions and covers `sm`, `md`, `lg`, `xl`. The supplied mapping instead scales `--radius: 0.18rem` and extends through `4xl`. This affects existing `rounded-2xl` auth/dashboard panels as well as shared `rounded-md` controls ([global.css:76](../../../src/styles/global.css#L76), [target-theme.css:43](target-theme.css#L43), [signin.astro:22](../../../src/pages/auth/signin.astro#L22), [button.tsx:8](../../../src/components/ui/button.tsx#L8)).
- The supplied system font stacks map to `--font-sans` and `--font-mono` through `@theme inline`; body applies `font-sans`. The inspected current global stylesheet has no corresponding custom font mapping. No external font download is declared by the supplied configuration ([target-theme.css:119](target-theme.css#L119), [target-theme.css:131](target-theme.css#L131), [global.css:75](../../../src/styles/global.css#L75)).
- Tailwind's current documentation explains that ordinary `:root` variables do not register utility classes. `@theme` registers theme namespaces, and `inline` makes utilities use the mapped value when referring to another variable. Keep palette values in selectors and their utility mappings at the top level ([official theme documentation](https://tailwindcss.com/docs/theme#referencing-other-variables), [official scoped color example](https://tailwindcss.com/docs/colors#referencing-other-variables)).
- The supplied globals have separate color/radius and font `@theme inline` blocks and separate palette/font root selectors. Their declarations can be merged for clarity. Preserve the existing base border/outline behavior and incorporate the supplied body font behavior ([target-theme.css:11](target-theme.css#L11), [target-theme.css:120](target-theme.css#L120), [target-theme.css:131](target-theme.css#L131), [global.css:117](../../../src/styles/global.css#L117)).
- The optional workspace class draws vertical grid lines; it does not draw a horizontal grid. The supplied grid color is the same in light and dark selectors. Panel radius is a literal value rather than the shared radius token; label/value helpers set monospace typography; the LED adds a fixed glow. Using these classes requires explicit markup adoption and a visual decision ([target-theme.css:123](target-theme.css#L123), [target-theme.css:127](target-theme.css#L127), [target-theme.css:148](target-theme.css#L148), [target-theme.css:153](target-theme.css#L153), [target-theme.css:162](target-theme.css#L162), [target-theme.css:176](target-theme.css#L176)).

### Import compatibility

Current shadcn manual installation documentation includes `tailwindcss`, `tw-animate-css` and `shadcn/tailwind.css` imports together, and lists `shadcn` as a dependency. The CLI documentation describes the additional stylesheet as shared variants/utilities and accordion animations ([manual installation](https://ui.shadcn.com/docs/installation/manual), [CLI eject documentation](https://ui.shadcn.com/docs/cli#eject)).

In this inspected project, `package.json` and `package-lock.json` contain `tw-animate-css` and no `shadcn` dependency entry. Therefore copying the supplied additional import verbatim introduces a dependency prerequisite. Applying Carbon's variables and mappings to existing components does not itself require those extra variants. Planning can either retain the existing imports for this token integration or explicitly add the shared stylesheet and its dependency; this research does not install packages ([package.json:21](../../../package.json#L21), [package-lock.json:9602](../../../package-lock.json#L9602), [global.css:1](../../../src/styles/global.css#L1)).

### Consumers and styles that bypass semantic tokens

- Shared Button uses semantic primary/secondary/accent/background/input/ring/destructive colors, `shadow-xs`, and token-backed radius utilities. Its destructive variant explicitly uses white text, which the supplied CSS does not override ([button.tsx:8](../../../src/components/ui/button.tsx#L8), [button.tsx:12](../../../src/components/ui/button.tsx#L12)).
- Stock `ui/FormField` uses background/foreground/muted/input/ring/destructive tokens and associated hint/error IDs. Auth has a separate FormField with white translucent fill, blue labels, and purple/red focus styles. Its inspected rendered input lacks the stock field's `aria-invalid`/`aria-describedby` linkage; this is existing behavior, not a newly introduced theme defect ([ui/FormField.tsx:29](../../../src/components/ui/FormField.tsx#L29), [ui/FormField.tsx:46](../../../src/components/ui/FormField.tsx#L46), [auth/FormField.tsx:5](../../../src/components/auth/FormField.tsx#L5), [auth/FormField.tsx:42](../../../src/components/auth/FormField.tsx#L42)).
- Auth SubmitButton passes purple/white styling to Button; the pending spinner is white. ServerError and PasswordToggle also hardcode colors. Token integration needs to account for these callers rather than relying on Button's defaults ([SubmitButton.tsx:15](../../../src/components/auth/SubmitButton.tsx#L15), [ServerError.tsx:11](../../../src/components/auth/ServerError.tsx#L11), [PasswordToggle.tsx:13](../../../src/components/auth/PasswordToggle.tsx#L13)).
- Landing decorations include purple/blue glow orbs, an inline radial star field, gradient heading, translucent cards and purple actions. `bg-cosmic` itself is a fixed gradient ([Welcome.astro:5](../../../src/components/Welcome.astro#L5), [Welcome.astro:14](../../../src/components/Welcome.astro#L14), [Welcome.astro:22](../../../src/components/Welcome.astro#L22), [global.css:113](../../../src/styles/global.css#L113)).
- Sign in, sign up and confirmation views use cosmic wrappers, translucent cards and colored headings/links. Dashboard and the stock page follow the same pattern ([signin.astro:21](../../../src/pages/auth/signin.astro#L21), [signup.astro:21](../../../src/pages/auth/signup.astro#L21), [confirm-email.astro:47](../../../src/pages/auth/confirm-email.astro#L47), [dashboard.astro:9](../../../src/pages/dashboard.astro#L9), [spools.astro:38](../../../src/pages/dashboard/spools.astro#L38)).
- Topbar uses white/blue/purple colors and a fixed dark focus-ring offset. Its account navigation label, route indication and wrapping are separate contracts to preserve ([Topbar.astro:6](../../../src/components/Topbar.astro#L6), [Topbar.astro:16](../../../src/components/Topbar.astro#L16), [Topbar.astro:17](../../../src/components/Topbar.astro#L17)).
- Inventory mixes token-based controls and errors with white/blue typography, translucent cards, emerald success text and amber deletion panels. The stock page load-error panel similarly mixes semantic destructive styling with fixed text/link colors ([SpoolInventory.tsx:194](../../../src/components/spools/SpoolInventory.tsx#L194), [SpoolInventory.tsx:233](../../../src/components/spools/SpoolInventory.tsx#L233), [SpoolInventory.tsx:319](../../../src/components/spools/SpoolInventory.tsx#L319), [spools.astro:55](../../../src/pages/dashboard/spools.astro#L55)).
- Banner uses scoped fixed info/warning/error colors. Its alert/status distinction should survive any restyle ([Banner.astro:11](../../../src/components/Banner.astro#L11), [Banner.astro:27](../../../src/components/Banner.astro#L27)).
- Auth outage HTML has its own inline font, dark scheme, gradient, panel, action and focus styles. It does not import global CSS. Protected-dashboard middleware returns this response on auth unavailability, so a consistent outage surface needs a separate treatment that preserves response status, private headers and retry behavior ([auth-response.ts:29](../../../src/lib/auth-response.ts#L29), [auth-response.ts:41](../../../src/lib/auth-response.ts#L41), [auth-response.ts:69](../../../src/lib/auth-response.ts#L69), [middleware.ts:50](../../../src/middleware.ts#L50)).

### Color mode and contrast constraints

`Layout.astro` renders an unclassified `<html lang="en">`. Inspection/search of `src/` and `public/` found dark declarations and Button variants, but no theme-preference persistence, system preference handler or class toggle. The standalone outage response separately declares a dark native scheme. Thus importing `.dark` tokens alone would retain light tokens in the normal layout ([Layout.astro:14](../../../src/layouts/Layout.astro#L14), [global.css:4](../../../src/styles/global.css#L4), [auth-response.ts:46](../../../src/lib/auth-response.ts#L46)).

For the following opaque sRGB pairs, a Node calculation used linearized relative luminance and `(lighter + 0.05) / (darker + 0.05)`. Ratios are rounded for reporting; they describe these pairs without opacity, gradients or compositing:

- Light muted foreground `#688174` on light background `#F5F5F3`: approximately 3.86:1; on light muted surface `#E6ECE8`: approximately 3.52:1 ([target-theme.css:53](target-theme.css#L53), [target-theme.css:63](target-theme.css#L63)).
- Dark muted foreground `#879497` on dark background `#090C0D`: approximately 6.27:1 ([target-theme.css:88](target-theme.css#L88), [target-theme.css:99](target-theme.css#L99)).
- White text on supplied destructive `#FF797F`, and destructive text on white card: approximately 2.53:1. The shared destructive Button uses the former pairing in its non-dark rule; stock field errors can use the latter after light panels become semantic cards ([button.tsx:14](../../../src/components/ui/button.tsx#L14), [ui/FormField.tsx:60](../../../src/components/ui/FormField.tsx#L60), [target-theme.css:55](target-theme.css#L55), [target-theme.css:67](target-theme.css#L67)).
- Destructive `#FF797F` on dark card `#14191B`: approximately 7.00:1; supplied primary foreground `#170C0B` on primary `#FF7058`: approximately 7.05:1 ([target-theme.css:90](target-theme.css#L90), [target-theme.css:102](target-theme.css#L102), [target-theme.css:94](target-theme.css#L94)).

WCAG AA's ordinary-text threshold is 4.5:1, with a 3:1 threshold for qualifying large text and exceptions for inactive controls and decoration. The light muted pairs and opaque white/destructive pair fall below the ordinary-text threshold. Preserve the supplied palette as the reference; planning must resolve readable text roles or explicitly scoped token adjustments before treating a light-mode restyle as accepted. Dark Button variants introduce opacity and need separate rendered checks ([W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [button.tsx:14](../../../src/components/ui/button.tsx#L14)).

## Architecture Insights and Planning Handoff

The existing architecture supports a shared semantic theme across Astro markup and React islands. Use the supplied `@theme inline` mappings as the contract for utility colors, fonts and radii, then address the named component/route bypasses. Global token replacement and adoption of the optional `carbon-*` styling are distinct scope choices. The outage response is a separate stylesheet boundary.

Planning should preserve stock labels and explanations, associated errors, live feedback, focus transitions, pending/uncertain mutation guards, wrapping and touch targets. These contracts appear in the archived stock plan and in the current UI fields/inventory; they do not require changing API behavior ([stock plan:183](../../archive/2026-10-10-personal-filament-stock/plan.md#L183), [ui/FormField.tsx:46](../../../src/components/ui/FormField.tsx#L46), [SpoolInventory.tsx:194](../../../src/components/spools/SpoolInventory.tsx#L194), [SpoolForm.tsx:232](../../../src/components/spools/SpoolForm.tsx#L232), [SpoolInventory.tsx:239](../../../src/components/spools/SpoolInventory.tsx#L239)).

## Historical Context and Related Research

The archived stock plan requires keyboard focus, input retention and phone wrapping. Its verification records user acceptance in Chrome, Firefox and phone on 2026-10-11. These are baseline records for the previous appearance, not acceptance of Carbon Terminal ([stock plan:193](../../archive/2026-10-10-personal-filament-stock/plan.md#L193), [stock verification:21](../../archive/2026-10-10-personal-filament-stock/verification.md#L21)). The PRD retains desktop/phone usability and explanations of recorded, reserved and available stock ([prd.md:93](../../foundation/prd.md#L93), [prd.md:110](../../foundation/prd.md#L110)).

Related artifacts: [stock research](../../archive/2026-10-10-personal-filament-stock/research.md) and [auth research](../../archive/2026-10-09-verified-account-access/research.md). No prior Carbon Terminal specification was found in the inspected foundation/archive text. The author-supplied CSS captured here is the target evidence.

## Open Questions

- Should normal pages start in dark or light mode? The supplied preview comment describes `.dark` activation, but does not settle default mode or request a user-facing toggle.
- Should the optional workspace grid, panel highlight, monospace labels/values and LED appear, and on which surfaces? Exact prototype fidelity cannot be assessed because the referenced `05-carbon-terminal.html` was not supplied.
- Should the added shadcn shared stylesheet be adopted with its dependency, or should this change use the existing imports and merge the supplied theme declarations?
- For a light-mode implementation, how should the specific low-contrast text roles above be corrected while preserving the intended palette?

## Evidence Coverage and Validation

Read-only workers inspected UI consumers and historical/product contracts; the primary agent inspected the change, global CSS/configuration, decisive callers, standalone outage response and supplied CSS, then checked current Tailwind and shadcn documentation through Context7. Sources describe the working tree on `master` at the recorded commit; the active change directory was untracked at initial inspection. No commit permalinks are asserted.

No production code, build, tests or browser rendering were changed/run for this research. Contrast calculations answer the specific palette integration question and do not certify the rendered application. No JSON facts companion was requested. The inspected package scripts and CI workflow contain no dedicated research-document check; existing CI checks concern app contracts, lint/type/build and integration smoke ([package.json:5](../../../package.json#L5), [ci.yml:19](../../../.github/workflows/ci.yml#L19), [ci.yml:93](../../../.github/workflows/ci.yml#L93)). Research completion means the integration evidence is assembled; planning must settle the listed choices and implementation must establish visual acceptance.
