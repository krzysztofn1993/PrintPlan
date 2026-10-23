import { test, expect } from "./fixtures";
import { fillPrintForm, openPrints, printAction, printRow } from "./helpers/ui";

test("reserved edits reuse own capacity, retain an eligible manual spool, and keep reservation age", async ({
  page,
  recoveryApi,
}) => {
  const settings = await recoveryApi.getAccountSettings();
  if (settings.marginPercent !== 10) await recoveryApi.saveAccountSettings(10);

  const colour = recoveryApi.label("edit-manual-retain");
  const manual = await recoveryApi.createSpool({ material: "PLA", colour, recordedGrams: 150 });
  const tighterFit = await recoveryApi.createSpool({ material: "PLA", colour, recordedGrams: 120 });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("edit-manual-retain-print"),
    material: "PLA",
    colour,
    requiredGrams: 80,
  });
  const reservationId = await recoveryApi.reserveMaterial(print, manual.id, "manual");
  const before = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  const beforeEvidence = await recoveryApi.readReservation(print.id);
  if (!before?.reservation || !beforeEvidence) throw new Error("The manual reservation was not readable.");
  expect(beforeEvidence).toMatchObject({ id: reservationId, printId: print.id, spoolId: manual.id });

  await openPrints(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const table = page.getByRole("table", { name: "Print queue" });
  await expect(table.getByRole("columnheader", { name: "Reservation / result" })).toBeVisible();
  const row = printRow(page, print.id);
  await expect(row.locator(".carbon-print-table-cell-material")).toContainText("PLA");
  await expect(row.locator(".carbon-print-table-cell-material")).toContainText(colour);
  await expect(row.locator(".carbon-print-table-cell-required")).toContainText("80 g");
  await expect(row.locator(".carbon-print-table-cell-result")).toContainText("88 g reserved");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table.getByRole("columnheader", { name: "Reservation / result" })).toBeHidden();
  await expect(row.getByText("Material / colour", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });

  await printAction(page, "Edit", print.id).click();
  await page.getByLabel("Required filament (g)").fill("90");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("The manual spool was retained");
  await expect(page.getByRole("status")).toContainText("99 g held");
  const after = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  const afterEvidence = await recoveryApi.readReservation(print.id);
  expect(after).toMatchObject({
    id: print.id,
    requiredGrams: 90,
    version: before.version + 1,
    reservation: { id: reservationId, spoolId: manual.id, reservedGrams: 99 },
  });
  expect(afterEvidence).toEqual(beforeEvidence);
  expect((await recoveryApi.listSpools()).find((item) => item.id === manual.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 99,
    availableGrams: 51,
  });
  expect((await recoveryApi.listSpools()).find((item) => item.id === tighterFit.id)).toMatchObject({
    recordedGrams: 120,
    reservedGrams: 0,
    availableGrams: 120,
  });
  await expect(row).toContainText("90 g");
});

test("a manual fallback stays automatic on the next reserved edit", async ({ page, recoveryApi }) => {
  const original = await recoveryApi.createSpool({
    material: "PLA",
    colour: recoveryApi.label("edit-fallback-original"),
    recordedGrams: 150,
  });
  const fallback = await recoveryApi.createSpool({
    material: "PETG",
    colour: recoveryApi.label("edit-fallback-target"),
    recordedGrams: 150,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("edit-fallback-print"),
    material: original.material,
    colour: original.colour,
    requiredGrams: 80,
  });
  const reservationId = await recoveryApi.reserveMaterial(print, original.id, "manual");
  const before = (await recoveryApi.readReservation(print.id))?.createdAt;
  if (!before) throw new Error("The reservation age was not readable.");

  await openPrints(page);
  await printAction(page, "Edit", print.id).click();
  await fillPrintForm(page, {
    name: print.name,
    material: fallback.material,
    colour: fallback.colour,
    requiredGrams: 82,
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(`moved to best-fit spool ${fallback.id}`);
  await expect(page.getByRole("status")).toContainText("91 g");
  let saved = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  expect(saved).toMatchObject({ reservation: { id: reservationId, spoolId: fallback.id, reservedGrams: 91 } });
  expect((await recoveryApi.readReservation(print.id))?.createdAt).toBe(before);

  await printAction(page, "Edit", print.id).click();
  await page.getByLabel("Required filament (g)").fill("85");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("best-fit spool");
  await expect(page.getByRole("status")).toContainText("94 g");
  saved = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  expect(saved).toMatchObject({
    requiredGrams: 85,
    version: print.version + 3,
    reservation: { id: reservationId, spoolId: fallback.id, reservedGrams: 94 },
  });
  expect((await recoveryApi.readReservation(print.id))?.createdAt).toBe(before);
  expect((await recoveryApi.listSpools()).find((item) => item.id === original.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 0,
    availableGrams: 150,
  });
  expect((await recoveryApi.listSpools()).find((item) => item.id === fallback.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 94,
    availableGrams: 56,
  });
});

test("a no-fit edit saves the requirements and leaves the print unreserved", async ({ page, recoveryApi }) => {
  const spool = await recoveryApi.createSpool({
    material: "ABS",
    colour: recoveryApi.label("edit-no-fit"),
    recordedGrams: 150,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("edit-no-fit-print"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  await recoveryApi.reserveMaterial(print, spool.id, "manual");

  await openPrints(page);
  await printAction(page, "Edit", print.id).click();
  await page.getByLabel("Required filament (g)").fill("1000");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("saved without a reservation");
  await expect(page.getByRole("status")).not.toContainText("error");
  const row = printRow(page, print.id);
  await expect(row.locator(".carbon-print-table-cell-result")).toContainText("No active reservation");
  await expect(row.getByRole("button", { name: "Reserve material" })).toBeVisible();
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)).toMatchObject({
    requiredGrams: 1000,
    version: 3,
    reservation: null,
  });
  expect(await recoveryApi.readReservation(print.id)).toBeNull();
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 0,
    availableGrams: 150,
  });
});

test("a second page edit makes the first page cancellation stale", async ({ page, context, recoveryApi }) => {
  const spool = await recoveryApi.createSpool({
    material: "PETG",
    colour: recoveryApi.label("edit-stale-cancel"),
    recordedGrams: 180,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("edit-stale-cancel-print"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  const reservationId = await recoveryApi.reserveMaterial(print, spool.id, "manual");
  const pageWithStaleView = await context.newPage();

  try {
    await openPrints(page);
    const staleRow = printRow(page, print.id);
    await staleRow.getByRole("button", { name: "Manage reservation" }).click();
    const reviewed = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
    if (!reviewed?.reservation) throw new Error("The reserved print could not be reviewed.");

    await openPrints(pageWithStaleView);
    await printAction(pageWithStaleView, "Edit", print.id).click();
    await pageWithStaleView.getByLabel("Required filament (g)").fill("90");
    await pageWithStaleView.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(pageWithStaleView.getByRole("status")).toContainText("99 g held");
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)).toMatchObject({
      version: reviewed.version + 1,
      reservation: { id: reservationId, spoolId: spool.id, reservedGrams: 99 },
    });

    await staleRow.getByRole("button", { name: "Release reservation" }).click();
    await expect(staleRow.getByRole("status")).toContainText("Cancellation was not applied because the print changed.");
    await expect(staleRow.getByRole("heading", { name: "Material reserved" })).toBeVisible();
    await expect(staleRow).toContainText("99 g reserved");
    await expect(staleRow.getByRole("button", { name: "Manage reservation" })).toBeVisible();
    const current = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
    expect(current).toMatchObject({
      version: reviewed.version + 1,
      reservation: { id: reservationId, spoolId: spool.id, reservedGrams: 99 },
    });
    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      recordedGrams: 180,
      reservedGrams: 99,
      availableGrams: 81,
    });
  } finally {
    await pageWithStaleView.close();
  }
});
