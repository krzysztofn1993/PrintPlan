import { MAX_REQUIRED_GRAMS, isValidPrintId } from "./print-validation.ts";
import { MAX_ACTUAL_GRAMS } from "./settlement-validation.ts";

const MAX_RESERVED_GRAMS = 4_294_967_294;
const MAX_LABEL_CODE_POINTS = 80;

export interface PrintSettlementDto {
  id: string;
  settledAt: string;
  actualGrams: number;
}

export interface SettlementPrintSnapshot {
  id: string;
  name: string | null;
  material: string;
  colour: string;
  requiredGrams: number;
}

export interface SettlementSpoolSnapshot {
  id: string;
  material: string;
  colour: string;
  recordedGramsBefore: number;
  recordedGramsAfter: number;
  reservedGramsAfter: number;
  availableGramsAfter: number;
}

export interface CancelledSettlementReservation {
  reservationId: string;
  printId: string;
  printName: string | null;
  material: string;
  colour: string;
  releasedGrams: number;
}

export interface SettlementReceipt {
  schemaVersion: 1;
  id: string;
  requestId: string;
  printId: string;
  reservationId: string;
  expectedVersion: number;
  actualGrams: number;
  settledAt: string;
  exceededEstimate: boolean;
  print: SettlementPrintSnapshot;
  spool: SettlementSpoolSnapshot;
  releasedGrams: number;
  cancelledReservations: CancelledSettlementReservation[];
}

export interface SettlementCommandReceipt {
  settlement: SettlementReceipt;
  replayed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isIntegerBetween(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function isTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    return false;
  }
  const datePart = value.slice(0, 10);
  return new Date(`${datePart}T00:00:00.000Z`).toISOString().slice(0, 10) === datePart;
}

function isLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= MAX_LABEL_CODE_POINTS;
}

function isNullableName(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= MAX_LABEL_CODE_POINTS)
  );
}

function readPrintSnapshot(value: unknown): SettlementPrintSnapshot | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "name", "material", "colour", "requiredGrams"]) ||
    typeof value.id !== "string" ||
    !isValidPrintId(value.id) ||
    !isNullableName(value.name) ||
    !isLabel(value.material) ||
    !isLabel(value.colour) ||
    !isIntegerBetween(value.requiredGrams, 1, MAX_REQUIRED_GRAMS)
  ) {
    return undefined;
  }
  return {
    id: value.id,
    name: value.name,
    material: value.material,
    colour: value.colour,
    requiredGrams: value.requiredGrams,
  };
}

function readSpoolSnapshot(value: unknown): SettlementSpoolSnapshot | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "material",
      "colour",
      "recordedGramsBefore",
      "recordedGramsAfter",
      "reservedGramsAfter",
      "availableGramsAfter",
    ]) ||
    typeof value.id !== "string" ||
    !isValidPrintId(value.id) ||
    !isLabel(value.material) ||
    !isLabel(value.colour) ||
    !isIntegerBetween(value.recordedGramsBefore, 0, MAX_ACTUAL_GRAMS) ||
    !isIntegerBetween(value.recordedGramsAfter, 0, MAX_ACTUAL_GRAMS) ||
    !isIntegerBetween(value.reservedGramsAfter, 0, MAX_ACTUAL_GRAMS) ||
    !isIntegerBetween(value.availableGramsAfter, 0, MAX_ACTUAL_GRAMS)
  ) {
    return undefined;
  }
  if (
    value.reservedGramsAfter > value.recordedGramsAfter ||
    value.availableGramsAfter !== value.recordedGramsAfter - value.reservedGramsAfter
  ) {
    return undefined;
  }
  return {
    id: value.id,
    material: value.material,
    colour: value.colour,
    recordedGramsBefore: value.recordedGramsBefore,
    recordedGramsAfter: value.recordedGramsAfter,
    reservedGramsAfter: value.reservedGramsAfter,
    availableGramsAfter: value.availableGramsAfter,
  };
}

function readCancelledReservation(value: unknown): CancelledSettlementReservation | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["reservationId", "printId", "printName", "material", "colour", "releasedGrams"]) ||
    typeof value.reservationId !== "string" ||
    !isValidPrintId(value.reservationId) ||
    typeof value.printId !== "string" ||
    !isValidPrintId(value.printId) ||
    !isNullableName(value.printName) ||
    !isLabel(value.material) ||
    !isLabel(value.colour) ||
    !isIntegerBetween(value.releasedGrams, 1, MAX_RESERVED_GRAMS)
  ) {
    return undefined;
  }
  return {
    reservationId: value.reservationId,
    printId: value.printId,
    printName: value.printName,
    material: value.material,
    colour: value.colour,
    releasedGrams: value.releasedGrams,
  };
}

export function readPrintSettlementDto(value: unknown): PrintSettlementDto | null | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "settledAt", "actualGrams"]) ||
    typeof value.id !== "string" ||
    !isValidPrintId(value.id) ||
    !isTimestamp(value.settledAt) ||
    !isIntegerBetween(value.actualGrams, 0, MAX_ACTUAL_GRAMS)
  ) {
    return undefined;
  }
  return { id: value.id, settledAt: value.settledAt, actualGrams: value.actualGrams };
}

export function readSettlementReceipt(value: unknown): SettlementReceipt | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "schemaVersion",
      "id",
      "requestId",
      "printId",
      "reservationId",
      "expectedVersion",
      "actualGrams",
      "settledAt",
      "exceededEstimate",
      "print",
      "spool",
      "releasedGrams",
      "cancelledReservations",
    ]) ||
    value.schemaVersion !== 1 ||
    typeof value.id !== "string" ||
    !isValidPrintId(value.id) ||
    typeof value.requestId !== "string" ||
    !isValidPrintId(value.requestId) ||
    typeof value.printId !== "string" ||
    !isValidPrintId(value.printId) ||
    typeof value.reservationId !== "string" ||
    !isValidPrintId(value.reservationId) ||
    !isIntegerBetween(value.expectedVersion, 1, MAX_REQUIRED_GRAMS) ||
    !isIntegerBetween(value.actualGrams, 0, MAX_ACTUAL_GRAMS) ||
    !isTimestamp(value.settledAt) ||
    typeof value.exceededEstimate !== "boolean" ||
    !isIntegerBetween(value.releasedGrams, 1, MAX_RESERVED_GRAMS) ||
    !Array.isArray(value.cancelledReservations)
  ) {
    return undefined;
  }

  const print = readPrintSnapshot(value.print);
  const spool = readSpoolSnapshot(value.spool);
  if (!print || !spool || print.id !== value.printId) return undefined;
  if (
    value.exceededEstimate !== value.actualGrams > spool.recordedGramsBefore ||
    spool.recordedGramsAfter !== Math.max(0, spool.recordedGramsBefore - value.actualGrams)
  ) {
    return undefined;
  }

  const cancelledReservations = value.cancelledReservations.map(readCancelledReservation);
  if (
    cancelledReservations.some((item) => item === undefined) ||
    new Set(cancelledReservations.map((item) => item?.reservationId)).size !== cancelledReservations.length ||
    cancelledReservations.some((item) => item?.reservationId === value.reservationId || item?.printId === value.printId)
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    id: value.id,
    requestId: value.requestId,
    printId: value.printId,
    reservationId: value.reservationId,
    expectedVersion: value.expectedVersion,
    actualGrams: value.actualGrams,
    settledAt: value.settledAt,
    exceededEstimate: value.exceededEstimate,
    print,
    spool,
    releasedGrams: value.releasedGrams,
    cancelledReservations: cancelledReservations as CancelledSettlementReservation[],
  };
}

export function readSettlementCommandReceipt(value: unknown): SettlementCommandReceipt | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["settlement", "replayed"]) || typeof value.replayed !== "boolean") {
    return undefined;
  }
  const settlement = readSettlementReceipt(value.settlement);
  return settlement ? { settlement, replayed: value.replayed } : undefined;
}
