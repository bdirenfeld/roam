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
  /** The hotel card's own note (check-in time, Wi-Fi, parking), folded under
   *  "Tonight" (2 Oct 2026, Brennan: travellers "should see the wifi and check
   *  in time"). The link can be forwarded, so the note box says to keep door
   *  codes in Journey notes, which this page never shows. */
  note?: string;
}

/**
 * Where everyone sleeps on each day: the most recent hotel card on or before
 * that day. The last day gets nothing — that is the day you leave, and its
 * hotel card is the check-out (Costa Rica day 9, Tuscany day 12). A journey
 * with no hotel cards falls back to the one accommodation the journey names.
 */
export function tonightByDay(
  days: { id: string; dayNumber: number }[],
  hotels: { dayId: string | null; name: string | null; address: string | null; note?: string | null }[],
  fallback: Stay | null,
): Map<string, Stay | null> {
  const numberOf = new Map(days.map((d) => [d.id, d.dayNumber]));
  const sorted = hotels
    .filter((h) => h.dayId && numberOf.has(h.dayId) && (h.name || h.address))
    .map((h) => ({ n: numberOf.get(h.dayId!)!, h }))
    .sort((a, b) => a.n - b.n);
  // A stay's note is its first card's (the check-in): a later card of the same
  // hotel is usually the check-out ("Load the car, keys as the host asks").
  const noteOf = new Map<string, string>();
  for (const { h } of sorted) {
    const key = h.name ?? h.address ?? "", note = h.note?.trim();
    if (note && !noteOf.has(key)) noteOf.set(key, note);
  }
  const placed = sorted.map(({ n, h }) => {
    const note = noteOf.get(h.name ?? h.address ?? "");
    return { n, stay: note ? { name: h.name, address: h.address, note } : { name: h.name, address: h.address } };
  });
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
