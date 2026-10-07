import type { Card, Place } from "@/types/database";

/**
 * The empty-hour box's saved half (6 Oct 2026, taps audit). Typing "Buca" in
 * an empty hour on the week offers the journey's own saved places first, then
 * Google. Before this, a typed name became a plain note and linking it took
 * the card sheet's pin, a list of saved places only, and a trip to the Map
 * for anything never saved: 5 to 12 taps.
 *
 * Matches by name, accents and case folded ("sant'antonio" finds
 * "Sant'Antonio", "cafe" finds "Café"). A name that starts with the query
 * leads, then one with a word starting with it, then any other match. Each
 * place appears once however many cards point at it.
 */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function savedPlaceMatches(query: string, cards: Card[], limit = 3): Place[] {
  const q = fold(query);
  if (q.length < 2) return [];
  const seen = new Set<string>();
  const scored: { place: Place; rank: number; i: number }[] = [];
  cards.forEach((c, i) => {
    const p = c.place;
    if (!p || !c.place_id || seen.has(p.id)) return;
    seen.add(p.id);
    const name = fold(p.title ?? "");
    if (!name.includes(q)) return;
    const rank = name.startsWith(q) ? 0 : name.split(/[\s'’\-]+/).some((w) => w.startsWith(q)) ? 1 : 2;
    scored.push({ place: p, rank, i });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.i - b.i).slice(0, limit).map((s) => s.place);
}

/** Google's rows, minus the places already offered from the journey. */
export function withoutSaved<T extends { place_id: string }>(predictions: T[], saved: Place[], limit = 4): T[] {
  const have = new Set(saved.map((p) => p.google_place_id).filter(Boolean));
  return predictions.filter((p) => !have.has(p.place_id)).slice(0, limit);
}
