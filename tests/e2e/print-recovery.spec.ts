import { test, expect, type PrintRecord } from "./fixtures";
import {
  deferred,
  fillPrintForm,
  openPrintCreate,
  openPrints,
  printAction,
  printRow,
  respondToConfirm,
} from "./helpers/ui";

test("server validation retains a planned-print draft, focuses grams, then saves corrected values", async ({
  page,
  recoveryApi,
}) => {
  const name = recoveryApi.label("print-validation");
  const colour = recoveryApi.label("print-validation-colour");
  let browserPosts = 0;

  await openPrints(page);
  await openPrintCreate(page);
  await page.route("**/api/prints", async (route) => {
    if (route.request().method() === "POST") browserPosts += 1;
    await route.continue();
  });
  await fillPrintForm(page, { name, material: "PETG", colour, requiredGrams: 0 });
  await page.getByRole("button", { name: "Add print", exact: true }).click();

  const grams = page.getByLabel("Required filament (g)");
  await expect(page.getByText("Enter a whole-gram amount from 1 to 2147483647.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Name (optional)")).toHaveValue(name);
  await expect(page.getByLabel("Material")).toHaveValue("PETG");
  await expect(page.getByLabel("Colour")).toHaveValue(colour);
  await expect(grams).toHaveValue("0");
  await expect(grams).toHaveAttribute("aria-invalid", "true");
  expect(await grams.getAttribute("aria-describedby")).toContain("new-print-requiredGrams-error");
  await expect(grams).toBeFocused();
  expect((await recoveryApi.listPrints()).some((print) => print.name === name)).toBe(false);
  expect(browserPosts).toBe(1);

  await grams.fill("12");
  await page.getByRole("button", { name: "Add print", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(`${name} saved.`);
  const saved = (await recoveryApi.listPrints()).filter((print) => print.name === name);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ name, material: "PETG", colour, requiredGrams: 12, version: 1 });
  await recoveryApi.trackPrint(saved[0].id);
  expect(browserPosts).toBe(2);
});

test("a real stale print edit keeps its draft and requires consent before reading the winner", async ({
  page,
  recoveryApi,
}) => {
  const initial = await recoveryApi.createPrint({
    name: recoveryApi.label("print-stale-original"),
    material: "PLA",
    colour: recoveryApi.label("print-stale-original-colour"),
    requiredGrams: 70,
  });
  let browserPosts = 0;
  let browserReads = 0;

  await openPrints(page);
  await printAction(page, "Edit", initial.id).click();
  await expect(page.getByRole("heading", { name: "Edit planned print" })).toBeVisible();
  await fillPrintForm(page, {
    name: recoveryApi.label("print-stale-draft"),
    material: "ABS",
    colour: recoveryApi.label("print-stale-draft-colour"),
    requiredGrams: 100,
  });
  await page.route(`**/api/prints/${initial.id}/update`, async (route) => {
    if (route.request().method() === "POST") browserPosts += 1;
    await route.continue();
  });
  await page.route("**/api/prints", async (route) => {
    if (route.request().method() === "GET") browserReads += 1;
    await route.continue();
  });

  const winner = await recoveryApi.updatePrint(initial.id, initial.version, {
    name: "Fresh 90 g winner",
    material: "PETG",
    colour: "Winner / Blue",
    requiredGrams: 90,
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Another save changed this print after you opened it." }),
  ).toBeVisible();
  await expect(page.getByLabel("Required filament (g)")).toHaveValue("100");
  await expect(page.getByText(/version 1/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();

  const draftName = recoveryApi.label("print-stale-edited-draft");
  await page.getByLabel("Name (optional)").fill(draftName);
  await expect(page.getByLabel("Name (optional)")).toHaveValue(draftName);
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  expect(browserPosts).toBe(1);

  await respondToConfirm(
    page,
    () => page.getByRole("button", { name: "Read latest print" }).click(),
    false,
    "Reading the latest print will discard",
  );
  expect(browserReads).toBe(0);
  await expect(page.getByLabel("Name (optional)")).toHaveValue(draftName);
  await expect(page.getByLabel("Required filament (g)")).toHaveValue("100");

  await respondToConfirm(
    page,
    () => page.getByRole("button", { name: "Read latest print" }).click(),
    true,
    "Reading the latest print will discard",
  );
  await expect(page.getByText(/version 2/)).toBeVisible();
  await expect(page.getByLabel("Name (optional)")).toHaveValue("Fresh 90 g winner");
  await expect(page.getByLabel("Required filament (g)")).toHaveValue("90");
  await expect(page.getByLabel("Material")).toHaveValue("PETG");
  await expect(page.getByLabel("Colour")).toHaveValue("Winner / Blue");
  expect(browserReads).toBe(1);
  expect(browserPosts).toBe(1);
  expect(winner).toMatchObject({ requiredGrams: 90, version: 2 });
  expect((await recoveryApi.listPrints()).find((print) => print.id === initial.id)).toMatchObject({
    name: "Fresh 90 g winner",
    requiredGrams: 90,
    version: 2,
  });
});

test("an uncertain reserved edit retries the captured command and waits for paired reads", async ({
  page,
  recoveryApi,
}) => {
  const spool = await recoveryApi.createSpool({
    material: "PLA",
    colour: recoveryApi.label("print-edit-recovery-colour"),
    recordedGrams: 180,
  });
  const print = await recoveryApi.createPrint({
    name: recoveryApi.label("print-edit-recovery"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  await recoveryApi.reserveMaterial(print, spool.id, "manual");

  const commandBodies: string[] = [];
  let browserPosts = 0;
  let failedStockReads = 0;
  await openPrints(page);
  await printAction(page, "Edit", print.id).click();
  await page.route(`**/api/prints/${print.id}/update`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    browserPosts += 1;
    commandBodies.push(route.request().postData() ?? "");
    if (browserPosts === 1) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  await page.route("**/api/spools", async (route) => {
    if (route.request().method() === "GET" && failedStockReads === 0) {
      failedStockReads += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "unavailable" } }),
      });
      return;
    }
    await route.continue();
  });

  const savedName = recoveryApi.label("captured-edit-command");
  await fillPrintForm(page, { name: savedName, material: "PLA", colour: spool.colour, requiredGrams: 90 });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "exact edit may have completed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry exact edit" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a print" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();

  await page.getByLabel("Name (optional)").fill(`${savedName}-draft-only`);
  await page.getByLabel("Required filament (g)").fill("91");
  await expect(page.getByLabel("Name (optional)")).toHaveValue(`${savedName}-draft-only`);
  await page.getByRole("button", { name: "Retry exact edit" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "current spool inventory could not be read" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry current print and stock reads" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry exact edit" })).toHaveCount(0);
  await expect(page.getByLabel("Name (optional)")).toHaveValue(`${savedName}-draft-only`);
  await expect(printRow(page, print.id)).toContainText(savedName);
  await expect(printRow(page, print.id)).toContainText("90 g");
  expect(browserPosts).toBe(2);
  expect(commandBodies[1]).toBe(commandBodies[0]);

  await page.getByRole("button", { name: "Retry current print and stock reads" }).click();
  await expect(page.getByRole("button", { name: "Retry current print and stock reads" })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("manual spool was retained");
  await expect(page.getByRole("status")).toContainText("99 g held");
  await expect(page.getByRole("heading", { name: "Edit planned print" })).toHaveCount(0);
  expect(browserPosts).toBe(2);
  expect((await recoveryApi.listPrints()).find((item) => item.id === print.id)).toMatchObject({
    name: savedName,
    material: "PLA",
    colour: spool.colour,
    requiredGrams: 90,
    reservation: { spoolId: spool.id, reservedGrams: 99 },
  });
  await page.unroute("**/api/spools");
  await page.unroute(`**/api/prints/${print.id}/update`);
});

test("a held committed print save blocks collection actions and recovers after a failed then successful read", async ({
  page,
  recoveryApi,
}) => {
  const existing = await recoveryApi.createPrint({
    name: recoveryApi.label("print-pending-existing"),
    material: "PLA",
    colour: recoveryApi.label("print-pending-existing-colour"),
    requiredGrams: 31,
  });
  const name = recoveryApi.label("print-uncertain-save");
  const colour = recoveryApi.label("print-uncertain-save-colour");
  const realWriteFinished = deferred();
  const releaseAcknowledgement = deferred();
  let browserPosts = 0;
  let browserReads = 0;
  let committed: { print: PrintRecord } | undefined;

  await openPrints(page);
  await openPrintCreate(page);
  await page.route("**/api/prints", async (route) => {
    if (route.request().method() === "POST") {
      browserPosts += 1;
      const realResponse = await route.fetch();
      expect(realResponse.status()).toBe(201);
      const receipt = (await realResponse.json()) as { print: PrintRecord };
      committed = receipt;
      await recoveryApi.trackPrint(receipt.print.id);
      realWriteFinished.resolve();
      await releaseAcknowledgement.promise;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "unavailable" } }),
      });
      return;
    }

    if (route.request().method() === "GET") {
      browserReads += 1;
      if (browserReads === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unavailable" } }),
        });
        return;
      }
    }
    await route.continue();
  });

  await fillPrintForm(page, { name, material: "ASA", colour, requiredGrams: 93 });
  const submitClick = page.getByRole("button", { name: "Add print", exact: true }).click();
  await realWriteFinished.promise;
  expect(committed?.print).toMatchObject({ name, material: "ASA", colour, requiredGrams: 93 });
  const persistedWhileHeld = (await recoveryApi.listPrints()).filter((print) => print.name === name);
  expect(persistedWhileHeld).toHaveLength(1);
  await recoveryApi.trackPrint(persistedWhileHeld[0].id);
  await expect(page.getByRole("button", { name: "Saving…", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add a print", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Refresh list" })).toBeDisabled();
  await expect(printAction(page, "Edit", existing.id)).toBeDisabled();
  await expect(printAction(page, "Delete", existing.id)).toBeDisabled();
  expect(browserPosts).toBe(1);

  releaseAcknowledgement.resolve();
  await submitClick;
  await expect(page.getByRole("alert").filter({ hasText: "The save outcome may be uncertain." })).toBeVisible();
  await expect(page.getByLabel("Name (optional)")).toHaveValue(name);
  await expect(page.getByLabel("Material")).toHaveValue("ASA");
  await expect(page.getByLabel("Colour")).toHaveValue(colour);
  await expect(page.getByLabel("Required filament (g)")).toHaveValue("93");
  await expect(page.getByRole("button", { name: "Add print", exact: true })).toBeDisabled();

  await page.getByLabel("Name (optional)").fill(`${name}-edited`);
  await page.getByLabel("Material").fill("PETG");
  await page.getByLabel("Colour").fill(`${colour}-edited`);
  await page.getByLabel("Required filament (g)").fill("94");
  await expect(page.getByRole("button", { name: "Add print", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add a planned print" })).toBeVisible();
  await expect(page.getByLabel("Name (optional)")).toHaveValue(`${name}-edited`);
  await expect(page.getByRole("button", { name: "Add print", exact: true })).toBeDisabled();
  await respondToConfirm(
    page,
    () => page.getByRole("button", { name: "Refresh and review prints" }).click(),
    true,
    "Refreshing the list will discard unsaved form entries",
  );
  await expect(page.getByRole("alert").filter({ hasText: "Prints are temporarily unavailable." })).toBeVisible();
  await expect(page.getByLabel("Name (optional)")).toHaveValue(`${name}-edited`);
  await expect(page.getByRole("button", { name: "Add print", exact: true })).toBeDisabled();
  expect(browserReads).toBe(1);

  await respondToConfirm(
    page,
    () => page.getByRole("button", { name: "Refresh and review prints" }).click(),
    true,
    "Refreshing the list will discard unsaved form entries",
  );
  await expect(printRow(page, persistedWhileHeld[0].id)).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "A previous change may have completed" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add a print" })).toBeEnabled();
  await expect(page.getByRole("heading", { name: "Add a planned print" })).toHaveCount(0);
  await openPrintCreate(page);
  await expect(page.getByRole("button", { name: "Add print", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(browserReads).toBe(2);
  expect(browserPosts).toBe(1);
  expect((await recoveryApi.listPrints()).find((print) => print.id === persistedWhileHeld[0].id)).toMatchObject({
    name,
    material: "ASA",
    colour,
    requiredGrams: 93,
    version: 1,
  });
});

for (const acknowledgement of ["network rejection", "unreadable successful reply", "readable 500"] as const) {
  test(`${acknowledgement} preserves a print draft until a fresh read`, async ({ page, recoveryApi }) => {
    const name = recoveryApi.label(`print-${acknowledgement.replaceAll(" ", "-")}`);
    const colour = recoveryApi.label("print-other-ack-colour");
    let browserPosts = 0;
    let forwarded: { print: PrintRecord } | undefined;

    await openPrints(page);
    await openPrintCreate(page);
    await page.route("**/api/prints", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      browserPosts += 1;
      if (acknowledgement === "network rejection") {
        await route.abort("failed");
      } else if (acknowledgement === "unreadable successful reply") {
        const realResponse = await route.fetch();
        expect(realResponse.status()).toBe(201);
        forwarded = (await realResponse.json()) as { print: PrintRecord };
        await recoveryApi.trackPrint(forwarded.print.id);
        await route.fulfill({ response: realResponse, body: "unreadable successful acknowledgement" });
      } else {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "internal_error" } }),
        });
      }
    });

    await fillPrintForm(page, { name, material: "PLA", colour, requiredGrams: 48 });
    await page.getByRole("button", { name: "Add print", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Refresh the print list" })).toBeVisible();
    await expect(page.getByLabel("Name (optional)")).toHaveValue(name);
    await expect(page.getByLabel("Material")).toHaveValue("PLA");
    await expect(page.getByLabel("Colour")).toHaveValue(colour);
    await expect(page.getByLabel("Required filament (g)")).toHaveValue("48");
    await expect(page.getByRole("button", { name: "Add print", exact: true })).toBeDisabled();
    expect(browserPosts).toBe(1);

    const persisted = (await recoveryApi.listPrints()).filter((print) => print.name === name);
    if (acknowledgement === "unreadable successful reply") {
      expect(persisted).toHaveLength(1);
      expect(forwarded?.print).toMatchObject({ name, material: "PLA", colour, requiredGrams: 48 });
    } else {
      expect(persisted).toHaveLength(0);
    }

    await respondToConfirm(
      page,
      () => page.getByRole("button", { name: "Refresh and review prints" }).click(),
      true,
      "Refreshing the list will discard unsaved form entries",
    );
    if (acknowledgement === "unreadable successful reply") {
      await expect(printRow(page, persisted[0].id)).toBeVisible();
    } else {
      expect((await recoveryApi.listPrints()).some((print) => print.name === name)).toBe(false);
    }
    await expect(page.getByRole("alert").filter({ hasText: "A previous change may have completed" })).toHaveCount(0);
    await openPrintCreate(page);
    await expect(page.getByRole("button", { name: "Add print", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    expect(browserPosts).toBe(1);
  });
}

test("a committed print delete keeps the collection guard through a failed read and removes only its target", async ({
  page,
  recoveryApi,
}) => {
  const target = await recoveryApi.createPrint({
    name: recoveryApi.label("print-delete-target"),
    material: "ABS",
    colour: recoveryApi.label("print-delete-target-colour"),
    requiredGrams: 63,
  });
  const survivor = await recoveryApi.createPrint({
    name: recoveryApi.label("print-delete-survivor"),
    material: "TPU",
    colour: recoveryApi.label("print-delete-survivor-colour"),
    requiredGrams: 208,
  });
  let browserPosts = 0;
  let browserReads = 0;
  let deletedId: string | undefined;

  await openPrints(page);
  await printAction(page, "Delete", target.id).click();
  await page.getByRole("button", { name: "Confirm deletion" }).waitFor();
  await page.route(`**/api/prints/${target.id}/delete`, async (route) => {
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
  await page.route("**/api/prints", async (route) => {
    if (route.request().method() === "GET") {
      browserReads += 1;
      if (browserReads === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unavailable" } }),
        });
        return;
      }
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Deletion may have completed" })).toBeVisible();
  expect(deletedId).toBe(target.id);
  await expect(printRow(page, target.id)).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm deletion" })).toBeDisabled();
  expect(browserPosts).toBe(1);
  const persisted = await recoveryApi.listPrints();
  expect(persisted.some((print) => print.id === target.id)).toBe(false);
  expect(persisted.find((print) => print.id === survivor.id)).toMatchObject({
    name: survivor.name,
    material: "TPU",
    colour: survivor.colour,
    requiredGrams: 208,
    version: 1,
  });

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add a print", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh and review prints" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Prints are temporarily unavailable." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "A previous change may have completed" })).toBeVisible();
  expect(browserReads).toBe(1);
  await expect(printRow(page, target.id)).toBeVisible();

  await page.getByRole("button", { name: "Refresh and review prints" }).click();
  await expect(printRow(page, target.id)).toHaveCount(0);
  await expect(printRow(page, survivor.id)).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "A previous change may have completed" })).toHaveCount(0);
  expect(browserReads).toBe(2);
  await openPrintCreate(page);
  await expect(page.getByRole("button", { name: "Add print", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  const refreshed = await recoveryApi.listPrints();
  expect(refreshed.some((print) => print.id === target.id)).toBe(false);
  expect(refreshed.find((print) => print.id === survivor.id)).toMatchObject({
    name: survivor.name,
    material: "TPU",
    colour: survivor.colour,
    requiredGrams: 208,
    version: 1,
  });
  expect(browserPosts).toBe(1);
  expect(browserReads).toBe(2);
});

test("generic retry asks before replacing a draft after the saved print advances", async ({ page, recoveryApi }) => {
  const initial = await recoveryApi.createPrint({
    name: recoveryApi.label("print-generic-retry-original"),
    material: "PLA",
    colour: recoveryApi.label("print-generic-retry-colour"),
    requiredGrams: 72,
  });
  let browserReads = 0;
  let browserPosts = 0;

  await openPrints(page);
  await page.route("**/api/prints", async (route) => {
    if (route.request().method() === "GET") {
      browserReads += 1;
      if (browserReads === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "unavailable" } }),
        });
        return;
      }
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Refresh list" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Prints are temporarily unavailable." })).toBeVisible();
  expect(browserReads).toBe(1);

  await printAction(page, "Edit", initial.id).click();
  const draftName = recoveryApi.label("print-generic-retry-draft");
  await fillPrintForm(page, {
    name: draftName,
    material: "ABS",
    colour: recoveryApi.label("print-generic-retry-draft-colour"),
    requiredGrams: 100,
  });
  await page.route(`**/api/prints/${initial.id}/update`, async (route) => {
    if (route.request().method() === "POST") browserPosts += 1;
    await route.continue();
  });

  const winner = await recoveryApi.updatePrint(initial.id, initial.version, {
    name: "Latest saved print",
    material: "PETG",
    colour: "Current / Green",
    requiredGrams: 90,
  });
  await respondToConfirm(
    page,
    () => page.getByRole("button", { name: "Try again" }).click(),
    false,
    "Refreshing the list will discard unsaved form entries",
  );
  expect(browserReads).toBe(1);
  await expect(page.getByLabel("Name (optional)")).toHaveValue(draftName);
  await expect(page.getByLabel("Required filament (g)")).toHaveValue("100");

  await respondToConfirm(
    page,
    () => page.getByRole("button", { name: "Try again" }).click(),
    true,
    "Refreshing the list will discard unsaved form entries",
  );
  await expect(printRow(page, initial.id)).toContainText("Latest saved print");
  await expect(printRow(page, initial.id)).toContainText("90 g");
  await expect(page.getByRole("heading", { name: "Edit planned print" })).toHaveCount(0);
  expect(browserReads).toBe(2);
  expect(browserPosts).toBe(0);
  expect(winner).toMatchObject({ requiredGrams: 90, version: 2 });
  expect((await recoveryApi.listPrints()).find((print) => print.id === initial.id)).toMatchObject({
    name: "Latest saved print",
    requiredGrams: 90,
    version: 2,
  });
});
