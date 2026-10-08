import { stackGroups, sideBySide, SIDE_BY_SIDE_MAX, STACK_FACTOR } from "./stackGroups";

/**
 * Where the pins on the day page's map go at this zoom (8 Oct 2026, spec:
 * docs/phone-map-one-page-spec.html, mocks "pins4" and "all2").
 *
 *  - Two or three pins that would touch sit side by side, each keeping its
 *    legend colour and icon.
 *  - A crowd (four or more) becomes one round pin with a count; its ring shows
 *    the mix of types. A tap zooms in until they come apart.
 *  - The chosen day's stops only ever group with each other, never with the
 *    saved places around them, so the day never disappears into a crowd.
 */
export type LayoutPin = { id: string; x: number; y: number; day: boolean; type: string };

export type Pile = { ids: string[]; x: number; y: number; day: boolean; counts: Record<string, number> };

export type PinLayout = {
  /** Screen offset per spread pin, [dx, dy]. Pins not listed sit where they are. */
  offsets: Map<string, [number, number]>;
  /** Pins drawn as part of a pile instead of on their own. */
  hidden: Set<string>;
  piles: Pile[];
};

export function layoutPins(pins: LayoutPin[], pinPx: number): PinLayout {
  const out: PinLayout = { offsets: new Map(), hidden: new Set(), piles: [] };
  for (const day of [true, false]) {
    const set = pins.filter((p) => p.day === day);
    for (const g of stackGroups(set, pinPx * STACK_FACTOR)) {
      if (g.length < 2) continue;
      const members = g.map((k) => set[k]);
      if (g.length <= SIDE_BY_SIDE_MAX) {
        const offs = sideBySide(members, pinPx + 4);
        members.forEach((m, k) => out.offsets.set(m.id, offs[k]));
        continue;
      }
      const counts: Record<string, number> = {};
      members.forEach((m) => { counts[m.type] = (counts[m.type] ?? 0) + 1; out.hidden.add(m.id); });
      out.piles.push({
        ids: members.map((m) => m.id),
        x: members.reduce((s, m) => s + m.x, 0) / members.length,
        y: members.reduce((s, m) => s + m.y, 0) / members.length,
        day,
        counts,
      });
    }
  }
  return out;
}

/** The ring around a pile: one arc per type in the legend's order, sized by count (a CSS conic-gradient). */
export function pileRing(counts: Record<string, number>, colours: Record<string, string>): string {
  const order = ["food", "activity", "logistics"];
  const total = order.reduce((s, t) => s + (counts[t] ?? 0), 0);
  if (total === 0) return "#1A1A2E";
  let at = 0;
  const arcs: string[] = [];
  for (const t of order) {
    const n = counts[t] ?? 0;
    if (!n) continue;
    const to = at + (n / total) * 360;
    arcs.push(`${colours[t]} ${Math.round(at)}deg ${Math.round(to)}deg`);
    at = to;
  }
  return `conic-gradient(${arcs.join(", ")})`;
}
