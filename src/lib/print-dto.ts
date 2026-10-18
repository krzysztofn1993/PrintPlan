import type { PrintDto } from "./prints.ts";
import { readPrintSettlementDto } from "./settlement-dto.ts";
import { MAX_REQUIRED_GRAMS, isValidPrintId } from "./print-validation.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readPrintDto(value: unknown): PrintDto | undefined {
  if (!isRecord(value)) return undefined;
  const { id, name, material, colour, requiredGrams, version, createdAt, updatedAt, reservation, settlement } = value;
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
    typeof updatedAt !== "string" ||
    !Object.hasOwn(value, "settlement")
  )
    return undefined;

  const parsedSettlement = readPrintSettlementDto(settlement);
  if (parsedSettlement === undefined || (parsedSettlement !== null && reservation !== null)) return undefined;

  if (reservation === null)
    return {
      id,
      name,
      material,
      colour,
      requiredGrams,
      version,
      createdAt,
      updatedAt,
      reservation: null,
      settlement: parsedSettlement,
    };
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
    settlement: parsedSettlement,
  };
}
