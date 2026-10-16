import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { deferred, openPrints, openSpools, printRow, spoolAction, spoolRow } from "./helpers/ui";

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
      await printRow(page, first.id).getByRole("button", { name: "Reserve material" }).click();
      await previewReady.promise;
      const row = printRow(page, second.id);
      await row.getByRole("button", { name: "Reserve material" }).click();
      await expect(row.getByText(/Reserve 110 g/)).toBeVisible();

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

      await expect(row.getByText(/Reserve 110 g/)).toBeVisible();
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
    const row = printRow(page, print.id);
    await row.getByRole("button", { name: "Reserve material" }).click();
    await previewReady.promise;
    await row.getByRole("button", { name: "Close", exact: true }).click();
    await recoveryApi.updateSpool(spool.id, { material: "PETG", colour: spool.colour, recordedGrams: 100 });
    await row.getByRole("button", { name: "Reserve material" }).click();
    await expect(row.getByText(/100 g available/)).toBeVisible();

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

    await expect(row.getByText(/100 g available/)).toBeVisible();
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
  const row = printRow(page, print.id);
  await row.getByRole("button", { name: "Reserve material" }).click();
  await expect(row.getByText(/Reserve 88 g/)).toBeVisible();
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

test("a changed best fit needs a new confirmation, manual choice works, and spool deletion reports cancellation", async ({
  page,
  recoveryApi,
}) => {
  const colour = recoveryApi.label("reservation-stale");
  const first = await recoveryApi.createSpool({ material: "PETG", colour, recordedGrams: 150 });
  const second = await recoveryApi.createSpool({ material: "PETG", colour, recordedGrams: 200 });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("reservation-stale-print"),
    material: "PETG",
    colour,
    requiredGrams: 80,
  });

  await openPrints(page);
  const row = printRow(page, print.id);
  await row.getByRole("button", { name: "Reserve material" }).click();
  await recoveryApi.updateSpool(second.id, { material: "PETG", colour, recordedGrams: 100 });
  await row.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(row.getByRole("alert")).toContainText("suggested best fit changed");
  await expect(row.getByRole("radio")).toHaveCount(2);

  await row.locator(`input[type="radio"][value="${first.id}"]`).check();
  await row.getByRole("button", { name: "Confirm reservation" }).click();
  await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toMatchObject({
    spoolId: first.id,
  });

  await row.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByText(/This print has an active material reservation/)).toBeVisible();
  await expect(page.getByText(/Material, colour, and required grams are locked/)).toBeVisible();
  await expect(page.getByLabel("Name (optional)")).toBeEnabled();
  await expect(page.getByLabel("Material")).toBeDisabled();
  await expect(page.getByLabel("Colour")).toBeDisabled();
  await expect(page.getByLabel("Required filament (g)")).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).last().click();

  await openSpools(page);
  const reservedSpool = spoolRow(page, first.id);
  await spoolAction(page, "Edit", first.id).click();
  await expect(page.getByLabel("Material")).toBeDisabled();
  await expect(page.getByLabel("Colour")).toBeDisabled();
  await expect(page.getByLabel("Recorded stock (g)")).toHaveAttribute("min", "88");
  await page.getByRole("button", { name: "Cancel", exact: true }).last().click();

  await spoolAction(page, "Delete", first.id).click();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByRole("status")).toContainText(`print ${print.id}`);
  await expect(page.getByRole("status")).toContainText("released 88 g");
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.reservation).toBeNull();
  await expect(reservedSpool).toHaveCount(0);
});

test("committed reserve and release with unreadable acknowledgements stay guarded until refresh", async ({
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
  const row = printRow(page, print.id);
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
  await page.route(`**/api/prints/${print.id}/reservation/cancel`, async (route) => {
    cancelPosts += 1;
    const committed = await route.fetch();
    expect(committed.status()).toBe(200);
    await route.fulfill({ response: committed, body: "unreadable release receipt" });
  });
  await row.getByRole("button", { name: "Release reservation" }).click();
  await expect(row.getByRole("alert")).toContainText("release outcome may be uncertain");
  expect(cancelPosts).toBe(1);

  failedPrintReads = 0;
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
  await expect(row.getByRole("button", { name: "Reserve material" })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh and review prints" }).click();
  await expect(row.getByRole("button", { name: "Reserve material" })).toBeVisible();
  await page.unroute("**/api/prints");
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    reservedGrams: 0,
    availableGrams: 130,
  });
  expect(reservePosts).toBe(1);
  expect(cancelPosts).toBe(1);
});

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
  const cancel = (printId: string, id = reservationId) =>
    context.request.post(`${baseURL}/api/prints/${printId}/reservation/cancel`, {
      form: { reservationId: id },
      headers: { Origin: new URL(baseURL).origin },
    });

  for (const printId of ["not-a-uuid", other.id, randomUUID()]) {
    const rejected = await cancel(printId);
    expect(rejected.status()).toBe(404);
    expect(await rejected.json()).toMatchObject({ error: { code: "not_found" } });
  }
  const reserved = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  expect(reserved).toMatchObject({ version: 2, reservation: { id: reservationId } });
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)?.reservedGrams).toBe(88);

  const released = await cancel(print.id);
  expect(released.status()).toBe(200);
  expect(await released.json()).toMatchObject({ disposition: "released" });
  const repeated = await cancel(print.id);
  expect(repeated.status()).toBe(200);
  expect(await repeated.json()).toMatchObject({ disposition: "already_released" });

  const current = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  if (!current) throw new Error("The print disappeared after releasing its reservation.");
  const replacementId = await recoveryApi.reserveMaterial(current, spool.id, "best_fit");
  expect((await cancel(print.id)).status()).toBe(200);
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
  const deleted = await cancel(print.id, replacementId);
  expect(deleted.status()).toBe(200);
  expect(await deleted.json()).toMatchObject({ disposition: "already_released", print: null });
  expect((await cancel(other.id, replacementId)).status()).toBe(404);
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
  await recoveryApi.releaseMaterial(print.id, oldReservationId);
  const refreshed = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  if (!refreshed) throw new Error("The print disappeared after releasing its reservation.");
  const replacementId = await recoveryApi.reserveMaterial(refreshed, spool.id, "best_fit");
  expect(replacementId).not.toBe(oldReservationId);

  await recoveryApi.releaseMaterial(print.id, oldReservationId);
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
  const row = printRow(page, print.id);
  const reserve = row.getByRole("button", { name: "Reserve material" });
  await reserve.focus();
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
