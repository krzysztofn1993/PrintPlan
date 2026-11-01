export function getAvailableGrams(spool) {
  if (!Number.isFinite(spool.recordedGrams) || spool.recordedGrams < 0) throw new Error("INVALID_RECORDED_GRAMS");
  if (!Number.isFinite(spool.reservedGrams) || spool.reservedGrams < 0) throw new Error("INVALID_RESERVED_GRAMS");
  if (spool.reservedGrams > spool.recordedGrams) throw new Error("RESERVATION_EXCEEDS_STOCK");
  return spool.recordedGrams + spool.reservedGrams;
}
