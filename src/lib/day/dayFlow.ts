/**
 * The phone day as a flow (Brennan, 12 Nov 2026, approved from a mock of his
 * Tuscany Sat 28): travel is one shaded line, "🚗🚆 Leave 8:00 AM → Florence ·
 * 1 h 25", not four full rows with station photos; the stops after it sit
 * under a small heading, "In Florence"; the way home reads "3:00 PM → Villa"
 * and what follows sits under "Back at the villa". Legs back to back (drive to
 * the station, then the train) are one line (lib/week/travelStrip joinLegs).
 * A day with no travel comes back as plain cards, unchanged.
 */

import { joinLegs, stripDest, shortStay } from "@/lib/week/travelStrip";

export interface FlowCard {
  id: string;
  start_time: string | null;
  end_time: string | null;
}

export type FlowItem<C> =
  | { kind: "travel"; ids: string[]; cards: C[]; startMin: number; endMin: number | null; dest: string; leave: boolean }
  | { kind: "heading"; text: string }
  // A cruise's port of call (17 Nov 2026, Don): "Docked in X · 11 h ashore" at
  // its start, the stops ashore under "In X", "All aboard" at its end.
  | { kind: "port"; phase: "arrive" | "aboard"; card: C; min: number; name: string; hoursAshore: number | null }
  | { kind: "card"; card: C };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * `timed` in agenda order; `isLeg` and `destOf` from lib/travel/leg (kept as
 * arguments so this stays pure); `stays` are the trip's stay names, so a leg
 * home says "Villa". Untimed cards are not passed: they keep their own "Any
 * time" block below.
 */
export function dayFlow<C extends FlowCard>(
  timed: C[],
  isLeg: (c: C) => boolean,
  destOf: (c: C) => string,
  stays: string[] = [],
  port?: { is: (c: C) => boolean; name: (c: C) => string; overnight?: (c: C) => boolean; nights?: (c: C) => number; carry?: C[] },
): FlowItem<C>[] {
  const isPort = (c: C) => !!port && !!c.start_time && port.is(c);
  const legs = timed.filter((c) => !isPort(c) && isLeg(c) && c.start_time);
  const carried = (port?.carry ?? []).filter((c) => c.end_time);
  if (!legs.length && !timed.some(isPort) && !carried.length) return timed.map((card) => ({ kind: "card", card }));

  const runs = joinLegs(legs.map((c) => ({ id: c.id, startMin: toMin(c.start_time!), endMin: c.end_time ? toMin(c.end_time) : null })));
  const runOf = new Map<string, (typeof runs)[number]>();
  for (const r of runs) for (const id of r.ids) runOf.set(id, r);
  const byId = new Map(timed.map((c) => [c.id, c]));

  const out: FlowItem<C>[] = [];
  let firstTravel = true;
  let pendingHeading: string | null = null;
  // Leave only when nothing but travel comes before it (a day that starts out).
  let seenStop = false;
  // All-aboard rows still to come, earliest first: each lands before the first
  // card that starts at or after it, or at the end of the day.
  const aboard: FlowItem<C>[] = carried.map((c) => ({ kind: "port" as const, phase: "aboard" as const, card: c, min: toMin(c.end_time!), name: port!.name(c), hoursAshore: null }));
  const flushAboard = (beforeMin: number) => {
    while (aboard.length && (aboard[0] as { min: number }).min <= beforeMin) {
      out.push(aboard.shift()!);
      pendingHeading = null;
    }
  };
  for (const c of timed) {
    if (c.start_time) flushAboard(toMin(c.start_time));
    if (isPort(c)) {
      const name = port!.name(c);
      const start = toMin(c.start_time!);
      const end = c.end_time ? toMin(c.end_time) : null;
      // A night in port: all aboard is tomorrow, so it closes tomorrow's list, not today's.
      const night = !!port!.overnight?.(c) && end != null;
      const span = end == null ? null : end - start + (night ? (port!.nights?.(c) ?? 1) * 24 * 60 : 0);
      const hoursAshore = span != null && span > 0 ? Math.round(span / 30) / 2 : null;
      out.push({ kind: "port", phase: "arrive", card: c, min: start, name, hoursAshore });
      if (!night && end != null && end > start) {
        aboard.push({ kind: "port", phase: "aboard", card: c, min: end, name, hoursAshore });
        aboard.sort((a, b) => (a as { min: number }).min - (b as { min: number }).min);
      }
      pendingHeading = `In ${name}`;
      seenStop = true;
      continue;
    }
    const r = runOf.get(c.id);
    if (r) {
      if (r.lead !== c.id) continue; // drawn with its run
      const cards = r.ids.map((id) => byId.get(id)!).filter(Boolean);
      const last = cards[cards.length - 1];
      const destRaw = destOf(last);
      const dest = stripDest(destRaw, stays);
      const home = stays.some((s) => s.trim() && destRaw.trim().toLowerCase().includes(s.trim().toLowerCase()));
      out.push({ kind: "travel", ids: r.ids, cards, startMin: r.startMin, endMin: r.endMin, dest, leave: firstTravel && !seenStop });
      firstTravel = false;
      pendingHeading = home ? `Back at the ${shortStay(stays.find((s) => destRaw.toLowerCase().includes(s.toLowerCase()))!).toLowerCase()}` : `In ${dest}`;
      continue;
    }
    if (pendingHeading) { out.push({ kind: "heading", text: pendingHeading }); pendingHeading = null; }
    seenStop = true;
    out.push({ kind: "card", card: c });
  }
  flushAboard(Infinity);
  return out;
}

/** "Via Ricasoli, 58/60, Firenze" → "Via Ricasoli, 58/60": under an "In Florence" heading the town is said once. */
export function dropTown(address: string | null): string | null {
  if (!address) return address;
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(", ") : address;
}
