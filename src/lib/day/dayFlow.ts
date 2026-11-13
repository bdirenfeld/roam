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
): FlowItem<C>[] {
  const legs = timed.filter((c) => isLeg(c) && c.start_time);
  if (!legs.length) return timed.map((card) => ({ kind: "card", card }));

  const runs = joinLegs(legs.map((c) => ({ id: c.id, startMin: toMin(c.start_time!), endMin: c.end_time ? toMin(c.end_time) : null })));
  const runOf = new Map<string, (typeof runs)[number]>();
  for (const r of runs) for (const id of r.ids) runOf.set(id, r);
  const byId = new Map(timed.map((c) => [c.id, c]));

  const out: FlowItem<C>[] = [];
  let firstTravel = true;
  let pendingHeading: string | null = null;
  // Leave only when nothing but travel comes before it (a day that starts out).
  let seenStop = false;
  for (const c of timed) {
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
  return out;
}

/** "Via Ricasoli, 58/60, Firenze" → "Via Ricasoli, 58/60": under an "In Florence" heading the town is said once. */
export function dropTown(address: string | null): string | null {
  if (!address) return address;
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(", ") : address;
}
