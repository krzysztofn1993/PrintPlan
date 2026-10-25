import type { APIResponse, Page } from "@playwright/test";
import { test, expect, type RecoveryApi } from "./fixtures";
import { deferred, openPrints, printAction, printRecord } from "./helpers/ui";

type Operation = "edit" | "cancellation";

async function prepareRecovery(page: Page, api: RecoveryApi, operation: Operation) {
  const spool = await api.createSpool({
    material: "PLA",
    colour: api.label("exact-recovery-colour"),
    recordedGrams: 180,
  });
  const created = await api.createPrint({
    name: api.label("exact-recovery-print"),
    material: spool.material,
    colour: spool.colour,
    requiredGrams: 80,
  });
  const reservationId = await api.reserveMaterial(created, spool.id, "manual");
  const print = (await api.listPrints()).find((item) => item.id === created.id);
  if (!print?.reservation) throw new Error("The recovery fixture needs an active reservation.");
  expect(print.reservation.reservedGrams).toBe(88);

  await openPrints(page);
  if (operation === "edit") {
    await printAction(page, "Edit", print.id).click();
    await page.getByLabel("Required filament (g)").fill("90");
  } else {
    await printRecord(page, print.id).getByRole("button", { name: "Manage reservation" }).click();
  }
  return {
    print,
    spool,
    reservationId,
    endpoint: `**/api/prints/${print.id}/${operation === "edit" ? "update" : "reservation/cancel"}`,
    submitName: operation === "edit" ? "Save changes" : "Release reservation",
    retryName: operation === "edit" ? "Retry the same edit" : "Retry the same release",
  };
}

async function expectUncertainGuard(page: Page, operation: Operation, printId: string) {
  await expect(
    page.getByRole("button", { name: operation === "edit" ? "Retry the same edit" : "Retry the same release" }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Add a print", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Refresh list", exact: true })).toBeDisabled();
  if (operation === "edit") {
    await expect(printAction(page, "Delete", printId)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  } else {
    await expect(printAction(page, "Delete", printId)).toBeDisabled();
    await expect(printRecord(page, printId).getByRole("button", { name: "Manage reservation" })).toBeDisabled();
    await expect(printRecord(page, printId).getByRole("button", { name: "Releasing…" })).toBeDisabled();
  }
  await expect(page.getByRole("button", { name: "Retry current print and stock reads" })).toHaveCount(0);
}

async function readBothCollections(page: Page) {
  const statuses = await page.evaluate(async () => {
    const responses = await Promise.all([fetch("/api/prints"), fetch("/api/spools")]);
    return Promise.all(
      responses.map(async (response) => {
        await response.json();
        return response.status;
      }),
    );
  });
  expect(statuses).toEqual([200, 200]);
}

async function expectSavedState(
  api: RecoveryApi,
  scenario: Awaited<ReturnType<typeof prepareRecovery>>,
  operation: Operation,
) {
  const edited = operation === "edit";
  expect((await api.listPrints()).find((item) => item.id === scenario.print.id)).toMatchObject({
    version: scenario.print.version + 1,
    requiredGrams: edited ? 90 : 80,
    reservation: edited ? { id: scenario.reservationId, spoolId: scenario.spool.id, reservedGrams: 99 } : null,
  });
  expect((await api.listSpools()).find((item) => item.id === scenario.spool.id)).toMatchObject({
    recordedGrams: 180,
    reservedGrams: edited ? 99 : 0,
    availableGrams: edited ? 81 : 180,
  });
}

for (const operation of ["edit", "cancellation"] as const) {
  for (const failure of ["authentication", "validation", "server", "transport", "unreadable"] as const) {
    test(`uncertain ${operation} recovery survives a failed ${failure} retry`, async ({ page, recoveryApi }) => {
      const scenario = await prepareRecovery(page, recoveryApi, operation);
      const commands: string[] = [];
      await page.route(scenario.endpoint, async (route) => {
        commands.push(route.request().postData() ?? "");
        if (commands.length === 1 || (commands.length === 2 && failure === "transport")) {
          await route.abort("failed");
        } else if (commands.length === 2 && failure === "unreadable") {
          const committed = await route.fetch();
          expect(committed.status()).toBe(200);
          await route.fulfill({ response: committed, body: "unreadable committed reply" });
        } else if (commands.length === 2) {
          await route.fulfill({
            status: failure === "authentication" ? 401 : failure === "validation" ? 422 : 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: {
                code:
                  failure === "authentication"
                    ? "unauthenticated"
                    : failure === "validation"
                      ? "validation_failed"
                      : "unavailable",
              },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await page.getByRole("button", { name: scenario.submitName, exact: true }).click();
      await expectUncertainGuard(page, operation, scenario.print.id);
      if (operation === "edit") await page.getByLabel("Required filament (g)").fill("91");

      await page.getByRole("button", { name: scenario.retryName }).click();
      const message =
        failure === "authentication"
          ? /Your session expired before/
          : failure === "validation"
            ? /rejected because .*could not be validated/
            : failure === "transport"
              ? /^(?:Your edit|The release) may have completed/
              : /(edit|release) result is still uncertain/;
      const retryAlert = page.getByRole("alert").filter({
        has: page.getByRole("button", { name: scenario.retryName, exact: true }),
      });
      await expect(retryAlert).toBeVisible();
      await expect(retryAlert).toContainText(message);
      expect(commands).toHaveLength(2);
      expect(commands[1]).toBe(commands[0]);
      expect(new URLSearchParams(commands[0]).get("expectedVersion")).toBe(String(scenario.print.version));
      expect((await recoveryApi.listPrints()).find((item) => item.id === scenario.print.id)?.version).toBe(
        scenario.print.version + (failure === "unreadable" ? 1 : 0),
      );
      await expectUncertainGuard(page, operation, scenario.print.id);
      await readBothCollections(page);
      await expectUncertainGuard(page, operation, scenario.print.id);
      if (operation === "edit") {
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(page.getByLabel("Required filament (g)")).toHaveValue("91");
        await expectUncertainGuard(page, operation, scenario.print.id);
      }

      await page.getByRole("button", { name: scenario.retryName }).click();
      await expect(page.getByRole("button", { name: scenario.retryName })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Add a print", exact: true })).toBeEnabled();
      expect(commands).toEqual([commands[0], commands[0], commands[0]]);
      await expectSavedState(recoveryApi, scenario, operation);
    });
  }
}

for (const outcome of ["edit retry wins", "cancellation retry wins", "same-ID recalculation wins"] as const) {
  test(`uncertain recovery resolves before a detached original arrives when ${outcome}`, async ({
    page,
    context,
    recoveryApi,
  }) => {
    const operation = outcome === "edit retry wins" ? "edit" : "cancellation";
    const scenario = await prepareRecovery(page, recoveryApi, operation);
    const releaseOriginal = deferred();
    const commands: string[] = [];
    let originalSent = false;
    let delayedOriginal: Promise<APIResponse> | undefined;
    try {
      await page.route(scenario.endpoint, async (route) => {
        const command = route.request().postData() ?? "";
        commands.push(command);
        if (commands.length === 1) {
          const url = route.request().url();
          // Model a command queued at the transport boundary after its browser connection fails.
          delayedOriginal = releaseOriginal.promise.then(() => {
            originalSent = true;
            return context.request.post(url, {
              data: command,
              headers: {
                Origin: new URL(url).origin,
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
              },
            });
          });
          await route.abort("failed");
        } else {
          await route.continue();
        }
      });

      await page.getByRole("button", { name: scenario.submitName, exact: true }).click();
      await expectUncertainGuard(page, operation, scenario.print.id);
      expect(delayedOriginal).toBeDefined();
      expect(originalSent).toBe(false);
      await readBothCollections(page);
      await expectUncertainGuard(page, operation, scenario.print.id);
      if (outcome === "same-ID recalculation wins") {
        await recoveryApi.updatePrint(scenario.print.id, scenario.print.version, {
          name: scenario.print.name,
          material: scenario.print.material,
          colour: scenario.print.colour,
          requiredGrams: 90,
        });
        await readBothCollections(page);
        await expectUncertainGuard(page, operation, scenario.print.id);
      }

      await page.getByRole("button", { name: scenario.retryName }).click();
      await expect(page.getByRole("button", { name: scenario.retryName })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Add a print", exact: true })).toBeEnabled();
      expect(commands).toHaveLength(2);
      expect(commands[1]).toBe(commands[0]);
      const captured = new URLSearchParams(commands[0]);
      expect(captured.get("expectedVersion")).toBe(String(scenario.print.version));
      if (operation === "cancellation") expect(captured.get("reservationId")).toBe(scenario.reservationId);
      else expect(captured.get("requiredGrams")).toBe("90");
      expect(originalSent).toBe(false);
      if (outcome === "same-ID recalculation wins") {
        await expect(printRecord(page, scenario.print.id).getByRole("status")).toContainText(
          "The print changed while the release was being resolved.",
        );
      }
      const expectedOperation = outcome === "cancellation retry wins" ? "cancellation" : "edit";
      await expectSavedState(recoveryApi, scenario, expectedOperation);

      releaseOriginal.resolve();
      if (!delayedOriginal) throw new Error("The detached original command was not captured.");
      const late = await delayedOriginal;
      expect(originalSent).toBe(true);
      if (outcome === "cancellation retry wins") {
        expect(late.status()).toBe(200);
        expect(await late.json()).toMatchObject({ disposition: "already_released" });
      } else {
        expect(late.status()).toBe(409);
        expect(await late.json()).toMatchObject({ error: { code: "edit_conflict" } });
      }
      await expectSavedState(recoveryApi, scenario, expectedOperation);
    } finally {
      releaseOriginal.resolve();
      if (delayedOriginal) await (await delayedOriginal).dispose();
    }
  });
}
