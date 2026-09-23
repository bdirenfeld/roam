// ── What the shared page says under each day ──────────────────────────────
// "Where are we sleeping tonight?" is the question a family asks most (the
// Costa Rica problem). It lived in one fixed line for the whole trip that was
// blank on New York and could not describe Rome's two hotels.
//
// The card extras (meeting point, what to bring, prep) were shown here for a
// few hours on 23 Sep 2026 and cut: Brennan wants this page "super, super
// simple". Anything that matters goes in the card note, which does show.

export interface Stay {
  name: string | null;
  address: string | null;
}

/**
 * Where everyone sleeps on each day: the most recent hotel card on or before
 * that day. The last day gets nothing — that is the day you leave, and its
 * hotel card is the check-out (Costa Rica day 9, Tuscany day 12). A journey
 * with no hotel cards falls back to the one accommodation the journey names.
 */
export function tonightByDay(
  days: { id: string; dayNumber: number }[],
  hotels: { dayId: string | null; name: string | null; address: string | null }[],
  fallback: Stay | null,
): Map<string, Stay | null> {
  const numberOf = new Map(days.map((d) => [d.id, d.dayNumber]));
  const placed = hotels
    .filter((h) => h.dayId && numberOf.has(h.dayId) && (h.name || h.address))
    .map((h) => ({ n: numberOf.get(h.dayId!)!, stay: { name: h.name, address: h.address } }))
    .sort((a, b) => a.n - b.n);
  const last = days.reduce((m, d) => Math.max(m, d.dayNumber), -Infinity);

  const out = new Map<string, Stay | null>();
  for (const d of days) {
    if (d.dayNumber === last && days.length > 1) {
      out.set(d.id, null);
      continue;
    }
    let tonight: Stay | null = null;
    for (const h of placed) if (h.n <= d.dayNumber) tonight = h.stay;
    out.set(d.id, tonight ?? (placed.length === 0 ? fallback : null));
  }
  return out;
}

/** A cover the guest can load: our own cached copies and full URLs only. The
 *  /api/places/photo route needs a session, so for a guest it hangs and then
 *  shows a broken image (Costa Rica's cover, measured 12–14 s). */
export function guestSafeCover(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}
