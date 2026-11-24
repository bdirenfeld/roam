// Turns the sample itinerary into database rows. Pure, so the whole example
// can be checked without a database; actions.ts does the inserting.

import { SAMPLE_DAYS, SAMPLE_INTERESTED, SAMPLE_TITLE, SAMPLE_DESTINATION, SAMPLE_COVER, SAMPLE_PARTY, type SampleCard } from "./itinerary";

export interface SamplePlace { google_place_id: string; title: string; lat: number; lng: number; address?: string | null }

const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000));

/**
 * The first Thursday of the next June at least a month away. A fixed weekday,
 * so nothing lands on the day it is closed; June, so Giverny is open.
 */
export function sampleStart(today: Date): string {
  const soonest = addDays(iso(today), 30);
  for (let year = today.getUTCFullYear(); ; year++) {
    const first = new Date(Date.UTC(year, 5, 1));
    const start = iso(new Date(Date.UTC(year, 5, 1 + ((4 - first.getUTCDay() + 7) % 7))));
    if (start >= soonest) return start;
  }
}

export interface SampleRows {
  trip: Record<string, unknown>;
  days: { id: string; trip_id: string; date: string; day_number: number }[];
  /** One end-of-leg place per place moved to. */
  legPlaces: Record<string, unknown>[];
  cards: Record<string, unknown>[];
}

export function buildSample(opts: {
  userId: string;
  today: Date;
  newId: () => string;
  /** The user's place row id for a google_place_id. */
  placeId: Map<string, string>;
  snapshot: SamplePlace[];
}): SampleRows {
  const { userId, today, newId, placeId, snapshot } = opts;
  const start = sampleStart(today);
  const tripId = newId();
  const byGid = new Map(snapshot.map((p) => [p.google_place_id, p]));
  const need = (gid: string) => {
    const p = byGid.get(gid);
    if (!p) throw new Error(`Sample trip: ${gid} is not in places.json`);
    return p;
  };

  const days = SAMPLE_DAYS.map((_, i) => ({ id: newId(), trip_id: tripId, date: addDays(start, i), day_number: i + 1 }));
  const legPlaces: Record<string, unknown>[] = [];
  const legIds = new Map<string, string>();

  const legPlaceId = (leg: NonNullable<SampleCard["leg"]>) => {
    const have = legIds.get(leg.to);
    if (have) return have;
    const p = need(leg.to);
    const id = newId();
    legIds.set(leg.to, id);
    // No google_place_id: the stop itself is its own row (a hotel, an abbey),
    // and a leg's end has to be a transit place.
    legPlaces.push({ id, user_id: userId, title: leg.toTitle, type: "logistics", sub_type: "transit", lat: p.lat, lng: p.lng, address: p.address ?? null, details: {} });
    return id;
  };

  const toCard = (c: SampleCard, dayId: string | null, position: number) => {
    const details: Record<string, unknown> = { ...c.details };
    for (const [key, index] of Object.entries(c.dayDetails ?? {})) details[key] = addDays(start, index);
    let place: string | null = null;
    if (c.leg) {
      const from = need(c.leg.from);
      place = legPlaceId(c.leg);
      Object.assign(details, {
        title: `${c.leg.fromTitle} → ${c.leg.toTitle}`,
        named: true,
        mode: c.leg.mode,
        from: { title: c.leg.fromTitle, lat: from.lat, lng: from.lng, google_place_id: c.leg.from, address: from.address ?? null },
        to_google_place_id: c.leg.to,
      });
    } else if (c.googlePlaceId) {
      need(c.googlePlaceId);
      place = placeId.get(c.googlePlaceId) ?? null;
      if (!place) throw new Error(`Sample trip: no place row for ${c.googlePlaceId}`);
    }
    return {
      id: newId(), trip_id: tripId, day_id: dayId, place_id: place,
      status: dayId ? "in_itinerary" : "interested",
      position, start_time: c.startTime ?? null, end_time: c.endTime ?? null,
      confirmed: c.confirmed ?? false, source_url: c.sourceUrl ?? null, details,
    };
  };

  return {
    trip: {
      id: tripId, user_id: userId, title: SAMPLE_TITLE, destination: SAMPLE_DESTINATION.name,
      destination_lat: SAMPLE_DESTINATION.lat, destination_lng: SAMPLE_DESTINATION.lng,
      start_date: start, end_date: addDays(start, SAMPLE_DAYS.length - 1),
      party_size: SAMPLE_PARTY.size, party_ages: SAMPLE_PARTY.ages, status: "planning", cover_image_url: SAMPLE_COVER,
    },
    days,
    legPlaces,
    cards: [
      ...SAMPLE_DAYS.flatMap((cards, i) => cards.map((c, j) => toCard(c, days[i].id, j + 1))),
      ...SAMPLE_INTERESTED.map((c) => toCard(c, null, 0)),
    ],
  };
}

/** The example is offered until someone has any other journey (their own or shared with them). */
export function onlySample(trips: { title: string | null }[]): boolean {
  return trips.every((t) => t.title === SAMPLE_TITLE);
}
