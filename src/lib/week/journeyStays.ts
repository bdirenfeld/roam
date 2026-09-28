import { tonightByDay } from "@/lib/sharedItinerary";
import { townFromAddress } from "@/lib/stays/brief";

/**
 * A journey as its stays, for the phone calendar (27 Sep 2026): a 62-day
 * summer is found by place — "the Lucca stretch" — not by date. A stay is a
 * run of days sleeping in the same hotel, by the shared page's rule
 * (`tonightByDay`: the latest hotel card on or before the day). The last day,
 * which sleeps nowhere, and any days before the first check-in, belong to the
 * stay next to them.
 *
 * Named for its town. Two stays in a row in the same town (Rome moves hotels
 * on day 3) are named for their hotels instead, or the bar would read
 * "Roma · Roma". Null when the journey has fewer than two stays: one hotel is
 * a plain calendar, and a bar with one segment says nothing.
 */
/**
 * Below this a journey is a plain calendar even with two hotels (27 Sep 2026,
 * Brennan on Rome, 7 days: "overkill"). Laying out by stay pays when there
 * are weeks to find your way across, not when every date fits in two rows.
 */
export const STAY_LAYOUT_MIN_DAYS = 15;

export interface JourneyStay {
  label: string;
  hotel: string;
  dayIds: string[];
}

export function journeyStays(
  days: { id: string; dayNumber: number }[],
  hotels: { dayId: string | null; name: string | null; address: string | null }[],
): JourneyStay[] | null {
  const ordered = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const tonight = tonightByDay(ordered, hotels, null);
  const runs: { name: string; address: string | null; dayIds: string[] }[] = [];
  const leading: string[] = [];
  for (const d of ordered) {
    const stay = tonight.get(d.id);
    const name = stay?.name ?? null;
    const last = runs[runs.length - 1];
    if (!name) {
      if (last) last.dayIds.push(d.id);
      else leading.push(d.id);
    } else if (last && last.name === name) {
      last.dayIds.push(d.id);
    } else {
      runs.push({ name, address: stay?.address ?? null, dayIds: [d.id] });
    }
  }
  if (runs.length < 2) return null;
  runs[0].dayIds.unshift(...leading);

  const towns = runs.map((r) => townFromAddress(r.address));
  return runs.map((r, i) => {
    const town = towns[i];
    const twin = !!town && (towns[i - 1] === town || towns[i + 1] === town);
    return { label: town && !twin ? town : shortHotel(r.name), hotel: r.name, dayIds: r.dayIds };
  });
}

/** "Hotel Ilaria - Lucca" → "Hotel Ilaria"; "Great Wolf Lodge | Niagara" →
 *  "Great Wolf Lodge"; "Citadines … Paris (Apart hotel Paris)" loses the
 *  bracket. The full name still heads the stay. */
export function shortHotel(name: string): string {
  const cut = name.replace(/\s*\(.*\)\s*$/, "").split(/\s+[-–|]\s+/)[0].trim();
  return cut || name;
}
