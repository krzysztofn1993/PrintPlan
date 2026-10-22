import type { PrintDto } from "./prints.ts";
import { readPrintDto } from "./print-dto.ts";
import { MAX_REQUIRED_GRAMS, isValidPrintId } from "./print-validation.ts";
import { isValidReservationId, MAX_EXPECTED_RESERVATION_GRAMS } from "./reservation-validation.ts";

export type PrintRecalculationOutcome = "manual_retained" | "manual_fallback" | "best_fit" | "insufficient_material";

export interface PreviousPrintReservationDto {
  id: string;
  spoolId: string;
  reservedGrams: number;
}

export interface PrintRecalculationDto {
  outcome: PrintRecalculationOutcome;
  marginPercent: number;
  reservationGrams: number;
  previousReservation: PreviousPrintReservationDto;
}

export interface PrintUpdateDto {
  print: PrintDto;
  recalculation: PrintRecalculationDto | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveDatabaseAmount(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_EXPECTED_RESERVATION_GRAMS
  );
}

function readPreviousReservation(value: unknown): PreviousPrintReservationDto | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isValidReservationId(value.id) ||
    typeof value.spoolId !== "string" ||
    !isValidPrintId(value.spoolId) ||
    !isPositiveDatabaseAmount(value.reservedGrams)
  ) {
    return undefined;
  }
  return { id: value.id, spoolId: value.spoolId, reservedGrams: value.reservedGrams };
}

function readRecalculation(value: unknown): PrintRecalculationDto | undefined {
  if (
    !isRecord(value) ||
    (value.outcome !== "manual_retained" &&
      value.outcome !== "manual_fallback" &&
      value.outcome !== "best_fit" &&
      value.outcome !== "insufficient_material") ||
    typeof value.marginPercent !== "number" ||
    !Number.isSafeInteger(value.marginPercent) ||
    value.marginPercent < 0 ||
    value.marginPercent > 100 ||
    !isPositiveDatabaseAmount(value.reservationGrams)
  ) {
    return undefined;
  }
  const previousReservation = readPreviousReservation(value.previousReservation);
  if (!previousReservation) return undefined;
  return {
    outcome: value.outcome,
    marginPercent: value.marginPercent,
    reservationGrams: value.reservationGrams,
    previousReservation,
  };
}

/** Decode the committed `update_print` transaction envelope without a follow-up read. */
export function readPrintUpdateDto(
  value: unknown,
  expectedPrintId: string,
  expectedVersion: number,
): PrintUpdateDto | undefined {
  if (
    !isRecord(value) ||
    !isValidPrintId(expectedPrintId) ||
    !Number.isSafeInteger(expectedVersion) ||
    expectedVersion < 1 ||
    expectedVersion >= MAX_REQUIRED_GRAMS
  ) {
    return undefined;
  }

  const print = readPrintDto(value.print);
  if (!print) return undefined;
  if (print.id.toLowerCase() !== expectedPrintId.toLowerCase() || print.version !== expectedVersion + 1)
    return undefined;

  if (value.recalculation === null) {
    if (print.reservation !== null || print.settlement !== null) return undefined;
    return { print, recalculation: null };
  }

  const recalculation = readRecalculation(value.recalculation);
  if (!recalculation) return undefined;

  if (recalculation.outcome === "insufficient_material") {
    if (print.reservation !== null || print.settlement !== null) return undefined;
  } else {
    if (
      !print.reservation ||
      print.settlement !== null ||
      print.reservation.id !== recalculation.previousReservation.id ||
      print.reservation.reservedGrams !== recalculation.reservationGrams
    ) {
      return undefined;
    }
    if (
      recalculation.outcome === "manual_retained" &&
      print.reservation.spoolId !== recalculation.previousReservation.spoolId
    )
      return undefined;
    if (
      recalculation.outcome === "manual_fallback" &&
      print.reservation.spoolId === recalculation.previousReservation.spoolId
    )
      return undefined;
  }

  return { print, recalculation };
}
