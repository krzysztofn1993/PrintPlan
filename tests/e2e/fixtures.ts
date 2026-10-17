import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { expect, test as base } from "@playwright/test";
import type { APIResponse, BrowserContext, Response as BrowserResponse } from "@playwright/test";
import type { SettlementReceipt } from "../../src/lib/settlement-dto";
import { FIXTURE_LEDGER_FILE, readCredentials, type LocalTestAccount } from "./helpers/local-account";

export interface SpoolRecord {
  id: string;
  material: string;
  colour: string;
  recordedGrams: number;
  reservedGrams: number;
  availableGrams: number;
}

export interface PrintRecord {
  id: string;
  name: string | null;
  material: string;
  colour: string;
  requiredGrams: number;
  version: number;
  reservation?: { id: string; spoolId: string; reservedGrams: number } | null;
  settlement: { id: string; settledAt: string; actualGrams: number } | null;
}

export interface SettlementCommand {
  requestId: string;
  expectedVersion: number;
  reservationId: string;
  actualGrams: number;
}

export interface SettlementCommandResult {
  settlement: SettlementReceipt;
  replayed: boolean;
}

export interface ReservationPreviewRecord {
  printId: string;
  expectedVersion: number;
  marginPercent: number;
  reservationGrams: number;
  suggestedSpoolId: string | null;
  eligibleSpools: SpoolRecord[];
}

interface FixtureLedger {
  accountId: string;
  spools: string[];
  prints: string[];
}

export interface SpoolInput {
  material: string;
  colour: string;
  recordedGrams: number;
}

export interface PrintInput {
  name: string | null;
  material: string;
  colour: string;
  requiredGrams: number;
}

export interface RecoveryApi {
  label(prefix: string): string;
  createSpool(input: SpoolInput): Promise<SpoolRecord>;
  listSpools(): Promise<SpoolRecord[]>;
  updateSpool(id: string, input: SpoolInput): Promise<SpoolRecord>;
  trackSpool(id: string): Promise<void>;
  deleteSpool(id: string): Promise<void>;
  createPrint(input: PrintInput): Promise<PrintRecord>;
  listPrints(): Promise<PrintRecord[]>;
  trackPrint(id: string): Promise<void>;
  updatePrint(id: string, expectedVersion: number, input: PrintInput): Promise<PrintRecord>;
  deletePrint(id: string): Promise<void>;
  previewReservation(printId: string): Promise<ReservationPreviewRecord>;
  reserveMaterial(print: PrintRecord, spoolId: string, selectionMode: "best_fit" | "manual"): Promise<string>;
  releaseMaterial(printId: string, reservationId: string): Promise<void>;
  settlePrint(printId: string, command: SettlementCommand): Promise<SettlementCommandResult>;
  readPrintSettlement(printId: string): Promise<SettlementReceipt | null>;
}

interface E2EFixtures {
  recoveryApi: RecoveryApi;
  context: BrowserContext;
}

async function readLedger(accountId: string): Promise<FixtureLedger> {
  try {
    const ledger = JSON.parse(await readFile(FIXTURE_LEDGER_FILE, "utf8")) as FixtureLedger;
    expect(ledger.accountId).toBe(accountId);
    expect(Array.isArray(ledger.spools)).toBe(true);
    expect(Array.isArray(ledger.prints)).toBe(true);
    return ledger;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { accountId, spools: [], prints: [] };
    }
    throw new Error("The private browser fixture ledger could not be read.", { cause: error });
  }
}

async function writeLedger(ledger: FixtureLedger): Promise<void> {
  await writeFile(FIXTURE_LEDGER_FILE, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
}

async function readJson<T>(response: APIResponse, status: number): Promise<T> {
  expect(response.status()).toBe(status);
  return (await response.json()) as T;
}

async function authenticateFreshContext(
  context: BrowserContext,
  baseURL: string,
  account: LocalTestAccount,
): Promise<void> {
  const response = await context.request.post(`${baseURL}/api/auth/signin`, {
    form: { email: account.email, password: account.password },
    headers: { Origin: new URL(baseURL).origin },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(302);
  expect((await context.cookies()).some(({ name }) => name.includes("auth-token"))).toBe(true);
}

export const test = base.extend<E2EFixtures>({
  context: async ({ browser, baseURL }, provide) => {
    if (!baseURL) throw new Error("The E2E base URL is missing.");
    const account = await readCredentials();
    const context = await browser.newContext();
    try {
      await authenticateFreshContext(context, baseURL, account);
      await provide(context);
    } finally {
      await context.close();
    }
  },

  recoveryApi: async ({ context, page, baseURL }, provide) => {
    if (!baseURL) throw new Error("The E2E base URL is missing.");
    const account = await readCredentials();
    let ledger = await readLedger(account.userId);
    const endpoint = (path: string) => `${baseURL}${path}`;

    const listSpools = async (): Promise<SpoolRecord[]> => {
      const payload = await readJson<{ spools: SpoolRecord[] }>(
        await context.request.get(endpoint("/api/spools")),
        200,
      );
      expect(Array.isArray(payload.spools)).toBe(true);
      return payload.spools;
    };

    const listPrints = async (): Promise<PrintRecord[]> => {
      const payload = await readJson<{ prints: PrintRecord[] }>(
        await context.request.get(endpoint("/api/prints")),
        200,
      );
      expect(Array.isArray(payload.prints)).toBe(true);
      return payload.prints;
    };

    const trackSpool = async (id: string) => {
      if (!ledger.spools.includes(id)) ledger.spools.push(id);
      await writeLedger(ledger);
    };

    const trackPrint = async (id: string) => {
      if (!ledger.prints.includes(id)) ledger.prints.push(id);
      await writeLedger(ledger);
    };

    const browserRecordTracking: Promise<void>[] = [];
    page.on("response", (response: BrowserResponse) => {
      const request = response.request();
      const pathname = new URL(response.url()).pathname;
      if (request.method() !== "POST" || response.status() !== 201) return;

      if (pathname === "/api/spools") {
        browserRecordTracking.push(
          response
            .json()
            .then((payload: { spool?: { id?: string } }) =>
              typeof payload.spool?.id === "string" ? trackSpool(payload.spool.id) : undefined,
            )
            .catch(() => undefined),
        );
      } else if (pathname === "/api/prints") {
        browserRecordTracking.push(
          response
            .json()
            .then((payload: { print?: { id?: string } }) =>
              typeof payload.print?.id === "string" ? trackPrint(payload.print.id) : undefined,
            )
            .catch(() => undefined),
        );
      }
    });

    const api: RecoveryApi = {
      label: (prefix) => `${prefix}-${randomUUID()}`,

      async createSpool(input) {
        const payload = await readJson<{ spool: SpoolRecord }>(
          await context.request.post(endpoint("/api/spools"), {
            form: { ...input },
            headers: { Origin: new URL(baseURL).origin },
          }),
          201,
        );
        expect(payload.spool.id).toBeTruthy();
        await trackSpool(payload.spool.id);
        return payload.spool;
      },

      listSpools,
      trackSpool,

      async updateSpool(id, input) {
        const payload = await readJson<{ spool: SpoolRecord }>(
          await context.request.post(endpoint(`/api/spools/${id}/update`), {
            form: { ...input },
            headers: { Origin: new URL(baseURL).origin },
          }),
          200,
        );
        expect(payload.spool.id).toBe(id);
        return payload.spool;
      },

      async deleteSpool(id) {
        const response = await context.request.post(endpoint(`/api/spools/${id}/delete`), {
          form: {},
          headers: { Origin: new URL(baseURL).origin },
        });
        if (response.status() === 404) {
          expect((await listSpools()).some((spool) => spool.id === id)).toBe(false);
          return;
        }
        const payload = await readJson<{ id: string }>(response, 200);
        expect(payload.id).toBe(id);
      },

      async createPrint(input) {
        const payload = await readJson<{ print: PrintRecord }>(
          await context.request.post(endpoint("/api/prints"), {
            form: { ...input, name: input.name ?? "" },
            headers: { Origin: new URL(baseURL).origin },
          }),
          201,
        );
        expect(payload.print.id).toBeTruthy();
        await trackPrint(payload.print.id);
        return payload.print;
      },

      listPrints,
      trackPrint,

      async updatePrint(id, expectedVersion, input) {
        const payload = await readJson<{ print: PrintRecord }>(
          await context.request.post(endpoint(`/api/prints/${id}/update`), {
            form: { ...input, name: input.name ?? "", expectedVersion },
            headers: { Origin: new URL(baseURL).origin },
          }),
          200,
        );
        expect(payload.print.id).toBe(id);
        return payload.print;
      },

      async deletePrint(id) {
        const response = await context.request.post(endpoint(`/api/prints/${id}/delete`), {
          form: {},
          headers: { Origin: new URL(baseURL).origin },
        });
        if (response.status() === 404) {
          expect((await listPrints()).some((print) => print.id === id)).toBe(false);
          return;
        }
        const payload = await readJson<{ id: string }>(response, 200);
        expect(payload.id).toBe(id);
      },

      async previewReservation(printId) {
        return await readJson<ReservationPreviewRecord>(
          await context.request.get(endpoint(`/api/prints/${printId}/reservation`)),
          200,
        );
      },

      async reserveMaterial(print, spoolId, selectionMode) {
        const preview = await api.previewReservation(print.id);
        const payload = await readJson<{ reservationId: string }>(
          await context.request.post(endpoint(`/api/prints/${print.id}/reservation/reserve`), {
            form: {
              requestId: randomUUID(),
              expectedVersion: String(print.version),
              expectedReservationGrams: String(preview.reservationGrams),
              spoolId,
              selectionMode,
            },
            headers: { Origin: new URL(baseURL).origin },
          }),
          200,
        );
        return payload.reservationId;
      },

      async releaseMaterial(printId, reservationId) {
        await readJson<{ reservationId: string }>(
          await context.request.post(endpoint(`/api/prints/${printId}/reservation/cancel`), {
            form: { reservationId },
            headers: { Origin: new URL(baseURL).origin },
          }),
          200,
        );
      },

      async settlePrint(printId, command) {
        const payload = await readJson<SettlementCommandResult>(
          await context.request.post(endpoint(`/api/prints/${printId}/settlement`), {
            form: {
              requestId: command.requestId,
              expectedVersion: String(command.expectedVersion),
              reservationId: command.reservationId,
              actualGrams: String(command.actualGrams),
            },
            headers: { Origin: new URL(baseURL).origin },
          }),
          200,
        );
        expect(payload.settlement.printId).toBe(printId);
        expect(payload.settlement.requestId).toBe(command.requestId);
        return payload;
      },

      async readPrintSettlement(printId) {
        const payload = await readJson<{ settlement: SettlementReceipt | null }>(
          await context.request.get(endpoint(`/api/prints/${printId}/settlement`)),
          200,
        );
        return payload.settlement;
      },
    };

    try {
      await provide(api);
    } finally {
      await Promise.all(browserRecordTracking);
      for (const id of ledger.spools) {
        const exists = (await listSpools()).some((spool) => spool.id === id);
        if (exists) await api.deleteSpool(id);
      }
      for (const id of ledger.prints) {
        const exists = (await listPrints()).some((print) => print.id === id);
        if (exists) await api.deletePrint(id);
      }

      const [spools, prints] = await Promise.all([listSpools(), listPrints()]);
      expect(spools.some((spool) => ledger.spools.includes(spool.id))).toBe(false);
      expect(prints.some((print) => ledger.prints.includes(print.id))).toBe(false);
      ledger = { accountId: account.userId, spools: [], prints: [] };
      await writeLedger(ledger);
    }
  },
});

export { expect } from "@playwright/test";
