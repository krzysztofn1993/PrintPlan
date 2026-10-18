import type { Page } from "@playwright/test";
import type { PrintInput, SpoolInput } from "../fixtures";

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

export async function openSpools(page: Page): Promise<void> {
  await page.goto("/dashboard/spools");
  await page.getByRole("heading", { name: "Filament stock", level: 1 }).waitFor();
}

export async function openPrints(page: Page): Promise<void> {
  await page.goto("/dashboard/prints");
  await page.getByRole("heading", { name: "Prints", level: 1 }).waitFor();
}

export async function openSpoolCreate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add a spool" }).click();
  await page.getByRole("heading", { name: "Add a spool", level: 3 }).waitFor();
  await page.getByLabel("Material").waitFor();
}

export async function openPrintCreate(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Add a print" }).click();
  await page.getByRole("heading", { name: "Add a planned print", level: 3 }).waitFor();
  await page.getByLabel("Name (optional)").waitFor();
}

export async function fillSpoolForm(page: Page, input: SpoolInput): Promise<void> {
  await page.getByLabel("Material").fill(input.material);
  await page.getByLabel("Colour").fill(input.colour);
  await page.getByLabel("Recorded stock (g)").fill(String(input.recordedGrams));
}

export async function fillPrintForm(page: Page, input: PrintInput): Promise<void> {
  await page.getByLabel("Name (optional)").fill(input.name ?? "");
  await page.getByLabel("Material").fill(input.material);
  await page.getByLabel("Colour").fill(input.colour);
  await page.getByLabel("Required filament (g)").fill(String(input.requiredGrams));
}

export function spoolRow(page: Page, id: string) {
  return page.getByRole("article").filter({ hasText: id.slice(0, 8) });
}

export function printRow(page: Page, id: string) {
  return page.getByRole("article").filter({ hasText: id });
}

export function spoolAction(page: Page, action: "Edit" | "Delete", id: string) {
  return page.getByRole("button", { name: `${action} spool ${id.slice(0, 8)}` });
}

export function printAction(page: Page, action: "Edit" | "Delete", id: string) {
  return page.getByRole("button", { name: `${action} planned print ${id.slice(0, 8)}` });
}

export async function respondToConfirm(
  page: Page,
  action: () => Promise<unknown>,
  accepted: boolean,
  message: string,
): Promise<void> {
  const dialogEvent = page.waitForEvent("dialog");
  const actionResult = action();
  const dialog = await dialogEvent;
  if (!dialog.message().includes(message)) {
    await dialog.dismiss();
    await actionResult;
    throw new Error("The browser displayed an unexpected confirmation message.");
  }
  if (accepted) await dialog.accept();
  else await dialog.dismiss();
  await actionResult;
}
