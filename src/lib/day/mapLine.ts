// ── The day's map, folded to one line on a phone ──────────────────────────
// The Agenda put a 192px map before the first card — eighteen things ahead
// of the product, first card 290px down an 812px screen (Essential audit,
// 15 Sept 2026). The map is the same map the Map tab shows, one tap away.
// On a phone it folds to a line — "Map · 3 places" — that opens on tap, and
// the choice is remembered. On a day with nothing placed the line is not
// shown at all: there is nothing to map.

export function mapLineLabel(placed: number): string | null {
  const n = Math.max(0, Math.trunc(placed));
  if (n === 0) return null;
  return `Map · ${n} ${n === 1 ? "place" : "places"}`;
}

const KEY = "roam.dayMap.open";

/** Whether the day map was left open last time; folded until he opens it. */
export function readMapOpen(storage: Pick<Storage, "getItem"> | null | undefined): boolean {
  try {
    return storage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMapOpen(storage: Pick<Storage, "setItem"> | null | undefined, open: boolean): void {
  try {
    storage?.setItem(KEY, open ? "1" : "0");
  } catch {
    // A private window or blocked storage: the fold simply does not remember.
  }
}
