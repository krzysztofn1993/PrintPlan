import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { openPrints, openSpools, printRecord, printSummaryRow, spoolRecord, spoolWorkbench } from "./helpers/ui";

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

    const geometry = await record.evaluate((recordElement) => {
      const rows = recordElement.querySelectorAll<HTMLElement>('[role="row"]');
      const panel = recordElement.querySelector<HTMLElement>(".carbon-inline-panel");
      const toDocumentBox = (element: Element | null) => {
        if (!element) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x: x + window.scrollX, y: y + window.scrollY, width, height };
      };

      return {
        recordBox: toDocumentBox(recordElement),
        summaryBox: toDocumentBox(rows.item(0)),
        detailBox: toDocumentBox(rows.item(1)),
        panelBox: toDocumentBox(panel),
      };
    });
    const { recordBox, summaryBox, detailBox, panelBox } = geometry;
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

async function expectWorkbenchGeometry(page: Page, workbench: Locator): Promise<void> {
  for (const width of panelViewports) {
    await page.setViewportSize({ width, height: pageHeight });

    const geometry = await workbench.evaluate((panelElement) => {
      const collection = panelElement.closest<HTMLElement>(".carbon-collection");
      const table = collection?.querySelector<HTMLElement>('[role="table"]');
      const grid = panelElement.querySelector<HTMLElement>(".carbon-record-workbench-grid");
      const form = panelElement.querySelector<HTMLElement>(".carbon-record-workbench-form");
      const context = panelElement.querySelector<HTMLElement>(".carbon-record-workbench-context");
      const toDocumentBox = (element: Element | null | undefined) => {
        if (!element) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x: x + window.scrollX, y: y + window.scrollY, width, height };
      };

      return {
        panelBox: toDocumentBox(panelElement),
        collectionBox: toDocumentBox(collection),
        tableBox: toDocumentBox(table),
        formBox: toDocumentBox(form),
        contextBox: toDocumentBox(context),
        columns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
        documentWidth: document.documentElement.scrollWidth,
      };
    });

    const { panelBox, collectionBox, tableBox, formBox, contextBox, columns, documentWidth } = geometry;
    expect(panelBox, `workbench should render at ${width}px`).not.toBeNull();
    expect(collectionBox, `collection should render at ${width}px`).not.toBeNull();
    expect(tableBox, `table should render at ${width}px`).not.toBeNull();
    expect(formBox, `form should render at ${width}px`).not.toBeNull();
    expect(contextBox, `context should render at ${width}px`).not.toBeNull();
    if (!panelBox || !collectionBox || !tableBox || !formBox || !contextBox) continue;

    expect(panelBox.y, `workbench should sit above the table at ${width}px`).toBeLessThan(tableBox.y);
    expect(
      panelBox.width / collectionBox.width,
      `workbench should use the collection width at ${width}px`,
    ).toBeGreaterThan(0.85);
    expect(documentWidth, `the document should not overflow horizontally at ${width}px`).toBeLessThanOrEqual(width);
    if (width < 1024) {
      expect(columns, `workbench should stack on mobile at ${width}px`).toBe(1);
      expect(contextBox.y, `context should follow the form on mobile at ${width}px`).toBeGreaterThanOrEqual(
        formBox.y + formBox.height - 1,
      );
    } else {
      expect(columns, `workbench should place context beside the form at ${width}px`).toBe(2);
    }
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
  const table = page.getByRole("table", { name: "Prints" });
  await expect(page.getByRole("link", { name: "Prints", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "Prints" }).getByText("Your prints", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Required grams are an estimate before the safety margin. Creating a print does not reserve stock."),
  ).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Reservation / result" })).toBeVisible();

  const verifyDisclosure = async (record: Locator, triggerId: string, panelId: string) => {
    const trigger = record.locator(`#${triggerId}`);
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(trigger).toHaveAttribute("aria-controls", panelId);
    await expect(page.locator(`#${panelId}`)).toBeVisible();
    await expectWorkbenchGeometry(page, page.locator(`#${panelId}`));
    return trigger;
  };

  const editRecord = printRecord(page, editPrint.id);
  await editRecord.locator(`#edit-print-${editPrint.id}`).click();
  const printWorkbench = page.locator(`#edit-print-panel-${editPrint.id}`);
  await expect(printWorkbench.getByRole("heading", { name: "Edit planned print" })).toBeVisible();
  await expect(printWorkbench.getByRole("complementary", { name: "Current print quantities" })).toContainText(
    "Required estimate",
  );
  await expectWorkbenchGeometry(page, printWorkbench);
  await printWorkbench.getByRole("button", { name: "Cancel" }).click();
  await expect(printSummaryRow(page, editPrint.id).getByRole("row")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(`edit-print-${editPrint.id}`);

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
  const previewWorkbench = page.locator(`#reservation-panel-${previewPrint.id}`);
  await expect(previewWorkbench.getByRole("heading", { name: "Reserve material" })).toBeVisible();
  await expect(previewWorkbench.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/dashboard/settings");
  await expect(previewWorkbench).toContainText("current-margin rules");
  await expect(previewWorkbench).toContainText("Held grams are not consumed.");
  await previewWorkbench.getByRole("button", { name: "Close" }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(`reserve-material-${previewPrint.id}`);
  await expect(reserveTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(printSummaryRow(page, previewPrint.id).getByRole("row")).toHaveCount(1);

  const managedRecord = printRecord(page, managedPrint.id);
  const manageTrigger = await verifyDisclosure(
    managedRecord,
    `manage-reservation-${managedPrint.id}`,
    `reservation-panel-${managedPrint.id}`,
  );
  const manageWorkbench = page.locator(`#reservation-panel-${managedPrint.id}`);
  await expect(manageWorkbench.getByRole("heading", { name: "Material reserved" })).toBeVisible();
  await manageWorkbench.getByRole("button", { name: "Close" }).click();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe(`manage-reservation-${managedPrint.id}`);
  await expect(manageTrigger).toHaveAttribute("aria-expanded", "false");
  await expect(printSummaryRow(page, managedPrint.id).getByRole("row")).toHaveCount(1);

  const settlementInputRecord = printRecord(page, settlementInputPrint.id);
  await verifyDisclosure(
    settlementInputRecord,
    `settle-print-${settlementInputPrint.id}`,
    `settlement-panel-${settlementInputPrint.id}`,
  );
  const settlementWorkbench = page.locator(`#settlement-panel-${settlementInputPrint.id}`);
  await expect(settlementWorkbench.getByRole("heading", { name: "Settle completed print" })).toBeVisible();
  await settlementWorkbench.getByRole("button", { name: "Cancel" }).click();
  await expect(printSummaryRow(page, settlementInputPrint.id).getByRole("row")).toHaveCount(1);

  const completedReviewRecord = printRecord(page, completedReviewPrint.id);
  await verifyDisclosure(
    completedReviewRecord,
    `review-settlement-${completedReviewPrint.id}`,
    `settlement-panel-${completedReviewPrint.id}`,
  );
  const completedReviewWorkbench = page.locator(`#settlement-panel-${completedReviewPrint.id}`);
  await expect(
    completedReviewWorkbench.getByRole("heading", { name: /Settlement result|Review settlement/ }),
  ).toBeVisible();
  await completedReviewWorkbench.getByRole("button", { name: "Close" }).click();
  await expect(printSummaryRow(page, completedReviewPrint.id).getByRole("row")).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: pageHeight });
  await expect(managedRecord.locator(".carbon-print-table-cell-result .carbon-data-table-mobile-label")).toHaveText(
    "Reservation / result",
  );
  await expect(
    completedReviewRecord.locator(".carbon-print-table-cell-result .carbon-data-table-mobile-label"),
  ).toHaveText("Reservation / result");

  await openSpools(page);
  const spoolEditRecord = spoolRecord(page, spool.id);
  await spoolEditRecord.locator(`#edit-spool-${spool.id}`).click();
  const spoolEditWorkbench = spoolWorkbench(page, spool.id);
  await expect(spoolEditWorkbench.getByRole("heading", { name: "Correct this spool" })).toBeVisible();
  await expect(spoolEditWorkbench.getByRole("complementary", { name: "Current spool quantities" })).toContainText(
    "Recorded stock",
  );
  await expectWorkbenchGeometry(page, spoolEditWorkbench);
  await spoolEditWorkbench.getByRole("button", { name: "Cancel" }).click();
  await expect(spoolEditRecord.getByRole("row")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe(`edit-spool-${spool.id}`);

  const spoolDeleteRecord = spoolRecord(page, spareSpool.id);
  await spoolDeleteRecord.locator(`#delete-spool-${spareSpool.id}`).click();
  await expect(spoolDeleteRecord.getByRole("heading", { name: "Delete this spool?" })).toBeVisible();
  await expectPanelGeometry(page, spoolDeleteRecord);
  await spoolDeleteRecord.getByRole("button", { name: "Cancel" }).click();
  await expect(spoolDeleteRecord.getByRole("row")).toHaveCount(1);
});
