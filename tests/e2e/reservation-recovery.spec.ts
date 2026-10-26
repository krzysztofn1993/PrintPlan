import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import {
  deferred,
  openPrints,
  openSpools,
  printAction,
  printRecord,
  printWorkbench,
  spoolAction,
  spoolRecord,
  spoolSummaryRow,
  spoolWorkbench,
} from "./helpers/ui";

for (const lateResponse of ["success", "network failure", "already reserved"] as const) {
  test(`a late preview ${lateResponse} cannot replace another print's confirmation`, async ({ page, recoveryApi }) => {
    const spool = await recoveryApi.createSpool({
      material: "PLA",
      colour: recoveryApi.label("preview-race"),
      recordedGrams: 150,
    });
    const first = await recoveryApi.createPrint({
      name: recoveryApi.label("preview-first"),
      material: "PLA",
      colour: spool.colour,
      requiredGrams: 80,
    });
    const second = await recoveryApi.createPrint({
      name: recoveryApi.label("preview-second"),
      material: "PLA",
      colour: spool.colour,
      requiredGrams: 100,
    });
    const previewReady = deferred();
    const releasePreview = deferred();
    const previewDelivered = deferred();
    const previewUrl = `**/api/prints/${first.id}/reservation`;

    await page.route(previewUrl, async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      previewReady.resolve();
      await releasePreview.promise;
      if (lateResponse === "network failure") {
        await route.abort("failed");
      } else if (lateResponse === "already reserved") {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "already_reserved" } }),
        });
      } else {
        await route.fulfill({ response });
      }
      previewDelivered.resolve();
    });

    try {
      await openPrints(page);
      await expect(page.locator('astro-island[component-export="PrintList"]:not([ssr])')).toHaveCount(1);
      await printRecord(page, first.id).getByRole("button", { name: "Reserve material" }).click();
      await previewReady.promise;
      const row = printRecord(page, second.id);
      const preview = printWorkbench(page, second.id);
      await row.getByRole("button", { name: "Reserve material" }).click();
      await expect(preview).toHaveRole("region");
      await expect(preview).toHaveAccessibleName("Reserve material");
      await expect(preview).toContainText("estimate 110 g from the 100 g you entered");

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

      await expect(preview).toHaveRole("region");
      await expect(preview).toHaveAccessibleName("Reserve material");
      await expect(preview).toContainText("estimate 110 g from the 100 g you entered");
      await expect(row.getByRole("alert")).toHaveCount(0);
      await row.getByRole("button", { name: "Confirm reservation" }).click();
      await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
      const saved = await recoveryApi.listPrints();
      expect(saved.find((print) => print.id === first.id)?.reservation).toBeNull();
      expect(saved.find((print) => print.id === second.id)?.reservation).toMatchObject({
        spoolId: spool.id,
        reservedGrams: 110,
      });
    } finally {
      releasePreview.resolve();
      await page.unroute(previewUrl);
    }
  });
}

test("reopening a print ignores its earlier preview and confirms the latest stock", async ({ page, recoveryApi }) => {
  const spool = await recoveryApi.createSpool({
    material: "PETG",
    colour: recoveryApi.label("preview-reopen"),
    recordedGrams: 150,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("preview-reopen-print"),
    material: "PETG",
    colour: spool.colour,
    requiredGrams: 80,
  });
  const previewReady = deferred();
  const releasePreview = deferred();
  const previewDelivered = deferred();
  const previewUrl = `**/api/prints/${print.id}/reservation`;
  let previewRequests = 0;
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
    await expect(page.locator('astro-island[component-export="PrintList"]:not([ssr])')).toHaveCount(1);
    const row = printRecord(page, print.id);
    const spoolChoices = printWorkbench(page, print.id).getByRole("group", { name: "Choose a spool" });
    await row.getByRole("button", { name: "Reserve material" }).click();
    await previewReady.promise;
    await row.getByRole("button", { name: "Close", exact: true }).click();
    await recoveryApi.updateSpool(spool.id, { material: "PETG", colour: spool.colour, recordedGrams: 100 });
    await row.getByRole("button", { name: "Reserve material" }).click();
    await expect(spoolChoices.getByText(/100 g available/)).toBeVisible();

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

    await expect(spoolChoices.getByText(/100 g available/)).toBeVisible();
    await row.getByRole("button", { name: "Confirm reservation" }).click();
    await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      recordedGrams: 100,
      reservedGrams: 88,
      availableGrams: 12,
    });
  } finally {
    releasePreview.resolve();
    await page.unroute(previewUrl);
  }
});

test("reserved stock corrections reject below reservations and accept equality", async ({ page, recoveryApi }) => {
  const spool = await recoveryApi.createSpool({
    material: "PLA",
    colour: recoveryApi.label("correction-boundary"),
    recordedGrams: 150,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("correction-boundary-print"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  await recoveryApi.reserveMaterial(print, spool.id, "best_fit");

  await openSpools(page);
  await spoolAction(page, "Edit", spool.id).click();
  const recorded = page.getByLabel("Recorded stock (g)");
  await recorded.fill("87");
  await page.getByRole("button", { name: "Save changes" }).click();

  const feedback = page.getByRole("alert").filter({ hasText: "Recorded stock cannot be reduced" });
  await expect(feedback).toBeVisible();
  await expect(feedback).not.toContainText("88 g");
  await expect(feedback.getByRole("link", { name: "Manage reservations in prints" })).toHaveAttribute(
    "href",
    "/dashboard/prints",
  );
  await expect(page.getByRole("button", { name: "Refresh reservation amounts" })).toBeVisible();
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 88,
    availableGrams: 62,
  });

  await recorded.fill("88");
  await page.getByRole("button", { name: "Save changes" }).click();
  const row = spoolRecord(page, spool.id);
  await expect(row.getByRole("cell").nth(1)).toContainText("88 g");
  await expect(row.getByText("0 g")).toBeVisible();
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 88,
    reservedGrams: 88,
    availableGrams: 0,
  });
});

test("correction refresh uses current reservation totals and retains the unsaved draft", async ({
  page,
  recoveryApi,
}) => {
  const spool = await recoveryApi.createSpool({
    material: "PETG",
    colour: recoveryApi.label("correction-refresh"),
    recordedGrams: 200,
  });
  const firstPrint = await recoveryApi.createPrint({
    name: recoveryApi.label("correction-refresh-first"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  const secondPrint = await recoveryApi.createPrint({
    name: recoveryApi.label("correction-refresh-second"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 50,
  });
  await recoveryApi.reserveMaterial(firstPrint, spool.id, "best_fit");

  await openSpools(page);
  await spoolAction(page, "Edit", spool.id).click();
  const recorded = page.getByLabel("Recorded stock (g)");
  await recorded.fill("100");
  const secondReservationId = await recoveryApi.reserveMaterial(secondPrint, spool.id, "best_fit");

  let correctionPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(`/api/spools/${spool.id}/update`)) {
      correctionPosts += 1;
    }
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  const feedback = page.getByRole("alert").filter({ hasText: "Recorded stock cannot be reduced" });
  await expect(feedback).toBeVisible();
  await expect(feedback).not.toContainText("88 g");
  expect(correctionPosts).toBe(1);
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 200,
    reservedGrams: 143,
    availableGrams: 57,
  });

  let failedReads = 0;
  await page.route("**/api/spools", async (route) => {
    if (route.request().method() === "GET" && failedReads === 0) {
      failedReads += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary" }),
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Refresh reservation amounts" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Reservation amounts could not be refreshed" })).toBeVisible();
  await expect(recorded).toHaveValue("100");
  await expect(spoolWorkbench(page, spool.id).getByText("112 g")).toBeVisible();
  expect(correctionPosts).toBe(1);
  await page.unroute("**/api/spools");

  await page.getByRole("button", { name: "Refresh reservation amounts" }).click();
  await expect(recorded).toHaveValue("100");
  await expect(recorded).toHaveAttribute("min", "143");
  await expect(spoolWorkbench(page, spool.id).getByText("57 g")).toBeVisible();
  expect(correctionPosts).toBe(1);

  const secondCurrent = (await recoveryApi.listPrints()).find((item) => item.id === secondPrint.id);
  if (!secondCurrent) throw new Error("The reserved print disappeared before release.");
  await recoveryApi.releaseMaterial(secondPrint.id, secondReservationId, secondCurrent.version);
  await page.getByRole("button", { name: "Refresh reservation amounts" }).click();
  await expect(recorded).toHaveValue("100");
  await expect(recorded).toHaveAttribute("min", "88");
  await expect(spoolWorkbench(page, spool.id).getByText("112 g")).toBeVisible();
  expect(correctionPosts).toBe(1);

  await page.getByRole("button", { name: "Save changes" }).click();
  const row = spoolRecord(page, spool.id);
  await expect(row.getByText("100 g")).toBeVisible();
  await expect(row.getByText("12 g")).toBeVisible();
  expect(correctionPosts).toBe(2);
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 100,
    reservedGrams: 88,
    availableGrams: 12,
  });
});

test("a correction refresh closes a disappeared spool without saving the draft", async ({ page, recoveryApi }) => {
  const spool = await recoveryApi.createSpool({
    material: "ABS",
    colour: recoveryApi.label("correction-disappeared"),
    recordedGrams: 150,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("correction-disappeared-print"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  await recoveryApi.reserveMaterial(print, spool.id, "best_fit");

  await openSpools(page);
  await spoolAction(page, "Edit", spool.id).click();
  await page.getByLabel("Recorded stock (g)").fill("87");
  let correctionPosts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(`/api/spools/${spool.id}/update`)) {
      correctionPosts += 1;
    }
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Recorded stock cannot be reduced" })).toBeVisible();
  expect(correctionPosts).toBe(1);

  await recoveryApi.deleteSpool(spool.id);
  await page.getByRole("button", { name: "Refresh reservation amounts" }).click();
  await expect(page.getByRole("heading", { name: "Correct this spool" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(
    "This spool is no longer available. The unsaved correction was not saved.",
  );
  expect(correctionPosts).toBe(1);
  expect((await recoveryApi.listSpools()).some((item) => item.id === spool.id)).toBe(false);
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toBeNull();
});

for (const matchingField of ["Material", "Colour"] as const) {
  test(`reserved-label refresh preserves the draft and restores saved labels only on request (${matchingField.toLowerCase()} conflict)`, async ({
    page,
    recoveryApi,
  }) => {
    const spool = await recoveryApi.createSpool({ material: "PLA", colour: "Black", recordedGrams: 200 });
    const print = await recoveryApi.createPrint({
      name: recoveryApi.label("correction-label-restore"),
      material: spool.material,
      colour: spool.colour,
      requiredGrams: 80,
    });

    await openSpools(page);
    await spoolAction(page, "Edit", spool.id).click();
    await page.getByLabel(matchingField).fill("Red");
    await page.getByLabel("Recorded stock (g)").fill("100");
    await recoveryApi.reserveMaterial(print, spool.id, "best_fit");

    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "active reservations" })).toBeVisible();
    await page.getByRole("button", { name: "Refresh reservation amounts" }).click();

    const material = page.getByLabel("Material");
    const colour = page.getByLabel("Colour");
    const recorded = page.getByLabel("Recorded stock (g)");
    await expect(material).toHaveValue(matchingField === "Material" ? "Red" : "PLA");
    await expect(colour).toHaveValue(matchingField === "Colour" ? "Red" : "Black");
    await expect(recorded).toHaveValue("100");
    await expect(material).toBeDisabled();
    await expect(colour).toBeDisabled();
    const restore = page.getByRole("button", { name: "Use saved material and colour" });
    await expect(restore).toBeVisible();
    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      recordedGrams: 200,
      reservedGrams: 88,
      availableGrams: 112,
    });
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toMatchObject({
      spoolId: spool.id,
      reservedGrams: 88,
    });

    const requestsDuringRestore: string[] = [];
    const recordRequest = (request: import("@playwright/test").Request) => {
      if (request.method() === "GET" || request.method() === "POST") requestsDuringRestore.push(request.method());
    };
    page.on("request", recordRequest);
    await restore.click();
    await expect(material).toHaveValue("PLA");
    await expect(colour).toHaveValue("Black");
    await expect(recorded).toHaveValue("100");
    await expect(restore).toHaveCount(0);
    expect(requestsDuringRestore).toEqual([]);
    page.off("request", recordRequest);

    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      recordedGrams: 200,
      reservedGrams: 88,
      availableGrams: 112,
    });
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toMatchObject({
      spoolId: spool.id,
      reservedGrams: 88,
    });

    await page.getByRole("button", { name: "Save changes" }).click();
    const row = spoolRecord(page, spool.id);
    await expect(row.getByText("100 g")).toBeVisible();
    await expect(row.getByText("12 g")).toBeVisible();
    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      material: "PLA",
      colour: "Black",
      recordedGrams: 100,
      reservedGrams: 88,
      availableGrams: 12,
    });
  });
}

test("best-fit reservation and release preserve recorded spool stock", async ({ page, recoveryApi }) => {
  const spool = await recoveryApi.createSpool({
    material: "PLA",
    colour: recoveryApi.label("reserve-flow"),
    recordedGrams: 150,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("reserve-flow-print"),
    material: "PLA",
    colour: spool.colour,
    requiredGrams: 80,
  });

  await openPrints(page);
  const row = printRecord(page, print.id);
  await row.getByRole("button", { name: "Reserve material" }).click();
  const preview = printWorkbench(page, print.id);
  await expect(preview).toHaveRole("region");
  await expect(preview).toHaveAccessibleName("Reserve material");
  await expect(preview).toContainText("estimate 88 g from the 80 g you entered");
  await expect(row.getByText(/Choices include only spools with matching material and colour/)).toBeVisible();
  await expect(row.getByRole("radio")).toHaveCount(1);
  await row.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("88 g reserved");

  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 88,
    availableGrams: 62,
  });
  const saved = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  expect(saved?.reservation).toMatchObject({ spoolId: spool.id, reservedGrams: 88 });

  await row.getByRole("button", { name: "Manage reservation" }).click();
  await expect(row.getByText(/88 g reserved from/)).toBeVisible();
  await row.getByRole("button", { name: "Release reservation" }).click();
  await expect(row.getByRole("button", { name: "Reserve material" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("88 g released");
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 0,
    availableGrams: 150,
  });
});

test("identically described spools remain distinguishable when choosing the non-suggested record", async ({
  page,
  recoveryApi,
}) => {
  const colour = recoveryApi.label("identical-spool-choice");
  const first = await recoveryApi.createSpool({ material: "PETG", colour, recordedGrams: 180 });
  const second = await recoveryApi.createSpool({ material: "PETG", colour, recordedGrams: 180 });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("identical-spool-print"),
    material: "PETG",
    colour,
    requiredGrams: 80,
  });
  const preview = await recoveryApi.previewReservation(print.id);
  expect(preview.eligibleSpools.map((spool) => spool.id)).toEqual(expect.arrayContaining([first.id, second.id]));
  expect(preview.suggestedSpoolId).toBeTruthy();
  const selectedSpoolId = [first.id, second.id].find((id) => id !== preview.suggestedSpoolId);
  if (!selectedSpoolId) throw new Error("The preview did not suggest one of the identical spool records.");

  await openPrints(page);
  const row = printRecord(page, print.id);
  await row.getByRole("button", { name: "Reserve material" }).click();
  await expect(row.getByRole("radio")).toHaveCount(2);
  await expect(row.getByText(`Spool ${selectedSpoolId.slice(0, 8)}…`)).toBeVisible();
  await row.locator(`input[type="radio"][value="${selectedSpoolId}"]`).check();

  let reservationBody = "";
  await page.route(`**/api/prints/${print.id}/reservation/reserve`, async (route) => {
    reservationBody = route.request().postData() ?? "";
    await route.continue();
  });
  await row.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();

  const submitted = new URLSearchParams(reservationBody);
  expect(submitted.get("spoolId")).toBe(selectedSpoolId);
  expect(submitted.get("selectionMode")).toBe("manual");
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toMatchObject({
    spoolId: selectedSpoolId,
  });
  expect(await recoveryApi.readReservation(print.id)).toMatchObject({ spoolId: selectedSpoolId });
});

test("preview-only controlled response extends colliding spool ID prefixes without submitting fabricated IDs", async ({
  page,
  recoveryApi,
}) => {
  const spool = await recoveryApi.createSpool({
    material: "PLA",
    colour: recoveryApi.label("spool-prefix-collision"),
    recordedGrams: 180,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("spool-prefix-collision-print"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  const suggestedId = "a17c930f-0000-4000-8000-000000000001";
  const alternateId = "a17c930f-1000-4000-8000-000000000002";
  let reservationPosts = 0;

  await page.route(`**/api/prints/${print.id}/reservation`, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const payload = (await response.json()) as {
      eligibleSpools: Record<string, unknown>[];
      suggestedSpoolId: string | null;
    };
    expect(payload.eligibleSpools.length).toBeGreaterThan(0);
    const baseSpool = payload.eligibleSpools[0];
    payload.eligibleSpools = [
      { ...baseSpool, id: suggestedId },
      { ...baseSpool, id: alternateId },
    ];
    payload.suggestedSpoolId = suggestedId;
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(`/api/prints/${print.id}/reservation/reserve`)) {
      reservationPosts += 1;
    }
  });

  await openPrints(page);
  const row = printRecord(page, print.id);
  await row.getByRole("button", { name: "Reserve material" }).click();
  const suggested = row.locator(`label:has(input[value="${suggestedId}"])`);
  const alternate = row.locator(`label:has(input[value="${alternateId}"])`);
  await expect(suggested).toContainText("Spool a17c930f0…");
  await expect(alternate).toContainText("Spool a17c930f1…");
  await expect(suggested.locator("code")).toHaveAttribute("title", `Full spool ID: ${suggestedId}`);
  await expect(alternate.locator("code")).toHaveAttribute("title", `Full spool ID: ${alternateId}`);
  await expect(row.getByRole("radio", { name: new RegExp(suggestedId) })).toBeVisible();
  await expect(row.getByRole("radio", { name: new RegExp(alternateId) })).toBeVisible();
  await alternate.getByRole("radio").check();
  await expect(alternate.getByRole("radio")).toBeChecked();
  await expect(suggested.getByRole("radio")).not.toBeChecked();
  await expect(row.getByRole("button", { name: "Confirm reservation" })).toBeVisible();

  expect(reservationPosts).toBe(0);
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toBeNull();
});

test("a changed best fit needs a new confirmation, manual choice works, and spool deletion reports cancellation", async ({
  page,
  recoveryApi,
}) => {
  const colour = recoveryApi.label("reservation-stale");
  const first = await recoveryApi.createSpool({ material: "PETG", colour, recordedGrams: 150 });
  const second = await recoveryApi.createSpool({ material: "PETG", colour, recordedGrams: 200 });
  const fallbackColour = recoveryApi.label("reservation-fallback-colour");
  const fallback = await recoveryApi.createSpool({ material: "ABS", colour: fallbackColour, recordedGrams: 200 });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("reservation-stale-print"),
    material: "PETG",
    colour,
    requiredGrams: 80,
  });

  await openPrints(page);
  const row = printRecord(page, print.id);
  await row.getByRole("button", { name: "Reserve material" }).click();
  await recoveryApi.updateSpool(second.id, { material: "PETG", colour, recordedGrams: 100 });
  await row.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(row.getByRole("alert")).toContainText(
    "The available selection changed. Review this fresh preview and confirm again.",
  );
  await expect(row.getByRole("radio")).toHaveCount(2);

  await row.locator(`input[type="radio"][value="${first.id}"]`).check();
  await row.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toMatchObject({
    spoolId: first.id,
  });

  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByText(/This print has an active material reservation/)).toBeVisible();
  await expect(page.getByText(/Every save recalculates the held amount using the current safety margin/)).toBeVisible();
  const requiredGrams = page.getByLabel("Required filament (g)");
  await expect(page.getByLabel("Material")).toBeEnabled();
  await expect(page.getByLabel("Colour")).toBeEnabled();
  await expect(requiredGrams).toBeEnabled();
  await requiredGrams.fill("81");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText("manual spool was retained");
  await expect(page.getByRole("status")).toContainText("90 g held");
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)).toMatchObject({
    requiredGrams: 81,
    version: 3,
    reservation: { spoolId: first.id, reservedGrams: 90 },
  });

  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Material").fill("ABS");
  await page.getByLabel("Colour").fill(fallbackColour);
  await page.getByLabel("Required filament (g)").fill("82");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toContainText(`moved to best-fit spool ${fallback.id}`);
  await expect(page.getByRole("status")).toContainText("91 g");
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)).toMatchObject({
    material: "ABS",
    colour: fallbackColour,
    requiredGrams: 82,
    version: 4,
    reservation: { spoolId: fallback.id, reservedGrams: 91 },
  });

  await openSpools(page);
  const reservedSpool = spoolRecord(page, fallback.id);
  await spoolAction(page, "Edit", fallback.id).click();
  const reservedSpoolForm = spoolWorkbench(page, fallback.id);
  await expect(reservedSpoolForm).toHaveRole("region");
  await expect(reservedSpoolForm).toHaveAccessibleName("Correct this spool");
  await expect(reservedSpoolForm.getByLabel("Material")).toBeDisabled();
  await expect(reservedSpoolForm.getByLabel("Colour")).toBeDisabled();
  await expect(reservedSpoolForm.getByLabel("Recorded stock (g)")).toHaveAttribute("min", "91");
  await page.getByRole("button", { name: "Cancel", exact: true }).last().click();

  await spoolAction(page, "Delete", fallback.id).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByRole("status")).toContainText(`print ${print.id}`);
  await expect(page.getByRole("status")).toContainText("released 91 g");
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toBeNull();
  await expect(reservedSpool).toHaveCount(0);
});

test("deleting a spool reports every reservation and leaves its prints unreserved", async ({ page, recoveryApi }) => {
  const spool = await recoveryApi.createSpool({
    material: "PETG",
    colour: recoveryApi.label("multi-reservation-delete"),
    recordedGrams: 200,
  });
  const namedPrint = await recoveryApi.createPrint({
    name: recoveryApi.label("multi-reservation-named-print"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  const unnamedPrint = await recoveryApi.createPrint({
    name: null,
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 50,
  });
  const unrelatedSpool = await recoveryApi.createSpool({
    material: "TPU",
    colour: recoveryApi.label("multi-reservation-unrelated"),
    recordedGrams: 73,
  });
  const namedReservationId = await recoveryApi.reserveMaterial(namedPrint, spool.id, "best_fit");
  const unnamedReservationId = await recoveryApi.reserveMaterial(unnamedPrint, spool.id, "best_fit");
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 200,
    reservedGrams: 143,
    availableGrams: 57,
  });

  await openSpools(page);
  await spoolAction(page, "Delete", spool.id).click();
  await expect(page.getByRole("heading", { name: "Delete this spool?" })).toBeVisible();
  const deletionResponsePromise = page.waitForResponse(
    (response) => response.url().endsWith(`/api/spools/${spool.id}/delete`) && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  const deletionResponse = await deletionResponsePromise;
  expect(deletionResponse.status()).toBe(200);
  const receipt = (await deletionResponse.json()) as {
    cancelledReservations: {
      reservationId: string;
      printId: string;
      printName: string | null;
      material: string;
      colour: string;
      releasedGrams: number;
    }[];
  };
  expect(receipt.cancelledReservations).toHaveLength(2);
  expect(receipt.cancelledReservations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        reservationId: namedReservationId,
        printId: namedPrint.id,
        printName: namedPrint.name,
        releasedGrams: 88,
      }),
      expect.objectContaining({
        reservationId: unnamedReservationId,
        printId: unnamedPrint.id,
        printName: null,
        material: spool.material,
        colour: spool.colour,
        releasedGrams: 55,
      }),
    ]),
  );

  const status = page.getByRole("status");
  await expect(status).toContainText(`${namedPrint.name} (print ${namedPrint.id}) released 88 g`);
  await expect(status).toContainText(`${spool.material}, ${spool.colour} (print ${unnamedPrint.id}) released 55 g`);
  await expect(spoolSummaryRow(page, spool.id)).toHaveCount(0);
  const savedPrints = await recoveryApi.listPrints();
  expect(savedPrints.find((item) => item.id === namedPrint.id)).toMatchObject({ reservation: null });
  expect(savedPrints.find((item) => item.id === unnamedPrint.id)).toMatchObject({ reservation: null });
  const savedSpools = await recoveryApi.listSpools();
  expect(savedSpools.some((item) => item.id === spool.id)).toBe(false);
  expect(savedSpools.find((item) => item.id === unrelatedSpool.id)).toMatchObject({
    material: unrelatedSpool.material,
    colour: unrelatedSpool.colour,
    recordedGrams: 73,
    reservedGrams: 0,
    availableGrams: 73,
  });
});

for (const failedCollection of ["prints", "spools"] as const) {
  test(`committed cancellation recovery waits for the ${failedCollection} read after an exact retry`, async ({
    page,
    recoveryApi,
  }) => {
    const spool = await recoveryApi.createSpool({
      material: "ABS",
      colour: recoveryApi.label("reservation-ack"),
      recordedGrams: 130,
    });
    const print = await recoveryApi.createPrint({
      name: recoveryApi.label("reservation-ack-print"),
      material: "ABS",
      colour: spool.colour,
      requiredGrams: 50,
    });
    let reservePosts = 0;
    let cancelPosts = 0;

    await openPrints(page);
    const row = printRecord(page, print.id);
    await row.getByRole("button", { name: "Reserve material" }).click();
    await page.route(`**/api/prints/${print.id}/reservation/reserve`, async (route) => {
      reservePosts += 1;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.fulfill({ response: committed, body: "unreadable reservation receipt" });
    });
    await row.getByRole("button", { name: "Confirm reservation" }).click();
    await expect(row.getByRole("alert")).toContainText("outcome may be uncertain");
    await expect(row.locator(`#confirm-reservation-${print.id}`)).toBeDisabled();
    expect(reservePosts).toBe(1);

    let failedPrintReads = 0;
    await page.route("**/api/prints", async (route) => {
      if (route.request().method() === "GET" && failedPrintReads === 0) {
        failedPrintReads += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "temporary" }),
        });
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Refresh and review prints" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "temporarily unavailable" })).toBeVisible();
    await expect(row.locator(`#confirm-reservation-${print.id}`)).toBeDisabled();
    await page.getByRole("button", { name: "Refresh and review prints" }).click();
    await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
    await page.unroute("**/api/prints");

    await row.getByRole("button", { name: "Manage reservation" }).click();
    const activePrint = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
    if (!activePrint?.reservation) throw new Error("The active reservation could not be reloaded before release.");
    const cancellationCommands: string[] = [];
    let retriedDisposition: string | undefined;
    await page.route(`**/api/prints/${print.id}/reservation/cancel`, async (route) => {
      cancelPosts += 1;
      cancellationCommands.push(route.request().postData() ?? "");
      if (cancelPosts > 1) {
        const retry = await route.fetch();
        expect(retry.status()).toBe(200);
        retriedDisposition = ((await retry.json()) as { disposition?: string }).disposition;
        await route.fulfill({ response: retry });
        return;
      }
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.fulfill({ response: committed, body: "unreadable release receipt" });
    });
    await row.getByRole("button", { name: "Release reservation" }).click();
    await expect(page.getByRole("alert")).toContainText("The release result is uncertain");
    expect(cancelPosts).toBe(1);

    let failedReads = 0;
    await page.route(`**/api/${failedCollection}`, async (route) => {
      if (route.request().method() === "GET" && failedReads === 0) {
        failedReads += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "temporary" }),
        });
        return;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Retry the same release" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({
          hasText:
            failedCollection === "spools"
              ? "current spool inventory could not be read"
              : "current print list could not be read",
        })
        .first(),
    ).toBeVisible();
    await expect(row.getByRole("button", { name: "Reserve material" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Retry current print and stock reads" })).toBeVisible();
    await page.getByRole("button", { name: "Retry current print and stock reads" }).click();
    await expect(row.getByRole("button", { name: "Reserve material" })).toBeVisible();
    await page.unroute(`**/api/${failedCollection}`);
    await page.unroute("**/api/prints");
    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      reservedGrams: 0,
      availableGrams: 130,
    });
    expect(reservePosts).toBe(1);
    expect(cancelPosts).toBe(2);
    expect(retriedDisposition).toBe("already_released");
    expect(cancellationCommands[1]).toBe(cancellationCommands[0]);
    expect(new URLSearchParams(cancellationCommands[0]).get("expectedVersion")).toBe(String(activePrint.version));
  });
}

for (const failedCollection of ["prints", "spools"] as const) {
  test(`a stale cancellation keeps its guard when the ${failedCollection} conflict read fails`, async ({
    page,
    recoveryApi,
  }) => {
    const spool = await recoveryApi.createSpool({
      material: "PLA",
      colour: recoveryApi.label("stale-cancel-colour"),
      recordedGrams: 160,
    });
    const print = await recoveryApi.createPrint({
      name: recoveryApi.label("stale-cancel-print"),
      material: spool.material,
      colour: spool.colour,
      requiredGrams: 80,
    });
    await recoveryApi.reserveMaterial(print, spool.id, "best_fit");
    const reviewedPrint = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
    if (!reviewedPrint?.reservation) throw new Error("The active reservation could not be read.");

    await openPrints(page);
    const row = printRecord(page, print.id);
    await row.getByRole("button", { name: "Manage reservation" }).click();
    let cancelPosts = 0;
    let submittedVersion: string | null = null;
    await page.route(`**/api/prints/${print.id}/reservation/cancel`, async (route) => {
      if (route.request().method() === "POST") {
        cancelPosts += 1;
        submittedVersion = new URLSearchParams(route.request().postData() ?? "").get("expectedVersion");
      }
      await route.continue();
    });

    await recoveryApi.updatePrint(print.id, reviewedPrint.version, {
      name: "Reservation changed after the page opened",
      material: print.material,
      colour: print.colour,
      requiredGrams: print.requiredGrams,
    });
    let failedReads = 0;
    await page.route(`**/api/${failedCollection}`, async (route) => {
      if (route.request().method() === "GET" && failedReads === 0) {
        failedReads += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unavailable" } }),
        });
        return;
      }
      await route.continue();
    });
    await row.getByRole("button", { name: "Release reservation" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "The print changed before this release could be applied" }),
    ).toContainText(
      failedCollection === "spools"
        ? "current spool inventory could not be read"
        : "current print list could not be read",
    );
    await expect(page.getByRole("button", { name: "Retry current print and stock reads" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Manage reservation" })).toBeDisabled();
    await page.getByRole("button", { name: "Retry current print and stock reads" }).click();
    await expect(row.getByRole("status")).toContainText("The print changed while the release was being resolved.");
    await expect(row.getByRole("heading", { name: "Material reserved" })).toBeVisible();
    await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
    await page.unroute(`**/api/${failedCollection}`);
    expect(cancelPosts).toBe(1);
    expect(submittedVersion).toBe(String(reviewedPrint.version));
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)).toMatchObject({
      version: reviewedPrint.version + 1,
      reservation: { id: reviewedPrint.reservation.id, spoolId: spool.id, reservedGrams: 88 },
    });
    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      reservedGrams: 88,
      availableGrams: 72,
    });
  });
}

for (const competingOutcome of ["exact retry wins", "recalculation makes it stale"] as const) {
  test(`a held cancellation stays guarded through reads when ${competingOutcome}`, async ({
    page,
    context,
    recoveryApi,
  }) => {
    const spool = await recoveryApi.createSpool({
      material: "PETG",
      colour: recoveryApi.label("held-cancel-colour"),
      recordedGrams: 180,
    });
    const print = await recoveryApi.createPrint({
      name: recoveryApi.label("held-cancel-print"),
      material: spool.material,
      colour: spool.colour,
      requiredGrams: 80,
    });
    const reservationId = await recoveryApi.reserveMaterial(print, spool.id, "manual");
    const before = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
    if (!before?.reservation) throw new Error("The active reservation could not be read before cancellation.");

    const competingPage = await context.newPage();
    const originalHeld = deferred();
    const releaseOriginal = deferred();
    const lateResponse = deferred<{ status: number; body: { disposition?: string; error?: { code?: string } } }>();
    let originalCommand = "";
    try {
      await openPrints(page);
      const row = printRecord(page, print.id);
      await row.getByRole("button", { name: "Manage reservation" }).click();
      await page.route(`**/api/prints/${print.id}/reservation/cancel`, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        originalCommand = route.request().postData() ?? "";
        originalHeld.resolve();
        await releaseOriginal.promise;
        const response = await route.fetch();
        const body = (await response.json()) as { disposition?: string; error?: { code?: string } };
        lateResponse.resolve({ status: response.status(), body });
        await route.fulfill({ response, body: JSON.stringify(body) });
      });

      const firstCancellation = row.getByRole("button", { name: "Release reservation" }).click();
      await originalHeld.promise;
      const readStatuses = await page.evaluate(async () => {
        const [prints, spools] = await Promise.all([fetch("/api/prints"), fetch("/api/spools")]);
        return [prints.status, spools.status];
      });
      expect(readStatuses).toEqual([200, 200]);
      await expect(row.getByRole("button", { name: "Manage reservation" })).toBeDisabled();
      await expect(row.getByRole("button", { name: "Releasing…" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Retry the same release" })).toHaveCount(0);

      await openPrints(competingPage);
      const competingRow = printRecord(competingPage, print.id);
      if (competingOutcome === "exact retry wins") {
        let retryCommand = "";
        await competingPage.route(`**/api/prints/${print.id}/reservation/cancel`, async (route) => {
          if (route.request().method() === "POST") retryCommand = route.request().postData() ?? "";
          await route.continue();
        });
        await competingRow.getByRole("button", { name: "Manage reservation" }).click();
        await competingRow.getByRole("button", { name: "Release reservation" }).click();
        await expect(competingPage.getByRole("status")).toContainText("88 g released");
        expect(retryCommand).toBe(originalCommand);
      } else {
        await printAction(competingPage, "Edit", print.id).click();
        await competingPage.getByLabel("Required filament (g)").fill("90");
        await competingPage.getByRole("button", { name: "Save changes", exact: true }).click();
        await expect(competingPage.getByRole("status")).toContainText("99 g held");
      }

      releaseOriginal.resolve();
      await firstCancellation;
      const late = await lateResponse.promise;
      const expectedCommand = new URLSearchParams(originalCommand);
      expect(expectedCommand.get("reservationId")).toBe(reservationId);
      expect(expectedCommand.get("expectedVersion")).toBe(String(before.version));

      if (competingOutcome === "exact retry wins") {
        expect(late).toMatchObject({ status: 200, body: { disposition: "already_released" } });
        await expect(page.getByRole("status")).toContainText("88 g released");
        const final = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
        expect(final).toMatchObject({ version: before.version + 1, reservation: null });
        expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
          recordedGrams: 180,
          reservedGrams: 0,
          availableGrams: 180,
        });
      } else {
        expect(late).toMatchObject({ status: 409, body: { error: { code: "edit_conflict" } } });
        await expect(row.getByRole("status")).toContainText("The print changed while the release was being resolved.");
        await expect(row.getByRole("heading", { name: "Material reserved" })).toBeVisible();
        const final = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
        expect(final).toMatchObject({
          version: before.version + 1,
          reservation: { id: reservationId, spoolId: spool.id, reservedGrams: 99 },
        });
        expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
          recordedGrams: 180,
          reservedGrams: 99,
          availableGrams: 81,
        });
      }
    } finally {
      releaseOriginal.resolve();
      await competingPage.close();
    }
  });
}

test("cancellation matches its print path and remains idempotent after deletion", async ({
  context,
  recoveryApi,
  baseURL,
}) => {
  if (!baseURL) throw new Error("The E2E base URL is missing.");
  const spool = await recoveryApi.createSpool({
    material: "PLA",
    colour: recoveryApi.label("cancellation-parent"),
    recordedGrams: 150,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("cancellation-print"),
    material: "PLA",
    colour: spool.colour,
    requiredGrams: 80,
  });
  const other = await recoveryApi.createPrint({
    name: recoveryApi.label("cancellation-other-print"),
    material: "PLA",
    colour: spool.colour,
    requiredGrams: 80,
  });
  const reservationId = await recoveryApi.reserveMaterial(print, spool.id, "best_fit");
  const current = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  if (!current) throw new Error("The print disappeared after reserving material.");
  const cancel = (printId: string, expectedVersion: number, id = reservationId) =>
    context.request.post(`${baseURL}/api/prints/${printId}/reservation/cancel`, {
      form: { reservationId: id, expectedVersion: String(expectedVersion) },
      headers: { Origin: new URL(baseURL).origin },
    });

  for (const printId of ["not-a-uuid", other.id, randomUUID()]) {
    const rejected = await cancel(printId, printId === other.id ? other.version : current.version);
    expect(rejected.status()).toBe(404);
    expect(await rejected.json()).toMatchObject({ error: { code: "not_found" } });
  }
  expect(current).toMatchObject({ version: 2, reservation: { id: reservationId } });
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)?.reservedGrams).toBe(88);

  const released = await cancel(print.id, current.version);
  expect(released.status()).toBe(200);
  expect(await released.json()).toMatchObject({ disposition: "released" });
  const repeated = await cancel(print.id, current.version);
  expect(repeated.status()).toBe(200);
  expect(await repeated.json()).toMatchObject({ disposition: "already_released" });

  const releasedPrint = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  if (!releasedPrint) throw new Error("The print disappeared after releasing its reservation.");
  const replacementId = await recoveryApi.reserveMaterial(releasedPrint, spool.id, "best_fit");
  const replacementPrint = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  if (!replacementPrint) throw new Error("The print disappeared after its replacement reservation.");
  expect((await cancel(print.id, current.version)).status()).toBe(200);
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation?.id).toBe(replacementId);

  const deletion = await context.request.post(`${baseURL}/api/prints/${print.id}/delete`, {
    form: {},
    headers: { Origin: new URL(baseURL).origin },
  });
  expect(deletion.status()).toBe(200);
  expect(await deletion.json()).toEqual({
    id: print.id,
    cancelledReservations: [
      {
        reservationId: replacementId,
        printId: print.id,
        printName: print.name,
        material: print.material,
        colour: print.colour,
        releasedGrams: 88,
      },
    ],
    releasedReservationId: replacementId,
    releasedGrams: 88,
    spool: expect.objectContaining({ id: spool.id, recordedGrams: 150, reservedGrams: 0, availableGrams: 150 }),
  });
  const deleted = await cancel(print.id, replacementPrint.version, replacementId);
  expect(deleted.status()).toBe(200);
  expect(await deleted.json()).toMatchObject({ disposition: "already_released", print: null });
  expect((await cancel(other.id, other.version, replacementId)).status()).toBe(404);
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 0,
    availableGrams: 150,
  });
  const unreservedDeletion = await context.request.post(`${baseURL}/api/prints/${other.id}/delete`, {
    form: {},
    headers: { Origin: new URL(baseURL).origin },
  });
  expect(unreservedDeletion.status()).toBe(200);
  expect(await unreservedDeletion.json()).toEqual({
    id: other.id,
    cancelledReservations: [],
    releasedReservationId: null,
    releasedGrams: null,
    spool: null,
  });
});

test("a stale release cannot cancel a replacement reservation", async ({ recoveryApi }) => {
  const spool = await recoveryApi.createSpool({
    material: "PLA",
    colour: recoveryApi.label("reservation-replacement"),
    recordedGrams: 150,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("reservation-replacement-print"),
    material: "PLA",
    colour: spool.colour,
    requiredGrams: 80,
  });

  const oldReservationId = await recoveryApi.reserveMaterial(print, spool.id, "best_fit");
  const active = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  if (!active) throw new Error("The print disappeared after reserving material.");
  await recoveryApi.releaseMaterial(print.id, oldReservationId, active.version);
  const refreshed = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  if (!refreshed) throw new Error("The print disappeared after releasing its reservation.");
  const replacementId = await recoveryApi.reserveMaterial(refreshed, spool.id, "best_fit");
  expect(replacementId).not.toBe(oldReservationId);

  await recoveryApi.releaseMaterial(print.id, oldReservationId, active.version);
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation?.id).toBe(replacementId);
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 88,
    availableGrams: 62,
  });
});

test("reservation selection, confirmation, and release are reachable with the keyboard", async ({
  page,
  recoveryApi,
}) => {
  const spool = await recoveryApi.createSpool({
    material: "TPU",
    colour: recoveryApi.label("reservation-keyboard"),
    recordedGrams: 125,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("reservation-keyboard-print"),
    material: "TPU",
    colour: spool.colour,
    requiredGrams: 50,
  });

  await openPrints(page);
  await expect(page.locator('astro-island[component-export="PrintList"]:not([ssr])')).toHaveCount(1);
  const row = printRecord(page, print.id);
  const reserve = row.getByRole("button", { name: "Reserve material" });
  await reserve.focus();
  await expect(reserve).toBeFocused();
  await page.keyboard.press("Enter");

  const radio = row.getByRole("radio");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await radio.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(radio).toBeFocused();
  await page.keyboard.press("Space");

  const confirm = row.getByRole("button", { name: "Confirm reservation" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await confirm.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Enter");

  const manage = row.getByRole("button", { name: "Manage reservation" });
  await expect(manage).toBeFocused();
  await page.keyboard.press("Enter");
  const release = row.getByRole("button", { name: "Release reservation" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await release.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(release).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(row.getByRole("button", { name: "Reserve material" })).toBeFocused();
});

test("saving a lower margin leaves an existing 88 g reservation unchanged", async ({ page, context, recoveryApi }) => {
  const currentSettings = await recoveryApi.getAccountSettings();
  if (currentSettings.marginPercent !== 10) await recoveryApi.saveAccountSettings(10);
  const spool = await recoveryApi.createSpool({
    material: "PETG",
    colour: recoveryApi.label("reservation-margin-preserved"),
    recordedGrams: 160,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("reservation-margin-preserved-print"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  const settingsPage = await context.newPage();

  try {
    await openPrints(page);
    const row = printRecord(page, print.id);
    await row.getByRole("button", { name: "Reserve material" }).click();
    const preview = printWorkbench(page, print.id);
    await expect(preview).toHaveRole("region");
    await expect(preview).toHaveAccessibleName("Reserve material");
    await expect(preview).toContainText("estimate 88 g from the 80 g you entered");
    await row.getByRole("button", { name: "Confirm reservation" }).click();
    await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
    await row.getByRole("button", { name: "Manage reservation" }).click();
    await expect(row.getByRole("heading", { name: "Material reserved" })).toBeVisible();
    await expect(row.getByText(/88 g reserved from/)).toBeVisible();

    await settingsPage.goto("/dashboard/settings");
    await settingsPage.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
    await settingsPage.locator('astro-island[component-export="AccountSafetyMarginForm"]:not([ssr])').waitFor();
    const settingsPanel = settingsPage.locator('section[aria-labelledby="account-safety-margin-heading"]');
    await settingsPage.getByLabel("New safety margin (%)").fill("5");
    await settingsPanel.getByRole("button", { name: "Save safety margin" }).click();
    await expect(settingsPanel.getByRole("status")).toContainText("Safety margin saved at 5%");
    expect((await recoveryApi.getAccountSettings()).marginPercent).toBe(5);

    await expect(row.getByRole("heading", { name: "Material reserved" })).toBeVisible();
    await expect(row.getByText(/88 g reserved from/)).toBeVisible();
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toMatchObject({
      spoolId: spool.id,
      reservedGrams: 88,
    });
    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      recordedGrams: 160,
      reservedGrams: 88,
      availableGrams: 72,
    });
  } finally {
    await settingsPage.close();
  }
});
