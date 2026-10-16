import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import type { PrintWriteInput } from "@/lib/print-validation";
import { listSpools, type SpoolDto } from "./spools.ts";

export const PRINT_QUERY_BATCH_SIZE = 1_000;
type PrintRow = Pick<
  Tables<"planned_prints">,
  | "id"
  | "name"
  | "material"
  | "colour"
  | "required_grams"
  | "version"
  | "created_at"
  | "updated_at"
  | "reservation_id"
  | "reservation_spool_id"
  | "reserved_grams"
>;
type PrintClient = SupabaseClient<Database>;
const PRINT_READ_COLUMNS =
  "id, name, material, colour, required_grams, version, created_at, updated_at, reservation_id, reservation_spool_id, reserved_grams";

export interface PrintDto {
  id: string;
  name: string | null;
  material: string;
  colour: string;
  requiredGrams: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  reservation: null | { id: string; spoolId: string; reservedGrams: number };
}

export interface PrintDatabaseFailure {
  ok: false;
  reason: "database_error";
  error: unknown;
  status?: number;
}
export type PrintMutationFailure =
  | PrintDatabaseFailure
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict" }
  | { ok: false; reason: "reserved_print_edit_requires_cancellation" };
export type PrintDatabaseResult<T> = { ok: true; value: T } | PrintDatabaseFailure;
export type PrintBusinessConflict = "conflict" | "reserved_print_edit_requires_cancellation";
export type PrintMutationResult<T> = { ok: true; value: T } | PrintMutationFailure;
export type PrintDeleteResult<T> = PrintDatabaseResult<T> | { ok: false; reason: "not_found" };

export interface CancelledPrintReservation {
  reservationId: string;
  printId: string;
  printName: string | null;
  material: string;
  colour: string;
  releasedGrams: number;
}

export function toPrintDto(row: PrintRow): PrintDto {
  const hasReservation = row.reservation_id !== null;
  if (hasReservation && (!row.reservation_spool_id || row.reserved_grams === null)) {
    throw new Error("The planned print view returned incomplete reservation state.");
  }
  return {
    id: row.id,
    name: row.name,
    material: row.material,
    colour: row.colour,
    requiredGrams: row.required_grams,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reservation:
      hasReservation && row.reservation_id && row.reservation_spool_id && row.reserved_grams !== null
        ? { id: row.reservation_id, spoolId: row.reservation_spool_id, reservedGrams: row.reserved_grams }
        : null,
  };
}

function rpcFailure(error: unknown, status?: number): PrintMutationFailure {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (message.includes("not_found")) return { ok: false, reason: "not_found" };
  if (message.includes("edit_conflict")) return { ok: false, reason: "conflict" };
  if (message.includes("reserved_print_edit_requires_cancellation"))
    return { ok: false, reason: "reserved_print_edit_requires_cancellation" };
  return { ok: false, reason: "database_error", error, status };
}

async function readPrintPage(client: PrintClient, ownerId: string, from: number, to: number) {
  const result = await client
    .from("planned_prints")
    .select(PRINT_READ_COLUMNS)
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);
  return { data: result.data, error: result.error, status: result.status };
}

async function readPrint(client: PrintClient, ownerId: string, id: string): Promise<PrintDatabaseResult<PrintDto>> {
  try {
    const { data, error, status } = await client
      .from("planned_prints")
      .select(PRINT_READ_COLUMNS)
      .eq("user_id", ownerId)
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, reason: "database_error", error, status };
    if (!data)
      return { ok: false, reason: "database_error", error: new Error("The print RPC receipt has no readable print.") };
    return { ok: true, value: toPrintDto(data) };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function listPrints(client: PrintClient, ownerId: string): Promise<PrintDatabaseResult<PrintDto[]>> {
  const prints: PrintDto[] = [];
  let from = 0;
  for (;;) {
    let result: Awaited<ReturnType<typeof readPrintPage>>;
    try {
      result = await readPrintPage(client, ownerId, from, from + PRINT_QUERY_BATCH_SIZE - 1);
    } catch (error) {
      return { ok: false, reason: "database_error", error };
    }
    if (result.error) return { ok: false, reason: "database_error", error: result.error, status: result.status };
    if (!result.data || result.data.length > PRINT_QUERY_BATCH_SIZE)
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The print list query returned an invalid page."),
      };
    try {
      prints.push(...result.data.map(toPrintDto));
    } catch (error) {
      return { ok: false, reason: "database_error", error };
    }
    if (result.data.length < PRINT_QUERY_BATCH_SIZE) return { ok: true, value: prints };
    from += PRINT_QUERY_BATCH_SIZE;
  }
}

export async function createPrint(
  client: PrintClient,
  ownerId: string,
  input: PrintWriteInput,
): Promise<PrintDatabaseResult<PrintDto>> {
  try {
    const { data, error, status } = await client.rpc("create_print", {
      p_name: input.name,
      p_material: input.material,
      p_colour: input.colour,
      p_required_grams: input.requiredGrams,
    });
    if (error) return { ok: false, reason: "database_error", error, status };
    const id = data && typeof data === "object" && !Array.isArray(data) && typeof data.id === "string" ? data.id : "";
    if (!id)
      return { ok: false, reason: "database_error", error: new Error("The print RPC did not return its created row.") };
    return await readPrint(client, ownerId, id);
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function updatePrint(
  client: PrintClient,
  ownerId: string,
  id: string,
  expectedVersion: number,
  input: PrintWriteInput,
): Promise<PrintMutationResult<PrintDto>> {
  try {
    const { data, error, status } = await client.rpc("update_print", {
      p_print_id: id,
      p_expected_version: expectedVersion,
      p_name: input.name,
      p_material: input.material,
      p_colour: input.colour,
      p_required_grams: input.requiredGrams,
    });
    if (error) return rpcFailure(error, status);
    const returnedId =
      data && typeof data === "object" && !Array.isArray(data) && typeof data.id === "string" ? data.id : "";
    if (!returnedId)
      return { ok: false, reason: "database_error", error: new Error("The print RPC did not return its updated row.") };
    return await readPrint(client, ownerId, returnedId);
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function deletePrint(
  client: PrintClient,
  _ownerId: string,
  id: string,
): Promise<
  PrintDeleteResult<{
    id: string;
    cancelledReservations: CancelledPrintReservation[];
    releasedReservationId: string | null;
    releasedGrams: number | null;
    spool: SpoolDto | null;
  }>
> {
  try {
    const { data, error, status } = await client.rpc("delete_print", { p_print_id: id });
    if (error) {
      const message = typeof error.message === "string" ? error.message : "";
      return message.includes("not_found")
        ? { ok: false, reason: "not_found" }
        : { ok: false, reason: "database_error", error, status };
    }
    if (!data || typeof data !== "object" || !("id" in data))
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The print delete RPC returned an invalid receipt."),
      };
    const receipt = data as unknown as {
      id: string;
      cancelledReservations?: CancelledPrintReservation[];
      releasedReservationId?: string | null;
      releasedGrams?: number | null;
      spool?: { id?: string } | null;
    };
    let spool: SpoolDto | null = null;
    if (receipt.spool?.id) {
      const inventory = await listSpools(client, _ownerId);
      if (!inventory.ok) return inventory;
      spool = inventory.value.find((item) => item.id === receipt.spool?.id) ?? null;
    }
    return {
      ok: true,
      value: {
        id: receipt.id,
        cancelledReservations: receipt.cancelledReservations ?? [],
        releasedReservationId: receipt.releasedReservationId ?? null,
        releasedGrams: receipt.releasedGrams ?? null,
        spool,
      },
    };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}
