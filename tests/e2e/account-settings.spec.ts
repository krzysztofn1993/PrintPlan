import type { Page } from "@playwright/test";
import { test, expect, type RecoveryApi } from "./fixtures";
import { deferred, openPrints, printRecord } from "./helpers/ui";

async function openSettings(page: Page): Promise<void> {
  await page.goto("/dashboard/settings");
  await page.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
  await page.locator('astro-island[component-export="AccountSafetyMarginForm"]:not([ssr])').waitFor();
  await page.getByLabel("New safety margin (%)").waitFor();
}

function settingsPanel(page: Page) {
  return page.locator('section[aria-labelledby="account-safety-margin-heading"]');
}

async function ensureMargin(
  recoveryApi: Pick<RecoveryApi, "getAccountSettings" | "saveAccountSettings">,
  value: number,
) {
  const current = await recoveryApi.getAccountSettings();
  if (current.marginPercent !== value) await recoveryApi.saveAccountSettings(value);
}

async function saveFromPage(page: Page, value: number): Promise<void> {
  const panel = settingsPanel(page);
  const input = page.getByLabel("New safety margin (%)");
  await input.fill(String(value));
  await expect(input).toHaveValue(String(value));
  const saveRequest = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/api/account/settings" && request.method() === "POST",
  );
  await panel.getByRole("button", { name: "Save safety margin" }).click();
  const form = new URLSearchParams((await saveRequest).postData() ?? "");
  expect(form.get("marginPercent")).toBe(String(value));
  expect(form.get("expectedVersion")).toMatch(/^\d+$/);
  await expect(panel.getByRole("status")).toContainText(`Safety margin saved at ${value}%`);
}

test("settings display saved values, validate boundaries, save explicitly, and persist after reload", async ({
  page,
  recoveryApi,
}) => {
  const original = await recoveryApi.getAccountSettings();
  await openSettings(page);
  const panel = settingsPanel(page);
  const input = page.getByLabel("New safety margin (%)");
  await expect(panel).toContainText(`Current saved margin: ${original.marginPercent}%`);
  await expect(input).toHaveValue(String(original.marginPercent));
  await recoveryApi.prepareSettingsMutation();

  await input.fill("101");
  await panel.getByRole("button", { name: "Save safety margin" }).click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(panel.getByText("Enter a value from 0 to 100.", { exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Save safety margin" })).toBeDisabled();
  await expect(input).toHaveValue("101");

  await saveFromPage(page, 0);
  await expect(panel).toContainText("Current saved margin: 0%");
  await saveFromPage(page, 100);
  await expect(panel).toContainText("Current saved margin: 100%");
  await saveFromPage(page, 5);
  await page.reload();
  await expect(settingsPanel(page)).toContainText("Current saved margin: 5%");
  await expect(page.getByLabel("New safety margin (%)")).toHaveValue("5");
});

test("a settings save stays disabled while its request is pending", async ({ page, recoveryApi }) => {
  await openSettings(page);
  await recoveryApi.prepareSettingsMutation();
  const panel = settingsPanel(page);
  const input = page.getByLabel("New safety margin (%)");
  const requestStarted = deferred();
  const releaseRequest = deferred();
  let routeCompletion: Promise<void> = Promise.resolve();
  let writes = 0;

  await page.route("**/api/account/settings", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    writes += 1;
    routeCompletion = (async () => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      requestStarted.resolve();
      await releaseRequest.promise;
      await route.fulfill({ response });
    })();
    await routeCompletion;
  });

  try {
    await input.fill("17");
    await panel.getByRole("button", { name: "Save safety margin" }).click();
    await requestStarted.promise;
    await expect(panel.getByRole("button", { name: "Saving…" })).toBeDisabled();
    expect(writes).toBe(1);
  } finally {
    releaseRequest.resolve();
    try {
      await routeCompletion;
    } finally {
      await page.unroute("**/api/account/settings");
    }
  }

  await expect(panel.getByRole("status")).toContainText("Safety margin saved at 17%");
  expect((await recoveryApi.getAccountSettings()).marginPercent).toBe(17);
});

test("a concurrent settings save preserves the draft and reports the saved version", async ({ page, recoveryApi }) => {
  await openSettings(page);
  const panel = settingsPanel(page);
  const input = page.getByLabel("New safety margin (%)");
  await recoveryApi.saveAccountSettings(23);
  await input.fill("42");
  await panel.getByRole("button", { name: "Save safety margin" }).click();

  await expect(panel.getByRole("status")).toContainText("The current saved setting is 23%");
  await expect(panel.getByRole("status")).toContainText("Your draft is unchanged");
  await expect(input).toHaveValue("42");
  expect(await recoveryApi.getAccountSettings()).toMatchObject({ marginPercent: 23 });
});

test("an unreadable committed save blocks retries until failed then successful rereads", async ({
  page,
  recoveryApi,
}) => {
  await openSettings(page);
  await recoveryApi.prepareSettingsMutation();
  const panel = settingsPanel(page);
  const input = page.getByLabel("New safety margin (%)");
  let reads = 0;

  await page.route("**/api/account/settings", async (route) => {
    if (route.request().method() === "POST") {
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.fulfill({ response: committed, body: "unreadable settings receipt" });
      return;
    }
    reads += 1;
    if (reads === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"code":"offline"}}' });
      return;
    }
    await route.continue();
  });

  await input.fill("31");
  await panel.getByRole("button", { name: "Save safety margin" }).click();
  await expect(panel.getByRole("alert")).toContainText("current saved setting could not be read");
  await expect(panel.getByRole("button", { name: "Read current saved setting" })).toBeVisible();
  await expect(input).toHaveValue("31");
  await expect(panel.getByRole("button", { name: "Save safety margin" })).toBeDisabled();

  await panel.getByRole("button", { name: "Read current saved setting" }).click();
  await expect(panel.getByRole("status")).toContainText("The current saved setting is 31%");
  await expect(input).toHaveValue("31");
  expect((await recoveryApi.getAccountSettings()).marginPercent).toBe(31);
  await page.unroute("**/api/account/settings");
});

for (const selectionMode of ["best_fit", "manual"] as const) {
  test(`a cross-tab 10% to 5% change requires a fresh ${selectionMode} confirmation`, async ({
    page,
    context,
    recoveryApi,
  }) => {
    await ensureMargin(recoveryApi, 10);
    const colour = recoveryApi.label(`margin-${selectionMode}`);
    const bestFit = await recoveryApi.createSpool({ material: "PLA", colour, recordedGrams: 100 });
    const manual = await recoveryApi.createSpool({ material: "PLA", colour, recordedGrams: 200 });
    const print = await recoveryApi.createPrint({
      name: recoveryApi.label(`margin-${selectionMode}-print`),
      material: "PLA",
      colour,
      requiredGrams: 80,
    });
    const secondPage = await context.newPage();

    try {
      await openPrints(page);
      const row = printRecord(page, print.id);
      await row.getByRole("button", { name: "Reserve material" }).click();
      await expect(row.getByText(/estimates 88 g/)).toBeVisible();
      if (selectionMode === "manual") await row.locator(`input[type="radio"][value="${manual.id}"]`).check();

      await openSettings(secondPage);
      await saveFromPage(secondPage, 5);
      await row.getByRole("button", { name: "Confirm reservation" }).click();
      await expect(row.getByRole("alert")).toContainText("current account margin changed the reservation amount");
      await expect(row.getByText(/estimates 84 g/)).toBeVisible();
      expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toBeNull();
      if (selectionMode === "manual") {
        await expect(row.locator(`input[type="radio"][value="${manual.id}"]`)).toBeChecked();
        await expect(row.getByRole("alert")).toContainText("Your chosen spool is still eligible and remains selected");
      } else {
        await expect(row.locator(`input[type="radio"][value="${bestFit.id}"]`)).toBeChecked();
      }

      await row.getByRole("button", { name: "Confirm reservation" }).click();
      await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
      expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toMatchObject({
        spoolId: selectionMode === "manual" ? manual.id : bestFit.id,
        reservedGrams: 84,
      });
    } finally {
      await secondPage.close();
    }
  });
}

test("a manual spool that becomes ineligible is replaced by the new best fit", async ({
  page,
  context,
  recoveryApi,
}) => {
  await ensureMargin(recoveryApi, 5);
  const colour = recoveryApi.label("margin-fallback");
  const selected = await recoveryApi.createSpool({ material: "PETG", colour, recordedGrams: 85 });
  const suggested = await recoveryApi.createSpool({ material: "PETG", colour, recordedGrams: 84 });
  const fallback = await recoveryApi.createSpool({ material: "PETG", colour, recordedGrams: 140 });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("margin-fallback-print"),
    material: "PETG",
    colour,
    requiredGrams: 80,
  });
  const secondPage = await context.newPage();

  try {
    await openPrints(page);
    const row = printRecord(page, print.id);
    await row.getByRole("button", { name: "Reserve material" }).click();
    await expect(row.getByText(/estimates 84 g/)).toBeVisible();
    await expect(row.locator(`input[type="radio"][value="${suggested.id}"]`)).toBeChecked();
    await row.locator(`input[type="radio"][value="${selected.id}"]`).check();
    await openSettings(secondPage);
    await saveFromPage(secondPage, 10);

    await row.getByRole("button", { name: "Confirm reservation" }).click();
    await expect(row.getByRole("alert")).toContainText("Your chosen spool is no longer eligible");
    await expect(row.getByText(/estimates 88 g/)).toBeVisible();
    await expect(row.locator(`input[type="radio"][value="${fallback.id}"]`)).toBeChecked();
    await expect(row.locator(`input[type="radio"][value="${selected.id}"]`)).toHaveCount(0);
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toBeNull();

    await row.getByRole("button", { name: "Confirm reservation" }).click();
    await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toMatchObject({
      spoolId: fallback.id,
      reservedGrams: 88,
    });
  } finally {
    await secondPage.close();
  }
});

test("10% to 9% confirms the same 88 g amount and SQL records the current percentage", async ({
  page,
  context,
  recoveryApi,
}) => {
  await ensureMargin(recoveryApi, 10);
  const colour = recoveryApi.label("margin-same-grams");
  await recoveryApi.createSpool({ material: "ABS", colour, recordedGrams: 180 });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("margin-same-grams-print"),
    material: "ABS",
    colour,
    requiredGrams: 80,
  });
  const proofPrint = await recoveryApi.createPrint({
    name: recoveryApi.label("margin-current-proof"),
    material: "ABS",
    colour,
    requiredGrams: 1,
  });
  const secondPage = await context.newPage();

  try {
    await openPrints(page);
    const row = printRecord(page, print.id);
    await row.getByRole("button", { name: "Reserve material" }).click();
    await expect(row.getByText(/estimates 88 g/)).toBeVisible();
    await openSettings(secondPage);
    await saveFromPage(secondPage, 9);
    await row.getByRole("button", { name: "Confirm reservation" }).click();
    await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation?.reservedGrams).toBe(88);
    expect(await recoveryApi.previewReservation(proofPrint.id)).toMatchObject({
      marginPercent: 9,
      reservationGrams: 2,
    });
    // The companion SQL assertion in supabase/tests/account-settings.test.sql verifies this reservation stored margin_percent = 9.
  } finally {
    await secondPage.close();
  }
});

test("a margin change away and back leaves an unchanged amount confirmable", async ({ page, context, recoveryApi }) => {
  await ensureMargin(recoveryApi, 10);
  const colour = recoveryApi.label("margin-roundtrip");
  await recoveryApi.createSpool({ material: "ASA", colour, recordedGrams: 150 });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("margin-roundtrip-print"),
    material: "ASA",
    colour,
    requiredGrams: 80,
  });
  const secondPage = await context.newPage();

  try {
    await openPrints(page);
    const row = printRecord(page, print.id);
    await row.getByRole("button", { name: "Reserve material" }).click();
    await expect(row.getByText(/estimates 88 g/)).toBeVisible();
    await openSettings(secondPage);
    await saveFromPage(secondPage, 5);
    await saveFromPage(secondPage, 10);
    await row.getByRole("button", { name: "Confirm reservation" }).click();
    await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation?.reservedGrams).toBe(88);
  } finally {
    await secondPage.close();
  }
});

test("a delayed obsolete preview cannot replace the preview after a settings change", async ({
  page,
  context,
  recoveryApi,
}) => {
  await ensureMargin(recoveryApi, 10);
  const colour = recoveryApi.label("margin-delayed-preview");
  await recoveryApi.createSpool({ material: "TPU", colour, recordedGrams: 150 });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("margin-delayed-preview-print"),
    material: "TPU",
    colour,
    requiredGrams: 80,
  });
  const previewReady = deferred();
  const releasePreview = deferred();
  const previewDelivered = deferred();
  const previewUrl = `**/api/prints/${print.id}/reservation`;
  let previewRequests = 0;
  const secondPage = await context.newPage();

  await page.route(previewUrl, async (route) => {
    previewRequests += 1;
    if (previewRequests > 1) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    previewReady.resolve();
    await releasePreview.promise;
    await route.fulfill({ response });
    previewDelivered.resolve();
  });

  try {
    await openPrints(page);
    const row = printRecord(page, print.id);
    await row.getByRole("button", { name: "Reserve material" }).click();
    await previewReady.promise;
    await row.getByRole("button", { name: "Close", exact: true }).click();
    await openSettings(secondPage);
    await saveFromPage(secondPage, 5);
    await row.getByRole("button", { name: "Reserve material" }).click();
    await expect(row.getByText(/estimates 84 g/)).toBeVisible();

    releasePreview.resolve();
    await previewDelivered.promise;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );
    await expect(row.getByText(/estimates 84 g/)).toBeVisible();
  } finally {
    releasePreview.resolve();
    await page.unroute(previewUrl);
    await secondPage.close();
  }
});

test("failed fresh preview loading can be retried after a changed margin", async ({ page, context, recoveryApi }) => {
  await ensureMargin(recoveryApi, 10);
  const colour = recoveryApi.label("margin-preview-retry");
  await recoveryApi.createSpool({ material: "Nylon", colour, recordedGrams: 150 });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("margin-preview-retry-print"),
    material: "Nylon",
    colour,
    requiredGrams: 80,
  });
  const secondPage = await context.newPage();
  let failed = false;

  try {
    await openPrints(page);
    const row = printRecord(page, print.id);
    await row.getByRole("button", { name: "Reserve material" }).click();
    await expect(row.getByText(/estimates 88 g/)).toBeVisible();
    await openSettings(secondPage);
    await saveFromPage(secondPage, 5);
    await page.route(`**/api/prints/${print.id}/reservation`, async (route) => {
      if (!failed) {
        failed = true;
        await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":{"code":"offline"}}' });
        return;
      }
      await route.continue();
    });

    await row.getByRole("button", { name: "Confirm reservation" }).click();
    await expect(row.getByRole("alert")).toContainText("preview is temporarily unavailable");
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toBeNull();
    await row.getByRole("button", { name: "Load preview" }).click();
    await expect(row.getByText(/estimates 84 g/)).toBeVisible();
  } finally {
    await page.unroute(`**/api/prints/${print.id}/reservation`);
    await secondPage.close();
  }
});
