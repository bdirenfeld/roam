/**
 * Is saving this place again a duplicate? (27 Sep 2026) Only when it is
 * already on the day being chosen, or when this is a map-only save and the
 * place is already on the journey. The same place on another day is a
 * second visit — the airport out is the airport in — and the "Already saved"
 * question there was friction on every round trip.
 */
export function isDuplicateSave(existing: { day_id: string | null }[], targetDayId: string | null): boolean {
  if (existing.length === 0) return false;
  if (targetDayId === null) return true;
  return existing.some((c) => c.day_id === targetDayId);
}
