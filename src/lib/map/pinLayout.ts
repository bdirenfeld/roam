import { stackGroups, sideBySide, SIDE_BY_SIDE_MAX, STACK_FACTOR } from "./stackGroups";

/**
 * Where the pins on the day page's map go at this zoom (8 Oct 2026, spec:
 * docs/phone-map-one-page-spec.html).
 *
 *  - Two or three pins that would touch sit side by side, each keeping its
 *    legend colour and icon.
 *  - Nothing is ever merged into one pin. A count pin and a fan-out were both
 *    tried the same evening; Brennan: "I just don't want it to be clustered …
 *    it just looks like a huge blob." A bigger crowd is drawn where it is.
 *  - The chosen day's stops only ever sit beside each other, never beside the
 *    saved places around them.
 */
export type LayoutPin = { id: string; x: number; y: number; day: boolean; type: string };

export type PinLayout = {
  /** Screen offset per spread pin, [dx, dy]. Pins not listed sit where they are. */
  offsets: Map<string, [number, number]>;
};

export function layoutPins(pins: LayoutPin[], pinPx: number): PinLayout {
  const out: PinLayout = { offsets: new Map() };
  for (const day of [true, false]) {
    const set = pins.filter((p) => p.day === day);
    for (const g of stackGroups(set, pinPx * STACK_FACTOR)) {
      if (g.length < 2 || g.length > SIDE_BY_SIDE_MAX) continue;
      const members = g.map((k) => set[k]);
      const offs = sideBySide(members, pinPx + 4);
      members.forEach((m, k) => out.offsets.set(m.id, offs[k]));
    }
  }
  return out;
}

/**
 * One pin per place (8 Oct 2026, Brennan: "why are the pins duplicated?").
 * A place saved and then put on a day has two cards at the same spot; piled,
 * one hid the other, but side by side they showed as twins. Keeps the card the
 * map should show (the chosen day's stop, else one on a day, else the saved
 * one) and returns the ids of the rest, to draw nowhere.
 */
export function twinsToHide(
  cards: { id: string; place_id: string | null; status: string | null }[],
  prefer: (id: string) => boolean = () => false,
): Set<string> {
  const rank = (c: { id: string; status: string | null }) => (prefer(c.id) ? 2 : c.status === "in_itinerary" ? 1 : 0);
  const best = new Map<string, { id: string; status: string | null }>();
  for (const c of cards) {
    if (!c.place_id) continue;
    const cur = best.get(c.place_id);
    if (!cur || rank(c) > rank(cur)) best.set(c.place_id, c);
  }
  return new Set(cards.filter((c) => c.place_id && best.get(c.place_id)!.id !== c.id).map((c) => c.id));
}
