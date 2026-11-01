export function acceptsReservation(requiredGrams, marginPercent, response) {
  return Number.isFinite(response.recordedGrams) && Number.isFinite(response.availableGrams);
}
