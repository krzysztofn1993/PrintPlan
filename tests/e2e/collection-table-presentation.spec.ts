import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openPrints, openSpools, printRecord, spoolRecord } from "./helpers/ui";

const panelViewports = [320, 390, 1279, 1280, 1440] as const;
const pageHeight = 1000;
const longColour = "Deep Blue With A Deliberately Long Filament Label";

async function expectPanelGeometry(page: Page, record: Locator): Promise<void> {
  await expect(record.getByRole("row")).toHaveCount(2);
  await expect(record.getByRole("row").first().getByRole("cell")).toHaveCount(5);

  const detailRow = record.getByRole("row").nth(1);
  await expect(detailRow.getByRole("cell")).toHaveCount(1);
  await expect(detailRow.getByRole("cell")).toHaveAttribute("aria-colspan", "5");

  for (const width of panelViewports) {
    await page.setViewportSize({ width, height: pageHeight });

    const recordBox = await record.boundingBox();
    const summaryBox = await record.getByRole("row").first().boundingBox();
    const detailBox = await detailRow.boundingBox();
    const panelBox = await detailRow.locator(".carbon-inline-panel").boundingBox();
    expect(recordBox, `record should have a rendered box at ${width}px`).not.toBeNull();
    expect(summaryBox, `summary should have a rendered box at ${width}px`).not.toBeNull();
    expect(detailBox, `detail row should have a rendered box at ${width}px`).not.toBeNull();
    expect(panelBox, `detail surface should have a rendered box at ${width}px`).not.toBeNull();
    if (!recordBox || !summaryBox || !detailBox || !panelBox) continue;

    expect(detailBox.y, `detail row should follow the summary at ${width}px`).toBeGreaterThanOrEqual(
      summaryBox.y + summaryBox.height - 1,
    );
    expect(panelBox.x, `panel should remain inside its record at ${width}px`).toBeGreaterThanOrEqual(recordBox.x - 1);
    expect(panelBox.x + panelBox.width, `panel should not extend past its record at ${width}px`).toBeLessThanOrEqual(
      recordBox.x + recordBox.width + 1,
    );
    expect(panelBox.width / recordBox.width, `panel should fill its record at ${width}px`).toBeGreaterThan(0.75);

    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth, `the document should not overflow horizontally at ${width}px`).toBeLessThanOrEqual(width);
  }
}

test("print and stock details keep their record semantics, width, and reservation focus", async ({
  page,
  recoveryApi,
}) => {
  test.setTimeout(120_000);

  const spool = await recoveryApi.createSpool({
    material: "PLA",
    colour: longColour,
    recordedGrams: 2400,
  });
  const spareSpool = await recoveryApi.createSpool({
    material: "PLA",
    colour: "Unreserved stock correction sample",
    recordedGrams: 500,
  });
  const createPrint = (prefix: string) =>
    recoveryApi.createPrint({
      name: `${prefix} — ${"Long print title ".repeat(3)}`.slice(0, 78),
      material: spool.material,
      colour: spool.colour,
      requiredGrams: 80,
    });

  const editPrint = await createPrint("Edit panel geometry");
  const deletePrint = await createPrint("Delete panel geometry");
  const previewPrint = await createPrint("Reservation preview geometry");
  const managedPrint = await createPrint("Reservation management geometry");
  const settlementInputPrint = await createPrint("Settlement input geometry");
  const completedReviewPrint = await createPrint("Completed review geometry");

  await recoveryApi.reserveMaterial(managedPrint, spool.id, "manual");
  const settlementReservationId = await recoveryApi.reserveMaterial(settlementInputPrint, spool.id, "manual");
  const reviewReservationId = await recoveryApi.reserveMaterial(completedReviewPrint, spool.id, "manual");
  const reservedReviewPrint = (await recoveryApi.listPrints()).find((print) => print.id === completedReviewPrint.id);
  expect(reservedReviewPrint?.reservation?.id).toBe(reviewReservationId);
  if (!reservedReviewPrint?.reservation) throw new Error("The completed-review fixture reservation was missing.");
  await recoveryApi.settlePrint(completedReviewPrint.id, {
    requestId: randomUUID(),
    expectedVersion: reservedReviewPrint.version,
    reservationId: reservedReviewPrint.reservation.id,
    actualGrams: 76,
  });
  const currentSettlementPrint = (await recoveryApi.listPrints()).find((print) => print.id === settlementInputPrint.id);
  expect(currentSettlementPrint?.reservation?.id).toBe(settlementReservationId);

  await openPrints(page);

  const verifyDisclosure = async (record: Locator, triggerId: string, panelId: string) => {
    const trigger = record.locator(`#${triggerId}`);
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toHaveAttribute("aria-controls", panelId);
    await expect(page.locator(`#${panelId}`)).toBeVisible();
    await expectPanelGeometry(page, record);
    return trigger;
  };

  const editRecord = printRecord(page, editPrint.id);
  await editRecord.locator(`#edit-print-${editPrint.id}`).click();
  await expect(editRecord.getByRole("heading", { name: "Edit planned print" })).toBeVisible();
  await expectPanelGeometry(page, editRecord);
  await editRecord.getByRole("button", { name: "Cancel" }).click();
  await expect(editRecord.getByRole("row")).toHaveCount(1);

  const deleteRecord = printRecord(page, deletePrint.id);
  await deleteRecord.locator(`#delete-print-${deletePrint.id}`).click();
  await expect(deleteRecord.getByRole("heading", { name: "Delete this planned print?" })).toBeVisible();
  await expectPanelGeometry(page, deleteRecord);
  await deleteRecord.getByRole("button", { name: "Cancel" }).click();
  await expect(deleteRecord.getByRole("row")).toHaveCount(1);

  const previewRecord = printRecord(page, previewPrint.id);
  const reserveTrigger = await verifyDisclosure(
    previewRecord,
    `reserve-material-${previewPrint.id}`,
    `reservation-panel-${previewPrint.id}`,
  );
  await expect(previewRecord.getByRole("heading", { name: "Reserve material" })).toBeVisible();
  await previewRecord.getByRole("button", { name: "Close" }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(`reserve-material-${previewPrint.id}`);
  await expect(reserveTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(previewRecord.getByRole("row")).toHaveCount(1);

  const managedRecord = printRecord(page, managedPrint.id);
  const manageTrigger = await verifyDisclosure(
    managedRecord,
    `manage-reservation-${managedPrint.id}`,
    `reservation-panel-${managedPrint.id}`,
  );
  await expect(managedRecord.getByRole("heading", { name: "Material reserved" })).toBeVisible();
  await managedRecord.getByRole("button", { name: "Close" }).click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe(`manage-reservation-${managedPrint.id}`);
  await expect(manageTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(managedRecord.getByRole("row")).toHaveCount(1);

  const settlementInputRecord = printRecord(page, settlementInputPrint.id);
  await verifyDisclosure(
    settlementInputRecord,
    `settle-print-${settlementInputPrint.id}`,
    `settlement-panel-${settlementInputPrint.id}`,
  );
  await expect(settlementInputRecord.getByRole("heading", { name: "Settle completed print" })).toBeVisible();
  await settlementInputRecord.getByRole("button", { name: "Cancel" }).click();
  await expect(settlementInputRecord.getByRole("row")).toHaveCount(1);

  const completedReviewRecord = printRecord(page, completedReviewPrint.id);
  await verifyDisclosure(
    completedReviewRecord,
    `review-settlement-${completedReviewPrint.id}`,
    `settlement-panel-${completedReviewPrint.id}`,
  );
  await expect(
    completedReviewRecord.getByRole("heading", { name: /Settlement result|Review settlement/ }),
  ).toBeVisible();
  await completedReviewRecord.getByRole("button", { name: "Close" }).click();
  await expect(completedReviewRecord.getByRole("row")).toHaveCount(1);

  await openSpools(page);
  const spoolEditRecord = spoolRecord(page, spool.id);
  await spoolEditRecord.locator(`#edit-spool-${spool.id}`).click();
  await expect(spoolEditRecord.getByRole("heading", { name: "Correct this spool" })).toBeVisible();
  await expectPanelGeometry(page, spoolEditRecord);
  await spoolEditRecord.getByRole("button", { name: "Cancel" }).click();
  await expect(spoolEditRecord.getByRole("row")).toHaveCount(1);

  const spoolDeleteRecord = spoolRecord(page, spareSpool.id);
  await spoolDeleteRecord.locator(`#delete-spool-${spareSpool.id}`).click();
  await expect(spoolDeleteRecord.getByRole("heading", { name: "Delete this spool?" })).toBeVisible();
  await expectPanelGeometry(page, spoolDeleteRecord);
  await spoolDeleteRecord.getByRole("button", { name: "Cancel" }).click();
  await expect(spoolDeleteRecord.getByRole("row")).toHaveCount(1);
});
