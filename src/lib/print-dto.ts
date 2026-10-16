import type { PrintDto } from "@/lib/prints";
import { MAX_REQUIRED_GRAMS, isValidPrintId } from "@/lib/print-validation";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readPrintDto(value: unknown): PrintDto | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, material, colour, requiredGrams, version, createdAt, updatedAt, reservation } = value;
  if (
    typeof id !== "string" ||
    !isValidPrintId(id) ||
    (name !== null && typeof name !== "string") ||
    typeof material !== "string" ||
    typeof colour !== "string" ||
    typeof requiredGrams !== "number" ||
    !Number.isSafeInteger(requiredGrams) ||
    requiredGrams < 1 ||
    requiredGrams > MAX_REQUIRED_GRAMS ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    version > MAX_REQUIRED_GRAMS ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string"
  )
    return undefined;

  if (reservation === null)
    return { id, name, material, colour, requiredGrams, version, createdAt, updatedAt, reservation: null };
  if (
    !isRecord(reservation) ||
    typeof reservation.id !== "string" ||
    !isValidPrintId(reservation.id) ||
    typeof reservation.spoolId !== "string" ||
    !isValidPrintId(reservation.spoolId) ||
    typeof reservation.reservedGrams !== "number" ||
    !Number.isSafeInteger(reservation.reservedGrams) ||
    reservation.reservedGrams < 1 ||
    reservation.reservedGrams > 4_294_967_294
  )
    return undefined;
  return {
    id,
    name,
    material,
    colour,
    requiredGrams,
    version,
    createdAt,
    updatedAt,
    reservation: { id: reservation.id, spoolId: reservation.spoolId, reservedGrams: reservation.reservedGrams },
  };
}
