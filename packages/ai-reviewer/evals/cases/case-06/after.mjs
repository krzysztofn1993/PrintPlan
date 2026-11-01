export function cancelUntilFits(reservations, available) {
  const ordered = [...reservations].sort((a, b) => a.createdAt - b.createdAt);
  const cancelled = [];
  let total = reservations.reduce((sum, item) => sum + item.grams, 0);
  for (const item of ordered) {
    if (total <= available) break;
    total -= item.grams;
    cancelled.push(item.id);
  }
  return cancelled;
}
