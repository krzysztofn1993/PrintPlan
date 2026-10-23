import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, Tables } from "@/types/database";
import { listPrints, type PrintDto } from "./prints.ts";
import { MAX_EXPECTED_RESERVATION_GRAMS } from "./reservation-validation.ts";
import { listSpools, toSpoolDto, type SpoolDto } from "./spools.ts";

type Client = SupabaseClient<Database>;
type SpoolViewRow = Tables<"spool_inventory">;

export interface ReservationPreview {
  printId: string;
  expectedVersion: number;
  marginPercent: number;
  reservationGrams: number;
  suggestedSpoolId: string | null;
  eligibleSpools: SpoolDto[];
}

const MAX_RESERVATION_MARGIN_PERCENT = 100;
const MAX_DATABASE_INTEGER = 2_147_483_647;

export type ReservationResult<T> =
  { ok: true; value: T } | { ok: false; reason: "not_found" | "database_error"; error?: unknown; status?: number };
export type ReservationConflictCode =
  | "already_reserved"
  | "edit_conflict"
  | "selection_stale"
  | "reservation_amount_stale"
  | "reservation_preview_required"
  | "insufficient_material"
  | "idempotency_conflict"
  | "reservation_request_completed"
  | "print_settled";
export type ReservationCommandResult<T> =
  | ReservationResult<T>
  | { ok: false; reason: ReservationConflictCode; current?: { print: PrintDto | null; spool: SpoolDto | null } };
type ReservationCommandFailure = Extract<ReservationCommandResult<never>, { ok: false }>;

function asRecord(value: Json): Record<string, Json | undefined> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function rpcError(error: unknown, status?: number): ReservationCommandFailure {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const codes: ReservationConflictCode[] = [
    "already_reserved",
    "edit_conflict",
    "selection_stale",
    "reservation_amount_stale",
    "reservation_preview_required",
    "insufficient_material",
    "idempotency_conflict",
    "reservation_request_completed",
    "print_settled",
  ];
  const code = codes.find((value) => message.includes(value));
  if (code) return { ok: false, reason: code };
  if (message.includes("not_found")) return { ok: false, reason: "not_found" };
  return { ok: false, reason: "database_error", error, status };
}

export async function previewPrintReservation(
  client: Client,
  ownerId: string,
  printId: string,
): Promise<ReservationCommandResult<ReservationPreview>> {
  try {
    const { data, error, status } = await client.rpc("preview_print_reservation", { p_print_id: printId });
    if (error) {
      const failure = rpcError(error, status);
      if (failure.reason === "already_reserved") {
        const [prints, spools] = await Promise.all([listPrints(client, ownerId), listSpools(client, ownerId)]);
        if (!prints.ok) return { ok: false, reason: "database_error", error: prints.error, status: prints.status };
        if (!spools.ok) return { ok: false, reason: "database_error", error: spools.error, status: spools.status };
        const print = prints.value.find((item) => item.id === printId) ?? null;
        const spool = print?.reservation
          ? (spools.value.find((item) => item.id === print.reservation?.spoolId) ?? null)
          : null;
        return { ok: false, reason: "already_reserved", current: { print, spool } };
      }
      return failure;
    }
    const result = data && asRecord(data);
    if (
      !result ||
      typeof result.printId !== "string" ||
      result.printId !== printId ||
      typeof result.expectedVersion !== "number" ||
      !Number.isSafeInteger(result.expectedVersion) ||
      result.expectedVersion < 1 ||
      result.expectedVersion > MAX_DATABASE_INTEGER ||
      typeof result.marginPercent !== "number" ||
      !Number.isInteger(result.marginPercent) ||
      result.marginPercent < 0 ||
      result.marginPercent > MAX_RESERVATION_MARGIN_PERCENT ||
      typeof result.reservationGrams !== "number" ||
      !Number.isSafeInteger(result.reservationGrams) ||
      result.reservationGrams < 1 ||
      result.reservationGrams > MAX_EXPECTED_RESERVATION_GRAMS ||
      !(typeof result.suggestedSpoolId === "string" || result.suggestedSpoolId === null) ||
      !Array.isArray(result.eligibleSpools)
    ) {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The reservation preview returned an invalid receipt."),
      };
    }
    const eligibleSpools = result.eligibleSpools.map((row) => toSpoolDto(row as SpoolViewRow));
    return {
      ok: true,
      value: {
        printId: result.printId,
        expectedVersion: result.expectedVersion,
        marginPercent: result.marginPercent,
        reservationGrams: result.reservationGrams,
        suggestedSpoolId: result.suggestedSpoolId,
        eligibleSpools,
      },
    };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

async function currentPrintAndSpool(
  client: Client,
  ownerId: string,
  printId: string,
  spoolId: string,
): Promise<ReservationResult<{ print: PrintDto | null; spool: SpoolDto | null }>> {
  const [prints, spools] = await Promise.all([listPrints(client, ownerId), listSpools(client, ownerId)]);
  if (!prints.ok) return { ok: false, reason: "database_error", error: prints.error, status: prints.status };
  if (!spools.ok) return { ok: false, reason: "database_error", error: spools.error, status: spools.status };
  return {
    ok: true,
    value: {
      print: prints.value.find((print) => print.id === printId) ?? null,
      spool: spools.value.find((spool) => spool.id === spoolId) ?? null,
    },
  };
}

export interface ReserveReceipt {
  reservationId: string;
  disposition: "active";
  print: PrintDto;
  spool: SpoolDto;
}
export async function reservePrintMaterial(
  client: Client,
  ownerId: string,
  input: {
    printId: string;
    requestId: string;
    expectedVersion: number;
    expectedReservationGrams?: number;
    spoolId: string;
    selectionMode: "best_fit" | "manual";
  },
): Promise<ReservationCommandResult<ReserveReceipt>> {
  try {
    const { data, error, status } = await client.rpc("reserve_print_material", {
      p_request_id: input.requestId,
      p_print_id: input.printId,
      p_expected_version: input.expectedVersion,
      p_expected_reservation_grams: input.expectedReservationGrams ?? null,
      p_spool_id: input.spoolId,
      p_selection_mode: input.selectionMode,
    });
    if (error) return rpcError(error, status);
    const receipt = data && asRecord(data);
    if (!receipt || typeof receipt.reservationId !== "string" || receipt.disposition !== "active") {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The reservation RPC returned an invalid receipt."),
      };
    }
    const currentResult = await currentPrintAndSpool(client, ownerId, input.printId, input.spoolId);
    if (!currentResult.ok) return currentResult;
    const current = currentResult.value;
    const currentReservation = current.print?.reservation;
    if (
      !current.print ||
      !current.spool ||
      currentReservation?.id !== receipt.reservationId ||
      currentReservation.spoolId !== current.spool.id
    ) {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The reservation receipt does not match current state."),
      };
    }
    return {
      ok: true,
      value: {
        reservationId: receipt.reservationId,
        disposition: "active",
        print: current.print,
        spool: current.spool,
      },
    };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export interface ReleaseReceipt {
  reservationId: string;
  disposition: "released" | "already_released";
  print: PrintDto | null;
  spool: SpoolDto | null;
}
export async function releasePrintMaterial(
  client: Client,
  ownerId: string,
  reservationId: string,
  expectedPrintId: string,
  expectedVersion: number,
): Promise<ReservationCommandResult<ReleaseReceipt>> {
  try {
    const { data, error, status } = await client.rpc("release_print_material", {
      p_reservation_id: reservationId,
      p_print_id: expectedPrintId,
      p_expected_version: expectedVersion,
    });
    if (error) return rpcError(error, status);
    const receipt = data && asRecord(data);
    if (
      !receipt ||
      typeof receipt.reservationId !== "string" ||
      (receipt.disposition !== "released" && receipt.disposition !== "already_released")
    ) {
      return { ok: false, reason: "database_error", error: new Error("The release RPC returned an invalid receipt.") };
    }
    const printId =
      typeof receipt.print === "object" &&
      receipt.print !== null &&
      !Array.isArray(receipt.print) &&
      typeof receipt.print.id === "string"
        ? receipt.print.id
        : null;
    const spoolId =
      typeof receipt.spool === "object" &&
      receipt.spool !== null &&
      !Array.isArray(receipt.spool) &&
      typeof receipt.spool.id === "string"
        ? receipt.spool.id
        : null;
    let print: PrintDto | null = null;
    let spool: SpoolDto | null = null;
    const [prints, spools] = await Promise.all([listPrints(client, ownerId), listSpools(client, ownerId)]);
    if (!prints.ok) return { ok: false, reason: "database_error", error: prints.error, status: prints.status };
    if (!spools.ok) return { ok: false, reason: "database_error", error: spools.error, status: spools.status };
    if (printId) print = prints.value.find((item) => item.id === printId) ?? null;
    if (spoolId) spool = spools.value.find((item) => item.id === spoolId) ?? null;
    return {
      ok: true,
      value: { reservationId: receipt.reservationId, disposition: receipt.disposition, print, spool },
    };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}
