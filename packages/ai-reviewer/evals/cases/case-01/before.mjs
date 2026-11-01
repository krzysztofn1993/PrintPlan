export function getAvailableGrams(spool) {
  return spool.recordedGrams - spool.reservedGrams;
}
