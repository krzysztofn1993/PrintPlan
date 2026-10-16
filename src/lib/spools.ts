import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import type { SpoolWriteInput } from "@/lib/spool-validation";

export const SPOOL_QUERY_BATCH_SIZE = 1_000;

type SpoolRow = Pick<
  Tables<"spool_inventory">,
  "id" | "material" | "colour" | "created_at" | "updated_at" | "recorded_grams" | "reserved_grams" | "available_grams"
>;
type SpoolClient = SupabaseClient<Database>;

const SPOOL_READ_COLUMNS =
  "id, material, colour, created_at, updated_at, recorded_grams, reserved_grams, available_grams";

export interface SpoolDto {
  id: string;
  material: string;
  colour: string;
  createdAt: string;
  updatedAt: string;
  recordedGrams: number;
  reservedGrams: number;
  availableGrams: number;
}

export type SpoolDatabaseResult<T> =
  { ok: true; value: T } | { ok: false; reason: "database_error"; error: unknown; status?: number };

export type SpoolMutationFailure =
  | { ok: false; reason: "database_error"; error: unknown; status?: number }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "reserved_spool_change_requires_cancellation" }
  | { ok: false; reason: "stock_below_reservations" };
export type SpoolMutationResult<T> = { ok: true; value: T } | SpoolMutationFailure;
export type SpoolDeleteResult<T> = SpoolDatabaseResult<T> | { ok: false; reason: "not_found" };

export interface CancelledReservation {
  reservationId: string;
  printId: string;
  printName: string | null;
  material: string;
  colour: string;
  releasedGrams: number;
}

export function toSpoolDto(row: SpoolRow): SpoolDto {
  return {
    id: row.id,
    material: row.material,
    colour: row.colour,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recordedGrams: row.recorded_grams,
    reservedGrams: row.reserved_grams,
    availableGrams: row.available_grams,
  };
}

function rpcFailure(error: unknown, status?: number): SpoolMutationFailure {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (message.includes("not_found")) return { ok: false, reason: "not_found" };
  if (message.includes("reserved_spool_change_requires_cancellation")) {
    return { ok: false, reason: "reserved_spool_change_requires_cancellation" };
  }
  if (message.includes("stock_below_reservations")) return { ok: false, reason: "stock_below_reservations" };
  return { ok: false, reason: "database_error", error, status };
}

async function readSpoolPage(client: SpoolClient, ownerId: string, from: number, to: number) {
  const result = await client
    .from("spool_inventory")
    .select(SPOOL_READ_COLUMNS)
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);
  return { data: result.data, error: result.error, status: result.status };
}

async function readSpool(client: SpoolClient, ownerId: string, id: string): Promise<SpoolDatabaseResult<SpoolDto>> {
  try {
    const { data, error, status } = await client
      .from("spool_inventory")
      .select(SPOOL_READ_COLUMNS)
      .eq("user_id", ownerId)
      .eq("id", id)
      .maybeSingle();
    if (error) return { ok: false, reason: "database_error", error, status };
    if (!data)
      return { ok: false, reason: "database_error", error: new Error("The spool RPC receipt has no readable spool.") };
    return { ok: true, value: toSpoolDto(data) };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function listSpools(client: SpoolClient, ownerId: string): Promise<SpoolDatabaseResult<SpoolDto[]>> {
  const spools: SpoolDto[] = [];
  let from = 0;
  for (;;) {
    let result: Awaited<ReturnType<typeof readSpoolPage>>;
    try {
      result = await readSpoolPage(client, ownerId, from, from + SPOOL_QUERY_BATCH_SIZE - 1);
    } catch (error) {
      return { ok: false, reason: "database_error", error };
    }
    if (result.error) return { ok: false, reason: "database_error", error: result.error, status: result.status };
    if (!result.data || result.data.length > SPOOL_QUERY_BATCH_SIZE)
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The spool list query returned an invalid page."),
      };
    spools.push(...result.data.map(toSpoolDto));
    if (result.data.length < SPOOL_QUERY_BATCH_SIZE) return { ok: true, value: spools };
    from += SPOOL_QUERY_BATCH_SIZE;
  }
}

export async function createSpool(
  client: SpoolClient,
  ownerId: string,
  input: SpoolWriteInput,
): Promise<SpoolDatabaseResult<SpoolDto>> {
  try {
    const { data, error, status } = await client.rpc("create_spool", {
      p_material: input.material,
      p_colour: input.colour,
      p_recorded_grams: input.recordedGrams,
    });
    if (error) return { ok: false, reason: "database_error", error, status };
    const id = data && typeof data === "object" && !Array.isArray(data) && typeof data.id === "string" ? data.id : "";
    if (!id)
      return { ok: false, reason: "database_error", error: new Error("The spool RPC did not return its created row.") };
    return await readSpool(client, ownerId, id);
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function updateSpool(
  client: SpoolClient,
  ownerId: string,
  id: string,
  input: SpoolWriteInput,
): Promise<SpoolMutationResult<SpoolDto>> {
  try {
    const { data, error, status } = await client.rpc("update_spool", {
      p_spool_id: id,
      p_material: input.material,
      p_colour: input.colour,
      p_recorded_grams: input.recordedGrams,
    });
    if (error) return rpcFailure(error, status);
    const returnedId =
      data && typeof data === "object" && !Array.isArray(data) && typeof data.id === "string" ? data.id : "";
    if (!returnedId)
      return { ok: false, reason: "database_error", error: new Error("The spool RPC did not return its updated row.") };
    return await readSpool(client, ownerId, returnedId);
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function deleteSpool(
  client: SpoolClient,
  _ownerId: string,
  id: string,
): Promise<SpoolDeleteResult<{ id: string; cancelledReservations: CancelledReservation[] }>> {
  try {
    const { data, error, status } = await client.rpc("delete_spool", { p_spool_id: id });
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
        error: new Error("The spool delete RPC returned an invalid receipt."),
      };
    const receipt = data as unknown as { id: string; cancelledReservations?: CancelledReservation[] };
    return { ok: true, value: { id: receipt.id, cancelledReservations: receipt.cancelledReservations ?? [] } };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}
