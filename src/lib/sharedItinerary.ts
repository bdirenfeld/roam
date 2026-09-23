// ── What the shared page says under each stop and each day ────────────────
// The people a journey is shared with ask the same five questions every
// morning (the Costa Rica problem). Two of the answers were already written on
// the cards — where to meet, what to bring — and the shared page never showed
// them; a third, where we sleep tonight, lived in one fixed line that was
// blank on New York and could not describe Rome's two hotels. 23 Sep 2026.

export interface StopExtra {
  label: string;
  text: string;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() && v.trim().toUpperCase() !== "TBD" ? v.trim() : null;
}

/**
 * The practical lines under one stop, from fields the organiser already fills
 * in on the card. Never the confirmation number: a link can be forwarded to a
 * taxi driver, and a booking reference is someone's paperwork.
 */
export function stopExtras(details: Record<string, unknown> | null | undefined): StopExtra[] {
  if (!details) return [];
  const out: StopExtra[] = [];

  const point = str(details.meeting_point);
  const time = str(details.meeting_time);
  if (point || time) {
    out.push({ label: "Meet", text: [time, point].filter(Boolean).join(" · ") });
  }

  const bring = details.what_to_bring;
  const bringText = Array.isArray(bring)
    ? bring.map(str).filter(Boolean).join(", ")
    : str(bring);
  if (bringText) out.push({ label: "Bring", text: bringText });

  const prep = str(details.prep);
  if (prep) out.push({ label: "Before you go", text: prep });

  const checkIn = str(details.check_in_time);
  const checkOut = str(details.check_out_time);
  if (checkIn || checkOut) {
    out.push({
      label: "Check-in",
      text: [checkIn && `from ${checkIn}`, checkOut && `out by ${checkOut}`].filter(Boolean).join(" · "),
    });
  }
  return out;
}

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
