import { isValidSpoolId } from "@/lib/spool-validation";
import type { SpoolDto } from "@/lib/spools";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSpoolDto(value: unknown): SpoolDto | undefined {
  if (!isRecord(value)) return undefined;
  const { id, material, colour, createdAt, updatedAt, recordedGrams, reservedGrams, availableGrams } = value;
  if (
    typeof id !== "string" ||
    !isValidSpoolId(id) ||
    typeof material !== "string" ||
    typeof colour !== "string" ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string" ||
    typeof recordedGrams !== "number" ||
    !Number.isSafeInteger(recordedGrams) ||
    typeof reservedGrams !== "number" ||
    !Number.isSafeInteger(reservedGrams) ||
    typeof availableGrams !== "number" ||
    !Number.isSafeInteger(availableGrams) ||
    recordedGrams < 0 ||
    reservedGrams < 0 ||
    availableGrams < 0 ||
    recordedGrams - reservedGrams !== availableGrams
  )
    return undefined;
  return {
    id,
    material,
    colour,
    createdAt,
    updatedAt,
    recordedGrams,
    reservedGrams,
    availableGrams,
  };
}
