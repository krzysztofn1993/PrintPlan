import { test, expect, type RecoveryApi } from "./fixtures";
import { deferred, openPrints, printRow } from "./helpers/ui";

async function createReservedPrint(recoveryApi: RecoveryApi, prefix: string, recordedGrams = 150, requiredGrams = 80) {
  const colour = recoveryApi.label(`${prefix}-colour`);
  const spool = await recoveryApi.createSpool({ material: "PLA", colour, recordedGrams });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label(prefix),
    material: "PLA",
    colour,
    requiredGrams,
  });
  const reservationId = await recoveryApi.reserveMaterial(print, spool.id, "best_fit");
  return { spool, print, reservationId };
}

test("zero-gram settlement validates input and remains reviewable after refresh and deletion", async ({
  page,
  recoveryApi,
}) => {
  const { spool, print, reservationId } = await createReservedPrint(recoveryApi, "settlement-zero");
  let settlementPosts = 0;

  await openPrints(page);
  const row = printRow(page, print.id);
  await row.getByRole("button", { name: "Settle print" }).click();
  const field = row.getByLabel("Actual consumption (g)");
  await page.route(`**/api/prints/${print.id}/settlement`, async (route) => {
    if (route.request().method() === "POST") settlementPosts += 1;
    await route.continue();
  });

  await field.fill("1.5");
  await row.getByRole("button", { name: "Confirm settlement" }).click();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(
    row.getByText("Enter whole grams using digits only, from 0 to 2,147,483,647.", { exact: true }),
  ).toBeVisible();
  expect(settlementPosts).toBe(0);

  await field.fill("0");
  await row.getByRole("button", { name: "Confirm settlement" }).click();
  await expect(row.getByRole("heading", { name: "Settlement result" })).toBeVisible();
  const result = row.getByRole("region", { name: "Settlement result" });
  await expect(row.getByText("Saved settlement result.")).toBeVisible();
  await expect(result.getByText("Actual consumption", { exact: true }).locator("..")).toContainText("0 g");
  const receipt = await recoveryApi.readPrintSettlement(print.id);
  expect(receipt).toMatchObject({ actualGrams: 0, exceededEstimate: false, reservationId });
  expect(receipt?.spool).toMatchObject({
    recordedGramsBefore: 150,
    recordedGramsAfter: 150,
    reservedGramsAfter: 0,
    availableGramsAfter: 150,
  });
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 0,
    availableGrams: 150,
  });
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.settlement?.actualGrams).toBe(0);
  expect(settlementPosts).toBe(1);

  await row.getByRole("button", { name: "Close", exact: true }).click();
  const review = row.getByRole("button", { name: "Review settlement" });
  await expect(review).toBeFocused();
  await page.reload();
  const refreshedRow = printRow(page, print.id);
  await refreshedRow.getByRole("button", { name: "Review settlement" }).click();
  await expect(refreshedRow.getByRole("heading", { name: "Settlement result" })).toBeVisible();
  const refreshedResult = refreshedRow.getByRole("region", { name: "Settlement result" });
  await expect(refreshedResult.getByText("Actual consumption", { exact: true }).locator("..")).toContainText("0 g");

  await refreshedRow.getByRole("button", { name: "Close", exact: true }).click();
  await refreshedRow.getByRole("button", { name: `Delete completed print ${print.id.slice(0, 8)}` }).click();
  await expect(page.getByRole("heading", { name: "Delete this completed print?" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(printRow(page, print.id)).toHaveCount(0);
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 0,
    availableGrams: 150,
  });
  expect(await recoveryApi.readPrintSettlement(print.id)).toMatchObject({ id: receipt?.id, actualGrams: 0 });
});

test("exceeded estimate cancels the other reservation and shows saved and current stock", async ({
  page,
  recoveryApi,
}) => {
  const { spool, print, reservationId } = await createReservedPrint(recoveryApi, "settlement-exceeded");
  const other = await recoveryApi.createPrint({
    name: recoveryApi.label("settlement-exceeded-other"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 30,
  });
  const otherReservationId = await recoveryApi.reserveMaterial(other, spool.id, "best_fit");

  await openPrints(page);
  const row = printRow(page, print.id);
  await row.getByRole("button", { name: "Settle print" }).click();
  await row.getByLabel("Actual consumption (g)").fill("151");
  await row.getByRole("button", { name: "Confirm settlement" }).click();

  await expect(row.getByRole("heading", { name: "Settlement result" })).toBeVisible();
  await expect(
    row.getByRole("status").filter({ hasText: "The entered estimate exceeded recorded stock." }),
  ).toBeVisible();
  await expect(row.getByRole("heading", { name: "Newer reservations cancelled (1)" })).toBeVisible();
  await expect(row.getByText(other.id, { exact: true })).toBeVisible();
  await expect(row.getByText(otherReservationId, { exact: true })).toBeVisible();
  const receipt = await recoveryApi.readPrintSettlement(print.id);
  expect(receipt).toMatchObject({
    actualGrams: 151,
    exceededEstimate: true,
    reservationId,
    cancelledReservations: [{ printId: other.id, reservationId: otherReservationId, releasedGrams: 33 }],
    spool: { recordedGramsBefore: 150, recordedGramsAfter: 0, reservedGramsAfter: 0, availableGramsAfter: 0 },
  });
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 0,
    reservedGrams: 0,
    availableGrams: 0,
  });
  expect((await recoveryApi.listPrints()).find((item) => item.id === other.id)?.reservation).toBeNull();
});

test("a held settlement blocks duplicate actions, a null receipt is not rollback, and exact replay recovers", async ({
  page,
  recoveryApi,
}) => {
  const { spool, print } = await createReservedPrint(recoveryApi, "settlement-exact-replay");
  const firstPostHeld = deferred();
  const releaseFirstPost = deferred();
  const commands: string[] = [];
  let settlementPosts = 0;
  let settlementReads = 0;
  let replayResult: { settlement: { id: string }; replayed: boolean } | undefined;

  await openPrints(page);
  const row = printRow(page, print.id);
  await row.getByRole("button", { name: "Settle print" }).click();
  await row.getByLabel("Actual consumption (g)").fill("75");
  await page.route(`**/api/prints/${print.id}/settlement`, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      settlementReads += 1;
      if (settlementReads === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "temporarily_unavailable" } }),
        });
        return;
      }
      await route.continue();
      return;
    }
    if (method !== "POST") {
      await route.continue();
      return;
    }

    settlementPosts += 1;
    commands.push(route.request().postData() ?? "");
    if (settlementPosts === 1) {
      firstPostHeld.resolve();
      await releaseFirstPost.promise;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "temporarily_unavailable" } }),
      });
      return;
    }

    const replay = await route.fetch();
    expect(replay.status()).toBe(200);
    replayResult = (await replay.json()) as typeof replayResult;
    await route.fulfill({ response: replay });
  });

  try {
    const submit = row.getByRole("button", { name: "Confirm settlement" }).click();
    await firstPostHeld.promise;
    await expect(row.getByRole("button", { name: "Settling…" })).toBeDisabled();
    await expect(row.getByRole("button", { name: "Delete planned print" })).toBeDisabled();
    expect(await recoveryApi.readPrintSettlement(print.id)).toBeNull();
    releaseFirstPost.resolve();
    await submit;

    await expect(row.getByRole("button", { name: "Retry exact settlement" })).toBeVisible();
    await row.getByRole("button", { name: "Retry exact settlement" }).click();
    await expect(row.getByRole("heading", { name: "Settlement result" })).toBeVisible();
    expect(settlementPosts).toBe(2);
    expect(settlementReads).toBe(1);
    expect(commands).toHaveLength(2);
    expect(commands[1]).toBe(commands[0]);
    expect(replayResult?.replayed).toBe(true);
    const receipt = await recoveryApi.readPrintSettlement(print.id);
    expect(receipt?.id).toBe(replayResult?.settlement.id);
    expect(receipt?.requestId).toBe(new URLSearchParams(commands[0]).get("requestId"));
    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      recordedGrams: 75,
      reservedGrams: 0,
      availableGrams: 75,
    });
    expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)?.settlement?.actualGrams).toBe(75);
  } finally {
    releaseFirstPost.resolve();
    await page.unroute(`**/api/prints/${print.id}/settlement`);
  }
});

test("failed receipt and stock reads recover without resubmitting a confirmed settlement", async ({
  page,
  recoveryApi,
}) => {
  const { spool, print, reservationId } = await createReservedPrint(recoveryApi, "settlement-read-recovery");
  let settlementPosts = 0;
  let settlementReads = 0;
  let failNextPrintRead = false;
  let failNextSpoolRead = false;
  let failedPrintReads = 0;
  let failedSpoolReads = 0;

  await openPrints(page);
  const row = printRow(page, print.id);
  await row.getByRole("button", { name: "Settle print" }).click();
  await row.getByLabel("Actual consumption (g)").fill("61");
  await page.route(`**/api/prints/${print.id}/settlement`, async (route) => {
    if (route.request().method() === "POST") {
      settlementPosts += 1;
      const committed = await route.fetch();
      expect(committed.status()).toBe(200);
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "internal_error" } }),
      });
      return;
    }
    settlementReads += 1;
    if (settlementReads === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "temporarily_unavailable" } }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/spools", async (route) => {
    if (route.request().method() === "GET" && failNextSpoolRead) {
      failNextSpoolRead = false;
      failedSpoolReads += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "temporarily_unavailable" } }),
      });
      return;
    }
    await route.continue();
  });
  await page.route("**/api/prints", async (route) => {
    if (route.request().method() === "GET" && failNextPrintRead) {
      failNextPrintRead = false;
      failedPrintReads += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "temporarily_unavailable" } }),
      });
      return;
    }
    await route.continue();
  });

  await row.getByRole("button", { name: "Confirm settlement" }).click();
  await expect(row.getByRole("button", { name: "Check saved result" })).toBeVisible();
  expect(settlementPosts).toBe(1);
  expect(settlementReads).toBe(1);

  failNextPrintRead = true;
  await row.getByRole("button", { name: "Check saved result" }).click();
  await expect(row.getByRole("heading", { name: "Settlement result" })).toBeVisible();
  const result = row.getByRole("region", { name: "Settlement result" });
  await expect(row.getByRole("alert").filter({ hasText: "current print list could not be read" })).toBeVisible();
  await expect(result.getByText("Actual consumption", { exact: true }).locator("..")).toContainText("61 g");
  await expect(row.getByRole("button", { name: "Refresh current stock review" })).toBeEnabled();
  expect(settlementPosts).toBe(1);
  expect(failedPrintReads).toBe(1);

  failNextSpoolRead = true;
  await row.getByRole("button", { name: "Refresh current stock review" }).click();
  await expect(row.getByRole("alert").filter({ hasText: "current spool inventory could not be read" })).toBeVisible();
  await expect(result.getByText("Actual consumption", { exact: true }).locator("..")).toContainText("61 g");
  await expect(row.getByRole("button", { name: "Refresh current stock review" })).toBeEnabled();
  expect(settlementPosts).toBe(1);
  expect(failedSpoolReads).toBe(1);

  await row.getByRole("button", { name: "Refresh current stock review" }).click();
  const currentStock = result.getByRole("region", { name: "Current spool stock" });
  await expect(currentStock.getByText("Latest values for", { exact: false })).toBeVisible();
  await expect(currentStock.getByText("Recorded", { exact: true }).locator("..")).toContainText("89 g");
  await expect(currentStock.getByText("Reserved", { exact: true }).locator("..")).toContainText("0 g");
  await expect(currentStock.getByText("Available", { exact: true }).locator("..")).toContainText("89 g");
  expect(settlementPosts).toBe(1);
  expect(settlementReads).toBe(2);
  expect((await recoveryApi.readPrintSettlement(print.id))?.reservationId).toBe(reservationId);
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 89,
    reservedGrams: 0,
    availableGrams: 89,
  });
});

test("a definitive stale-command rejection confirms no receipt and retains the user's draft", async ({
  page,
  recoveryApi,
}) => {
  const { spool, print } = await createReservedPrint(recoveryApi, "settlement-stale-command");

  await openPrints(page);
  const row = printRow(page, print.id);
  await row.getByRole("button", { name: "Settle print" }).click();
  await row.getByLabel("Actual consumption (g)").fill("52");
  const current = (await recoveryApi.listPrints()).find((item) => item.id === print.id);
  if (!current) throw new Error("The settlement fixture disappeared before the stale-command test.");
  const changedName = recoveryApi.label("settlement-stale-winner");
  await recoveryApi.updatePrint(print.id, current.version, {
    name: changedName,
    material: print.material,
    colour: print.colour,
    requiredGrams: print.requiredGrams,
  });

  await row.getByRole("button", { name: "Confirm settlement" }).click();
  await expect(row.getByRole("alert").filter({ hasText: "The print changed before settlement." })).toBeVisible();
  await expect(row.getByText("This attempt was not applied.", { exact: false })).toBeVisible();
  await expect(row.getByLabel("Actual consumption (g)")).toHaveValue("52");
  await expect(row).toContainText(changedName);
  expect(await recoveryApi.readPrintSettlement(print.id)).toBeNull();
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    recordedGrams: 150,
    reservedGrams: 88,
    availableGrams: 62,
  });
});

test("expired settlement session preserves the draft and offers sign-in guidance", async ({ page, recoveryApi }) => {
  const { print } = await createReservedPrint(recoveryApi, "settlement-expired-session");
  let settlementPosts = 0;

  await openPrints(page);
  const row = printRow(page, print.id);
  await row.getByRole("button", { name: "Settle print" }).click();
  await row.getByLabel("Actual consumption (g)").fill("43");
  await page.route(`**/api/prints/${print.id}/settlement`, async (route) => {
    if (route.request().method() === "POST") {
      settlementPosts += 1;
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "unauthenticated",
            message: "Your session has expired. Sign in to continue.",
            signInUrl: "/auth/signin",
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await row.getByRole("button", { name: "Confirm settlement" }).click();
  await expect(row.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/auth/signin");
  await expect(row.getByLabel("Actual consumption (g)")).toHaveValue("43");
  await expect(row.getByLabel("Actual consumption (g)")).toBeDisabled();
  expect(settlementPosts).toBe(1);
  expect(await recoveryApi.readPrintSettlement(print.id)).toBeNull();
});

test("deletion during acknowledgement recovery retains the saved receipt", async ({ page, recoveryApi }) => {
  const { spool, print } = await createReservedPrint(recoveryApi, "settlement-delete-recovery");
  const resultCommitted = deferred();
  const releaseAcknowledgement = deferred();
  let settlementPosts = 0;

  await openPrints(page);
  const row = printRow(page, print.id);
  await row.getByRole("button", { name: "Settle print" }).click();
  await row.getByLabel("Actual consumption (g)").fill("50");
  await page.route(`**/api/prints/${print.id}/settlement`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    settlementPosts += 1;
    const committed = await route.fetch();
    expect(committed.status()).toBe(200);
    resultCommitted.resolve();
    await releaseAcknowledgement.promise;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "internal_error" } }),
    });
  });

  try {
    const submit = row.getByRole("button", { name: "Confirm settlement" }).click();
    await resultCommitted.promise;
    const receipt = await recoveryApi.readPrintSettlement(print.id);
    expect(receipt).toMatchObject({ printId: print.id, actualGrams: 50 });
    await recoveryApi.deletePrint(print.id);
    releaseAcknowledgement.resolve();
    await submit;

    await expect(page.getByRole("heading", { name: "Settlement result" })).toBeVisible();
    await expect(page.getByText("Settlement recovery", { exact: true })).toBeVisible();
    await expect(printRow(page, print.id)).toHaveCount(0);
    expect(settlementPosts).toBe(1);
    expect(await recoveryApi.readPrintSettlement(print.id)).toMatchObject({ id: receipt?.id, actualGrams: 50 });
    expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
      recordedGrams: 100,
      reservedGrams: 0,
      availableGrams: 100,
    });
  } finally {
    releaseAcknowledgement.resolve();
    await page.unroute(`**/api/prints/${print.id}/settlement`);
  }
});
