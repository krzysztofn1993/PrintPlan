import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database";
import type { PrintWriteInput } from "@/lib/print-validation";

export const PRINT_QUERY_BATCH_SIZE = 1_000;

type PrintRow = Tables<"prints">;
type PrintReadRow = Pick<
  PrintRow,
  "id" | "name" | "material" | "colour" | "required_grams" | "version" | "created_at" | "updated_at"
>;
type PrintClient = SupabaseClient<Database>;

const PRINT_READ_COLUMNS = "id, name, material, colour, required_grams, version, created_at, updated_at";

export interface PrintDto {
  id: string;
  name: string | null;
  material: string;
  colour: string;
  requiredGrams: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PrintDatabaseFailure {
  ok: false;
  reason: "database_error";
  error: unknown;
  status?: number;
}
export type PrintDatabaseResult<T> = { ok: true; value: T } | PrintDatabaseFailure;

export type PrintMutationResult<T> =
  | { ok: true; value: T }
  | PrintDatabaseFailure
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict" };

export function toPrintDto(row: PrintReadRow): PrintDto {
  return {
    id: row.id,
    name: row.name,
    material: row.material,
    colour: row.colour,
    requiredGrams: row.required_grams,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readPrintPage(
  client: PrintClient,
  ownerId: string,
  from: number,
  to: number,
): Promise<{ data: PrintReadRow[] | null; error: unknown; status: number }> {
  const result = await client
    .from("prints")
    .select(PRINT_READ_COLUMNS)
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);

  return { data: result.data, error: result.error, status: result.status };
}

export async function listPrints(client: PrintClient, ownerId: string): Promise<PrintDatabaseResult<PrintDto[]>> {
  const prints: PrintDto[] = [];
  let from = 0;

  for (;;) {
    let result: { data: PrintReadRow[] | null; error: unknown; status: number };
    try {
      result = await readPrintPage(client, ownerId, from, from + PRINT_QUERY_BATCH_SIZE - 1);
    } catch (error) {
      return { ok: false, reason: "database_error", error };
    }
    if (result.error) return { ok: false, reason: "database_error", error: result.error, status: result.status };
    if (!result.data || result.data.length > PRINT_QUERY_BATCH_SIZE) {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The print list query returned an invalid page."),
      };
    }

    prints.push(...result.data.map(toPrintDto));
    if (result.data.length < PRINT_QUERY_BATCH_SIZE) return { ok: true, value: prints };
    // Bounded ordered pages are complete for the observed request; they are not a cross-request snapshot.
    from += PRINT_QUERY_BATCH_SIZE;
  }
}

export async function createPrint(
  client: PrintClient,
  ownerId: string,
  input: PrintWriteInput,
): Promise<PrintDatabaseResult<PrintDto>> {
  try {
    const { data, error, status } = await client
      .from("prints")
      .insert({
        user_id: ownerId,
        name: input.name,
        material: input.material,
        colour: input.colour,
        required_grams: input.requiredGrams,
      })
      .select(PRINT_READ_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, reason: "database_error", error, status };
    if (!data) {
      return {
        ok: false,
        reason: "database_error",
        error: new Error("The print insert did not return its created row."),
      };
    }
    return { ok: true, value: toPrintDto(data) };
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
    const { data, error, status } = await client
      .from("prints")
      .update({
        name: input.name,
        material: input.material,
        colour: input.colour,
        required_grams: input.requiredGrams,
      })
      .eq("id", id)
      .eq("user_id", ownerId)
      .eq("version", expectedVersion)
      .select(PRINT_READ_COLUMNS)
      .maybeSingle();

    if (error) return { ok: false, reason: "database_error", error, status };
    if (data) return { ok: true, value: toPrintDto(data) };

    let probe: { data: { id: string } | null; error: unknown; status: number };
    try {
      probe = await client.from("prints").select("id").eq("id", id).eq("user_id", ownerId).maybeSingle();
    } catch (probeError) {
      return { ok: false, reason: "database_error", error: probeError };
    }
    if (probe.error) return { ok: false, reason: "database_error", error: probe.error, status: probe.status };
    return probe.data ? { ok: false, reason: "conflict" } : { ok: false, reason: "not_found" };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}

export async function deletePrint(
  client: PrintClient,
  ownerId: string,
  id: string,
): Promise<PrintDatabaseResult<{ id: string }> | { ok: false; reason: "not_found" }> {
  try {
    const { data, error, status } = await client
      .from("prints")
      .delete()
      .eq("id", id)
      .eq("user_id", ownerId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, reason: "database_error", error, status };
    if (!data?.id) return { ok: false, reason: "not_found" };
    return { ok: true, value: { id: data.id } };
  } catch (error) {
    return { ok: false, reason: "database_error", error };
  }
}
