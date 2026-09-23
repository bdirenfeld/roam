// ── How many saved places are still waiting for a day ─────────────────────
// Putting a saved place on a day COPIES it: the save (status "interested")
// stays and a scheduled card (status "in_itinerary") is made beside it. So
// counting saves counted everything ever saved, and the number never went
// down as the plan filled in. A saved place is waiting only if no scheduled
// card shares its place. Saved notes (no place) always wait.

export function unplacedCount(
  saved: { place_id: string | null }[],
  placed: { place_id: string | null }[],
): number {
  const onADay = new Set(placed.map((c) => c.place_id).filter(Boolean));
  const seen = new Set<string>();
  let n = 0;
  for (const c of saved) {
    if (!c.place_id) { n++; continue; }
    if (onADay.has(c.place_id) || seen.has(c.place_id)) continue;
    seen.add(c.place_id);
    n++;
  }
  return n;
}
