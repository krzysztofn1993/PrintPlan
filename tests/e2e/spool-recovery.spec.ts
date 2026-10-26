import { test, expect, type SpoolRecord } from "./fixtures";
import {
  deferred,
  fillSpoolForm,
  openSpoolCreate,
  openSpools,
  spoolAction,
  spoolRecord,
  spoolSummaryRow,
} from "./helpers/ui";

test("server validation retains stock fields, focuses material, then saves canonical values", async ({
  page,
  recoveryApi,
}) => {
  const colour = recoveryApi.label("stock-validation");
  const invalidMaterial = "ß".repeat(41);
  const validMaterial = "ß".repeat(40);
  let browserPosts = 0;

  await openSpools(page);
  await openSpoolCreate(page);
  await page.route("**/api/spools", async (route) => {
    if (route.request().method() === "POST") browserPosts += 1;
    await route.continue();
  });
  await fillSpoolForm(page, { material: invalidMaterial, colour, recordedGrams: 23 });
  await page.getByRole("button", { name: "Add spool", exact: true }).click();

  const material = page.getByLabel("Material");
  await expect(
    page.getByText("The normalized material label must be no longer than 80 characters.", { exact: true }),
  ).toBeVisible();
  await expect(material).toHaveValue(invalidMaterial);
  await expect(material).toHaveAttribute("aria-invalid", "true");
  expect(await material.getAttribute("aria-describedby")).toContain("new-spool-material-error");
  await expect(material).toBeFocused();
  await expect(page.getByLabel("Colour")).toHaveValue(colour);
  await expect(page.getByLabel("Recorded stock (g)")).toHaveValue("23");
  expect((await recoveryApi.listSpools()).some((spool) => spool.colour === colour)).toBe(false);

  await material.fill(validMaterial);
  await page.getByRole("button", { name: "Add spool", exact: true }).click();

  await expect(page.getByRole("status")).toContainText(`${"S".repeat(80)}, ${colour}, 23 g saved.`);
  const saved = (await recoveryApi.listSpools()).filter((spool) => spool.colour === colour);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ material: "S".repeat(80), colour, recordedGrams: 23 });
  await recoveryApi.trackSpool(saved[0].id);
  expect(browserPosts).toBe(2);
});

test("a stock 503 preserves the draft and requires a fresh review before retry", async ({ page, recoveryApi }) => {
  const existing = await recoveryApi.createSpool({
    material: "PETG",
    colour: recoveryApi.label("stock-pending-existing"),
    recordedGrams: 81,
  });
  const colour = recoveryApi.label("stock-pending-retry");
  const requestStarted = deferred();
  const releaseResponse = deferred();
  let browserPosts = 0;

  await openSpools(page);
  await openSpoolCreate(page);
  await page.route("**/api/spools", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    browserPosts += 1;
    if (browserPosts === 1) {
      requestStarted.resolve();
      await releaseResponse.promise;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "unavailable" } }),
      });
      return;
    }
    await route.continue();
  });

  await fillSpoolForm(page, { material: "PLA", colour, recordedGrams: 42 });
  const submitClick = page.getByRole("button", { name: "Add spool", exact: true }).click();
  await requestStarted.promise;
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add a spool", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect(spoolAction(page, "Edit", existing.id)).toBeDisabled();
  await expect(spoolAction(page, "Delete", existing.id)).toBeDisabled();
  expect(browserPosts).toBe(1);

  releaseResponse.resolve();
  await submitClick;
  await expect(page.getByRole("region", { name: "Add a spool" }).getByRole("alert")).toContainText(
    "The save outcome may be uncertain. Refresh stock and review it before trying again.",
  );
  await expect(page.getByLabel("Material")).toHaveValue("PLA");
  await expect(page.getByLabel("Colour")).toHaveValue(colour);
  await expect(page.getByLabel("Recorded stock (g)")).toHaveValue("42");
  expect(browserPosts).toBe(1);
  await expect(page.getByRole("button", { name: "Add spool", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();

  await page
    .getByRole("alert")
    .filter({ hasText: "A stock change may have completed without confirmation" })
    .getByRole("button", { name: "Refresh and review stock" })
    .click();
  await expect(page.getByRole("region", { name: "Add a spool" })).toHaveCount(0);
  await openSpoolCreate(page);
  await fillSpoolForm(page, { material: "PLA", colour, recordedGrams: 42 });
  await page.getByRole("button", { name: "Add spool", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(`PLA, ${colour}, 42 g saved.`);
  const saved = (await recoveryApi.listSpools()).filter((spool) => spool.colour === colour);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ material: "PLA", colour, recordedGrams: 42 });
  await recoveryApi.trackSpool(saved[0].id);
  expect(browserPosts).toBe(2);
});

test("a committed stock save with an unreadable reply keeps the active-form guard until navigation rereads", async ({
  page,
  recoveryApi,
}) => {
  const colour = recoveryApi.label("stock-uncertain-save");
  let browserPosts = 0;
  let acknowledged: { spool: { id: string; material: string; colour: string; recordedGrams: number } } | undefined;

  await openSpools(page);
  await openSpoolCreate(page);
  await page.route("**/api/spools", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    browserPosts += 1;
    const realResponse = await route.fetch();
    expect(realResponse.status()).toBe(201);
    const receipt = (await realResponse.json()) as { spool: SpoolRecord };
    acknowledged = receipt;
    await recoveryApi.trackSpool(receipt.spool.id);
    await route.fulfill({ response: realResponse, body: "unreadable successful acknowledgement" });
  });

  await fillSpoolForm(page, { material: "PETG", colour, recordedGrams: 117 });
  await page.getByRole("button", { name: "Add spool", exact: true }).click();
  await expect(page.getByRole("region", { name: "Add a spool" }).getByRole("alert")).toContainText(
    "The save may have completed, but its result could not be read.",
  );
  expect(acknowledged?.spool).toMatchObject({ material: "PETG", colour, recordedGrams: 117 });
  await expect(page.getByLabel("Material")).toHaveValue("PETG");
  await expect(page.getByLabel("Colour")).toHaveValue(colour);
  await expect(page.getByLabel("Recorded stock (g)")).toHaveValue("117");
  await expect(page.getByRole("button", { name: "Add spool", exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("");

  const persisted = (await recoveryApi.listSpools()).filter((spool) => spool.colour === colour);
  expect(persisted).toHaveLength(1);
  expect(persisted[0]).toMatchObject({ material: "PETG", colour, recordedGrams: 117 });
  await recoveryApi.trackSpool(persisted[0].id);

  await page.getByLabel("Material").fill("ASA");
  await page.getByLabel("Colour").fill(`${colour}-edited`);
  await page.getByLabel("Recorded stock (g)").fill("118");
  await expect(page.getByRole("button", { name: "Add spool", exact: true })).toBeDisabled();
  expect(browserPosts).toBe(1);

  await page
    .getByRole("alert")
    .filter({ hasText: "A stock change may have completed without confirmation" })
    .getByRole("button", { name: "Refresh and review stock" })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/spools$/);
  await expect(spoolSummaryRow(page, persisted[0].id)).toBeVisible();
  expect((await recoveryApi.listSpools()).filter((spool) => spool.colour === colour)).toHaveLength(1);
  expect(browserPosts).toBe(1);
});

test("a committed stock delete with an unreadable reply stays visible until refresh and preserves its survivor", async ({
  page,
  recoveryApi,
}) => {
  const target = await recoveryApi.createSpool({
    material: "PLA",
    colour: recoveryApi.label("stock-delete-target"),
    recordedGrams: 64,
  });
  const survivor = await recoveryApi.createSpool({
    material: "TPU",
    colour: recoveryApi.label("stock-delete-survivor"),
    recordedGrams: 205,
  });
  let browserPosts = 0;
  let deletedId: string | undefined;

  await openSpools(page);
  await spoolAction(page, "Delete", target.id).click();
  await expect(page.getByRole("heading", { name: "Delete this spool?" })).toBeVisible();
  await page.route(`**/api/spools/${target.id}/delete`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    browserPosts += 1;
    const realResponse = await route.fetch();
    expect(realResponse.status()).toBe(200);
    deletedId = ((await realResponse.json()) as { id: string }).id;
    await route.fulfill({ response: realResponse, body: "unreadable delete acknowledgement" });
  });

  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(spoolRecord(page, target.id).getByRole("alert")).toContainText(
    "Deletion may have completed, but its cancellation details could not be read.",
  );
  expect(deletedId).toBe(target.id);
  await expect(spoolSummaryRow(page, target.id)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm deletion" })).toBeDisabled();
  expect(browserPosts).toBe(1);

  const persisted = await recoveryApi.listSpools();
  expect(persisted.some((spool) => spool.id === target.id)).toBe(false);
  expect(persisted.find((spool) => spool.id === survivor.id)).toMatchObject({
    material: "TPU",
    colour: survivor.colour,
    recordedGrams: 205,
  });

  await spoolRecord(page, target.id).getByRole("alert").getByRole("button", { name: "Refresh stock" }).click();
  await expect(spoolSummaryRow(page, target.id)).toHaveCount(0);
  await expect(spoolSummaryRow(page, survivor.id)).toBeVisible();
  const afterRefresh = await recoveryApi.listSpools();
  expect(afterRefresh.some((spool) => spool.id === target.id)).toBe(false);
  expect(afterRefresh.find((spool) => spool.id === survivor.id)).toMatchObject({
    material: "TPU",
    colour: survivor.colour,
    recordedGrams: 205,
  });
  expect(browserPosts).toBe(1);
});

test("a committed reserved delete stays guarded until refresh and keeps surviving prints", async ({
  page,
  recoveryApi,
}) => {
  const target = await recoveryApi.createSpool({
    material: "PETG",
    colour: recoveryApi.label("reserved-stock-delete-target"),
    recordedGrams: 200,
  });
  const namedPrint = await recoveryApi.createPrint({
    name: recoveryApi.label("reserved-stock-delete-named"),
    material: target.material,
    colour: target.colour,
    requiredGrams: 80,
  });
  const unnamedPrint = await recoveryApi.createPrint({
    name: null,
    material: target.material,
    colour: target.colour,
    requiredGrams: 50,
  });
  const survivor = await recoveryApi.createSpool({
    material: "TPU",
    colour: recoveryApi.label("reserved-stock-delete-survivor"),
    recordedGrams: 205,
  });
  const namedReservationId = await recoveryApi.reserveMaterial(namedPrint, target.id, "best_fit");
  const unnamedReservationId = await recoveryApi.reserveMaterial(unnamedPrint, target.id, "best_fit");
  expect((await recoveryApi.listSpools()).find((spool) => spool.id === target.id)).toMatchObject({
    recordedGrams: 200,
    reservedGrams: 143,
    availableGrams: 57,
  });

  let browserDeletePosts = 0;
  let browserSpoolReads = 0;
  await openSpools(page);
  await spoolAction(page, "Delete", target.id).click();
  await expect(page.getByRole("heading", { name: "Delete this spool?" })).toBeVisible();
  await page.route(`**/api/spools/${target.id}/delete`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    browserDeletePosts += 1;
    const committedResponse = await route.fetch();
    expect(committedResponse.status()).toBe(200);
    const receipt = (await committedResponse.json()) as {
      cancelledReservations: {
        reservationId: string;
        printId: string;
        releasedGrams: number;
      }[];
    };
    expect(receipt.cancelledReservations).toHaveLength(2);
    expect(receipt.cancelledReservations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reservationId: namedReservationId,
          printId: namedPrint.id,
          releasedGrams: 88,
        }),
        expect.objectContaining({
          reservationId: unnamedReservationId,
          printId: unnamedPrint.id,
          releasedGrams: 55,
        }),
      ]),
    );
    await route.fulfill({ response: committedResponse, body: "unreadable reserved delete acknowledgement" });
  });

  await page.getByRole("button", { name: "Confirm deletion" }).click();
  const targetRow = spoolRecord(page, target.id);
  const deletionFeedback = targetRow.getByRole("alert");
  await expect(deletionFeedback).toContainText("Deletion may have completed");
  await expect(deletionFeedback).toContainText("refreshing cannot recover the original cancellation list");
  await expect(deletionFeedback.getByRole("button", { name: "Refresh stock" })).toBeVisible();
  await expect(deletionFeedback.getByRole("link", { name: "Manage reservations in prints" })).toHaveAttribute(
    "href",
    "/dashboard/prints",
  );
  await expect(targetRow.getByRole("button", { name: "Confirm deletion" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add a spool" })).toBeDisabled();
  await expect(spoolAction(page, "Edit", survivor.id)).toBeDisabled();
  await expect(spoolAction(page, "Delete", survivor.id)).toBeDisabled();
  expect(browserDeletePosts).toBe(1);

  await page.route("**/api/spools", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    browserSpoolReads += 1;
    if (browserSpoolReads === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "temporary" }),
      });
      return;
    }
    await route.continue();
  });
  await deletionFeedback.getByRole("button", { name: "Refresh stock" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "latest stock state could not be read" })).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "A stock change may have completed without confirmation" }),
  ).toBeVisible();
  await expect(targetRow.getByRole("button", { name: "Confirm deletion" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add a spool" })).toBeDisabled();
  await expect(spoolAction(page, "Edit", survivor.id)).toBeDisabled();
  expect(browserDeletePosts).toBe(1);

  await deletionFeedback.getByRole("button", { name: "Refresh stock" }).click();
  await expect(targetRow).toHaveCount(0);
  await expect(spoolSummaryRow(page, survivor.id)).toBeVisible();
  await expect(page.getByRole("status")).toHaveText(
    "Stock refreshed. Review the current saved spools before making another change.",
  );
  await page.unroute("**/api/spools");

  const savedSpools = await recoveryApi.listSpools();
  expect(savedSpools.some((spool) => spool.id === target.id)).toBe(false);
  expect(savedSpools.find((spool) => spool.id === survivor.id)).toMatchObject({
    material: "TPU",
    colour: survivor.colour,
    recordedGrams: 205,
    reservedGrams: 0,
    availableGrams: 205,
  });
  const savedPrints = await recoveryApi.listPrints();
  expect(savedPrints.find((print) => print.id === namedPrint.id)).toMatchObject({ reservation: null });
  expect(savedPrints.find((print) => print.id === unnamedPrint.id)).toMatchObject({ reservation: null });
  expect(browserDeletePosts).toBe(1);
  expect(browserSpoolReads).toBe(2);
});
