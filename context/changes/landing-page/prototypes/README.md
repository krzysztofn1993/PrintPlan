# Landing page prototypes

Open [index.html](index.html) in a browser. The prototypes are standalone HTML/CSS/JavaScript; no application server or account is required.

Use the Content and Visual selectors to compare six views:

| Prototype              | Filament stock preview                 | No illustration                       |
| ---------------------- | -------------------------------------- | ------------------------------------- |
| A — Minimal hero       | `?variant=minimal&illustration=panel`  | `?variant=minimal&illustration=none`  |
| B — Short introduction | `?variant=short&illustration=panel`    | `?variant=short&illustration=none`    |
| C — Full presentation  | `?variant=extended&illustration=panel` | `?variant=extended&illustration=none` |

The Visitor selector previews signed-out and signed-in navigation. Signed-in visitors still see the landing page, with an Open dashboard action. Account links display the intended application destination in a dialog; the prototype does not perform authentication.

All versions share Carbon Terminal colours, monospace typography and panel geometry taken from `src/styles/global.css`. The illustration is now a screenshot of the actual `SpoolInventory` component, server-rendered with fictional records and styled with the application’s existing compiled CSS. Its surrounding navigation and page heading follow the current dashboard shell. Desktop and mobile screenshots preserve their respective layouts. The PLA sample shows recorded 150 g, reserved 88 g and available 62 g; a second PETG sample shows recorded and available 420 g with no reservation. These are sample estimates, not live account data. Image controls are not interactive. This replaces the earlier invented reservation card following the author’s feedback that it did not resemble Filament stock. Without the panel, the hero uses a wider text composition.

## Approved selection and implementation provenance

- The landing page is visible to both signed-out and signed-in visitors.
- The primary signed-out CTA is account creation; sign-in is secondary.
- Metadata includes a product title and description; a social image is outside the selected scope.
- The author selected C — Full presentation with Filament stock preview (`?variant=extended&illustration=panel`).
- Successful sign-in and email confirmation now target `/dashboard` directly; sign-out continues to return to `/`.

The original comparison artifacts remain here as design provenance. The application implementation follows the approved [plan](../plan.md); its acceptance evidence is recorded separately in [verification.md](../verification.md).

The reviewed captures were promoted unchanged: `filament-stock-1440.png` (1440 × 700) to `public/landing/filament-stock-desktop.png`, and `filament-stock-390.png` (390 × 1436) to `public/landing/filament-stock-mobile.png`. The application selects the mobile source up to 600 px. Both captures contain only fictional records and the fictional identity `preview@example.test`; no capture accounts, scripts or credentials are published. These source images are product illustrations, not screenshots proving the implemented landing page.
