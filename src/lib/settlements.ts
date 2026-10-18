import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  readSettlementCommandReceipt,
  readSettlementReceipt,
  type SettlementCommandReceipt,
  type SettlementReceipt,
} from "./settlement-dto.ts";
import type { SettlementCommandInput } from "./settlement-validation.ts";

type SettlementClient = SupabaseClient<Database>;

export type SettlementConflictCode =
  | "already_settled"
  | "idempotency_conflict"
  | "edit_conflict"
  | "reservation_changed"
  | "reservation_required"
  | "print_settled";

export type SettlementFailure =
  | { ok: false; reason: SettlementConflictCode }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid_input" }
  | { ok: false; reason: "database_error"; error: unknown; status?: number };

export type SettlementResult<T> = { ok: true; value: T } | SettlementFailure;

function databaseFailure(error: unknown, status?: number): SettlementFailure {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const conflicts: SettlementConflictCode[] = [
    "already_settled",
    "idempotency_conflict",
    "edit_conflict",
    "reservation_changed",
    "reservation_required",
    "print_settled",
  ];
  const reason = conflicts.find((code) => message.includes(code));
  if (reason) return { ok: false, reason };
  if (message.includes("not_found")) return { ok: false, reason: "not_found" };
  if (message.includes("invalid_settlement_request")) return { ok: false, reason: "invalid_input" };
  return { ok: false, reason: "database_error", error, status };
}

export async function settlePrintConsumption(
  client: SettlementClient,
  printId: string,
  input: SettlementCommandInput,
): Promise<SettlementResult<SettlementCommandReceipt>> {
  try {
    const { data, error, status } = await client.rpc("settle_print_consumption", {
      p_request_id: input.requestId,
      p_print_id: printId,
      p_expected_version: input.expectedVersion,
      p_reservation_id: input.reservationId,
      p_actual_grams: input.actualGrams,
    });
    if (error) return databaseFailure(error, status);
    const receipt = readSettlementCommandReceipt(data);
    if (!receipt) {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The settlement RPC returned an invalid receipt."),
        status,
      };
    }
    if (
      receipt.settlement.printId.toLowerCase() !== printId.toLowerCase() ||
      receipt.settlement.requestId.toLowerCase() !== input.requestId.toLowerCase()
    ) {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The settlement RPC returned a receipt for a different command."),
        status,
      };
    }
    return { ok: true, value: receipt };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function readPrintSettlement(
  client: SettlementClient,
  printId: string,
): Promise<SettlementResult<SettlementReceipt | null>> {
  try {
    const { data, error, status } = await client.rpc("read_print_settlement", { p_print_id: printId });
    if (error) return databaseFailure(error, status);
    if (data === null) return { ok: true, value: null };
    const receipt = readSettlementReceipt(data);
    if (receipt?.printId.toLowerCase() !== printId.toLowerCase()) {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The settlement read RPC returned an invalid receipt."),
        status,
      };
    }
    return { ok: true, value: receipt };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}
