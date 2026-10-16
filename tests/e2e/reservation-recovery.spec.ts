import { test, expect } from "./fixtures";
import { openPrints, openSpools, printRow, spoolAction, spoolRow } from "./helpers/ui";

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
  await page.getByRole("button", { name: "Refresh and review prints" }).click();
  await expect(row.getByRole("button", { name: "Manage reservation" })).toBeVisible();

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
  await page.getByRole("button", { name: "Refresh and review prints" }).click();
  await expect(row.getByRole("button", { name: "Reserve material" })).toBeVisible();
  expect((await recoveryApi.listSpools()).find((item) => item.id === spool.id)).toMatchObject({
    reservedGrams: 0,
    availableGrams: 130,
  });
  expect(reservePosts).toBe(1);
  expect(cancelPosts).toBe(1);
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
