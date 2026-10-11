import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import type { SpoolWriteInput } from "@/lib/spool-validation";

export const SPOOL_QUERY_BATCH_SIZE = 1_000;

type SpoolRow = Tables<"spools">;
type SpoolReadRow = Pick<SpoolRow, "id" | "material" | "colour" | "created_at" | "updated_at" | "recorded_grams">;
type SpoolClient = SupabaseClient<Database>;

const SPOOL_READ_COLUMNS = "id, material, colour, created_at, updated_at, recorded_grams";

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

export type SpoolMutationResult<T> = SpoolDatabaseResult<T> | { ok: false; reason: "not_found" };

export function toSpoolDto(row: SpoolReadRow): SpoolDto {
  return {
    id: row.id,
    material: row.material,
    colour: row.colour,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recordedGrams: row.recorded_grams,
    reservedGrams: 0,
    availableGrams: row.recorded_grams,
  };
}

async function readSpoolPage(
  client: SpoolClient,
  ownerId: string,
  from: number,
  to: number,
): Promise<{ data: SpoolReadRow[] | null; error: unknown; status: number }> {
  const result = await client
    .from("spools")
    .select(SPOOL_READ_COLUMNS)
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);

  return { data: result.data, error: result.error, status: result.status };
}

export async function listSpools(client: SpoolClient, ownerId: string): Promise<SpoolDatabaseResult<SpoolDto[]>> {
  const spools: SpoolDto[] = [];
  let from = 0;

  for (;;) {
    let result: { data: SpoolReadRow[] | null; error: unknown; status: number };
    try {
      result = await readSpoolPage(client, ownerId, from, from + SPOOL_QUERY_BATCH_SIZE - 1);
    } catch (error) {
      return { ok: false, reason: "database_error", error };
    }
    if (result.error) return { ok: false, reason: "database_error", error: result.error, status: result.status };
    if (!result.data || result.data.length > SPOOL_QUERY_BATCH_SIZE) {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The spool list query returned an invalid page."),
      };
    }

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
    const { data, error, status } = await client
      .from("spools")
      .insert({
        user_id: ownerId,
        material: input.material,
        colour: input.colour,
        recorded_grams: input.recordedGrams,
      })
      .select(SPOOL_READ_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, reason: "database_error", error, status };
    if (!data) {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The spool insert did not return its created row."),
      };
    }
    return { ok: true, value: toSpoolDto(data) };
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
    const { data, error, status } = await client
      .from("spools")
      .update({ material: input.material, colour: input.colour, recorded_grams: input.recordedGrams })
      .eq("id", id)
      .eq("user_id", ownerId)
      .select(SPOOL_READ_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, reason: "database_error", error, status };
    if (!data) return { ok: false, reason: "not_found" };
    return { ok: true, value: toSpoolDto(data) };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function deleteSpool(
  client: SpoolClient,
  ownerId: string,
  id: string,
): Promise<SpoolMutationResult<{ id: string }>> {
  try {
    const { data, error, status } = await client
      .from("spools")
      .delete()
      .eq("id", id)
      .eq("user_id", ownerId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, reason: "database_error", error, status };
    if (!data) return { ok: false, reason: "not_found" };
    return { ok: true, value: { id: data.id } };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}
