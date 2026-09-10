// ── The stay brief ────────────────────────────────────────────────────────
// Everything "Where to stay" needs to know about a journey, read off the
// journey itself: the dates, who is coming, and the pins with their days and
// times. Nothing here asks the person a question (Brennan, Sep 2026: "use
// data they needed to create when they build the trip in the first place").
//
// Pure geometry, no network. Drive times come later, from the route that
// calls Google; this module decides WHAT to measure — the anchors — and the
// rules that do not need a road:
//
//  • Evening pins set the radius. A pin at 19:30 with three kids means the
//    bed has to be close to it. The cluster with the most evenings is the
//    evening centre; the base should be within EVENING_RADIUS_MIN of it.
//  • Day-trip pins set the side of town. Each cluster is an anchor weighted
//    by the number of days it appears, so a place visited twice counts twice.
//  • The airport is its own anchor. A factor, not the factor.
//  • Stay days are days with nothing placed before 16:00. Over ~20% of the
//    trip and the grounds outrank the drive (Costa Rica: the villa carries
//    the empty days).
//  • Fit is a floor, not a score: bedrooms for the couples and the kids,
//    bathrooms for the headcount, and two flags — a ground-floor question
//    when anyone is 65+, a cot when anyone is under 5.
//  • One base or two: a day-trip cluster visited on 2+ days and far from the
//    evening centre is worth a sentence. Never a decision — his call.

export interface BriefPin {
  title: string;
  address: string | null;
  lat: number;
  lng: number;
  subType: string | null;
  /** ISO date of the day the card sits on; null for a saved-but-unscheduled pin. */
  dayDate: string | null;
  /** "HH:MM:SS" or "HH:MM"; null for an untimed card. */
  startTime: string | null;
}

export interface BriefInput {
  startDate: string;
  endDate: string;
  partyAges: number[] | null;
  partySize: number | null;
  pins: BriefPin[];
}

export type AnchorKind = "airport" | "evening" | "daytrip";

export interface Anchor {
  kind: AnchorKind;
  label: string;
  lat: number;
  lng: number;
  /** Distinct days the anchor is visited. Doubles as the drive weight. */
  days: number;
  /** Great-circle km from the evening centre; 0 for the evening centre itself. */
  kmFromEvening: number;
}

export interface StayBrief {
  nights: number;
  days: number;
  party: { total: number; adults: number; kids: number; seniors: number; under5: boolean };
  fit: { bedrooms: number; baths: number; askGroundFloor: boolean; askCot: boolean };
  kind: "house" | "hotel";
  anchors: Anchor[];
  /** The evening cluster with the most days, or null when no pin is after 17:00. */
  evening: { lat: number; lng: number; label: string; days: number } | null;
  radiusMin: number;
  stayDays: number;
  /** Day-trip clusters worth a second base: 2+ days and far from the evening centre. */
  splitCandidates: { label: string; days: number; km: number }[];
}

export const EVENING_RADIUS_MIN = 15;
const EVENING_FROM = "17:00";
const STAY_DAY_BEFORE = "16:00";
const EVENING_CLUSTER_KM = 3;
const DAYTRIP_CLUSTER_KM = 5;
const SPLIT_KM = 50;
const SPLIT_DAYS = 2;

const STAY_SUBTYPES = new Set(["hotel", "accommodation"]);

export function greatCircleKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = Math.PI / 180;
  const c =
    Math.sin(aLat * r) * Math.sin(bLat * r) +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.cos((bLng - aLng) * r);
  return Math.acos(Math.min(1, Math.max(-1, c))) * 6371;
}

/**
 * The town out of a formatted address. Italian and most European addresses
 * carry "55100 Lucca LU"; North American ones "Palm Springs, CA 92262". The
 * fallback is the second-to-last comma segment, which is the town more often
 * than not.
 */
const STREET_WORDS = /\b(Blvd|Dr|Rd|St|Ave|Street|Road|Drive|Avenue|Way|Ln|Lane|Ct|Court|Hwy|Highway|Pl|Plaza|Chome|Quay|Wharf|Pier|Terrace|Cres|Crescent|Grove|Ward)\b|^(Via|Viale|Piazza|Piazzale|P\.za|Vicolo|Corso|Lungomare|Località|Strada|Calle|Carr\.|Acceso|Unit|Suite|Level)\b|\d+\s*(Chome|Banchi|Ban|-\d)/i;
const REGION_WORDS = /\b(Provincia|Province|Prefecture|Region|County|Metropolitan|State|Territory|Ward)\b|^(New South Wales|Victoria|Queensland|Tasmania|Western Australia|South Australia|California|Nevada|Arizona|Florida|Ontario|Quebec|British Columbia|Alberta|Tuscany|Toscana|Lazio|Guanacaste|Puntarenas|Kanto|Kansai|Kyushu)$/i;

/** The core of one address segment: the town without its codes, or null when it is a street, a code or a number. */
function segmentCore(seg: string): { core: string; region: boolean } | null {
  const s = seg.trim();
  if (!s) return null;
  if (/^[\d\s\-–/]+[A-Za-z]?$/.test(s)) return null;                          // "20", "1r", "50309", "554-0031"
  if (/^[A-Z]{2,3}$/.test(s)) return null;                                     // "SP", "NSW"
  if (/^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(s)) return null;                    // "CA 92262"
  if (/^[A-Z]{2}\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.test(s)) return null;            // "ON M3H 5L3"
  let core = s;
  let m: RegExpExecArray | null;
  if ((m = /^\d{4,6}\s+(.+?)(?:\s+[A-Z]{2})?$/.exec(s))) core = m[1];          // "55100 Lucca LU"
  else if ((m = /^(.+?)\s+[A-Z]{2,3}\s+\d{4}$/.exec(s))) core = m[1];          // "Sydney NSW 2000"
  else if ((m = /^(.+?)\s+\d{3}-\d{4}$/.exec(s))) core = m[1];                 // "Chiba 279-8511"
  else if ((m = /^(.+?)\s+[A-Z]{2}\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d$/.exec(s))) core = m[1]; // "North York ON M3H 5L3"
  else if ((m = /^(.+?)\s+[A-Z]{2,3}$/.exec(s))) core = m[1];                  // "Bondi Beach NSW"
  else if ((m = /^(.+?)\s+\d{5}$/.exec(s))) core = m[1];                       // "Roma 00186"
  if (STREET_WORDS.test(core)) return null;
  if (/^\d/.test(core)) return null;
  return { core, region: REGION_WORDS.test(core) };
}

/**
 * The town out of a formatted address, whatever country wrote it. Each
 * comma segment is reduced to its core (postal and state codes off), streets,
 * numbers and bare codes are dropped, and the last town-like segment before
 * the country wins — a region name ("Provincia de Guanacaste", "California")
 * only when nothing better is there.
 */
export function townFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const body = parts.length > 1 ? parts.slice(0, -1) : parts;               // drop the country
  const cores = body.map(segmentCore).filter((c): c is { core: string; region: boolean } => !!c);
  const towns = cores.filter((c) => !c.region);
  if (towns.length) return towns[towns.length - 1].core;
  if (cores.length) return cores[cores.length - 1].core;
  return null;
}

/**
 * An airport is a transit pin named as one, or any flight card — Australia
 * and Costa Rica store their airports as `flight_arrival`, not `transit`.
 * A flight card can also sit at the HOME airport (Rome's "Flight to Toronto"
 * is a pin at Pearson), so airports only become anchors within
 * AIRPORT_MAX_KM of the centre; the rest are dropped entirely.
 */
/**
 * The country an address ends in, or null when it stops at a postal code.
 * The stay search needs it: asking Google for "Palm Springs" while telling it
 * the searcher is in Canada returned places across North America (Brennan,
 * 10 Sept 2026).
 */
export function countryFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  if (/\d/.test(last) || last.length < 3) return null;
  return last;
}

/** The country most of these pins agree on. */
export function countryOfPins(pins: { address: string | null }[]): string | null {
  const counts = new Map<string, number>();
  for (const p of pins) {
    const c = countryFromAddress(p.address);
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  counts.forEach((count, c) => { if (count > n) { n = count; best = c; } });
  return best;
}

function isFlight(p: BriefPin): boolean {
  return p.subType === "flight_arrival" || p.subType === "flight_departure";
}
function isAirport(p: BriefPin): boolean {
  return isFlight(p) || (p.subType === "transit" && /\b(airport|aeroport|aeropuerto|flughafen)\b/i.test(p.title));
}
const AIRPORT_MAX_KM = 200;
function isStay(p: BriefPin): boolean {
  return !!p.subType && STAY_SUBTYPES.has(p.subType);
}
function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start + "T00:00:00");
  const last = new Date(end + "T00:00:00");
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

interface Cluster { pins: BriefPin[]; lat: number; lng: number }

/** Greedy: a pin joins the first cluster whose running centroid is within km. */
function cluster(pins: BriefPin[], km: number): Cluster[] {
  const out: Cluster[] = [];
  for (const p of pins) {
    const hit = out.find((c) => greatCircleKm(c.lat, c.lng, p.lat, p.lng) <= km);
    if (hit) {
      hit.pins.push(p);
      hit.lat = hit.pins.reduce((s, q) => s + q.lat, 0) / hit.pins.length;
      hit.lng = hit.pins.reduce((s, q) => s + q.lng, 0) / hit.pins.length;
    } else {
      out.push({ pins: [p], lat: p.lat, lng: p.lng });
    }
  }
  return out;
}

function distinctDays(pins: BriefPin[]): number {
  return new Set(pins.map((p) => p.dayDate).filter(Boolean)).size;
}

/** The town most of the cluster's addresses agree on, else the nearest pin's title. */
function clusterLabel(c: Cluster): string {
  const towns = new Map<string, number>();
  for (const p of c.pins) {
    const t = townFromAddress(p.address);
    if (t) towns.set(t, (towns.get(t) ?? 0) + 1);
  }
  let best: string | null = null;
  let n = 0;
  towns.forEach((count, t) => { if (count > n) { n = count; best = t; } });
  if (best) return best;
  const nearest = c.pins.slice().sort(
    (a, b) => greatCircleKm(c.lat, c.lng, a.lat, a.lng) - greatCircleKm(c.lat, c.lng, b.lat, b.lng),
  )[0];
  return nearest.title;
}

export function partyFromAges(ages: number[] | null, size: number | null): StayBrief["party"] {
  if (ages && ages.length) {
    const kids = ages.filter((a) => a < 13).length;
    const seniors = ages.filter((a) => a >= 65).length;
    return { total: ages.length, adults: ages.length - kids, kids, seniors, under5: ages.some((a) => a < 5) };
  }
  const total = Math.max(1, size ?? 2);
  return { total, adults: total, kids: 0, seniors: 0, under5: false };
}

export function fitFromParty(party: StayBrief["party"]): StayBrief["fit"] {
  return {
    bedrooms: Math.max(1, Math.ceil(party.adults / 2) + Math.ceil(party.kids / 2)),
    baths: Math.max(1, Math.ceil(party.total / 3)),
    askGroundFloor: party.seniors > 0,
    askCot: party.under5,
  };
}

export function kindFor(nights: number, party: StayBrief["party"]): StayBrief["kind"] {
  if (nights < 4 || party.total <= 2) return "hotel";
  if (nights >= 5 && party.kids > 0) return "house";
  return "hotel";
}

export function buildStayBrief(input: BriefInput): StayBrief {
  const dayList = daysBetween(input.startDate, input.endDate);
  const days = dayList.length;
  const nights = Math.max(0, days - 1);
  const party = partyFromAges(input.partyAges, input.partySize);
  const fit = fitFromParty(party);

  const placed = input.pins.filter((p) => p.dayDate && !isStay(p));
  const airports = placed.filter(isAirport);
  const rest = placed.filter((p) => !isAirport(p));
  const evenings = rest.filter((p) => (hhmm(p.startTime) ?? "") >= EVENING_FROM);
  const daytime = rest.filter((p) => (hhmm(p.startTime) ?? "00:00") < EVENING_FROM);

  const eveningClusters = cluster(evenings, EVENING_CLUSTER_KM)
    .map((c) => ({ c, days: distinctDays(c.pins) }))
    .sort((a, b) => b.days - a.days || b.c.pins.length - a.c.pins.length);
  // No pin after 17:00 (an imported plan with only daytime slots): the place
  // visited on the most days stands in as the centre, so the brief still has
  // a side of town and a radius to speak from.
  const fallback = cluster(daytime, EVENING_CLUSTER_KM)
    .map((c) => ({ c, days: distinctDays(c.pins) }))
    .sort((a, b) => b.days - a.days || b.c.pins.length - a.c.pins.length)[0] ?? null;
  const ev = eveningClusters[0] ?? fallback;
  const evening = ev
    ? { lat: ev.c.lat, lng: ev.c.lng, label: clusterLabel(ev.c), days: ev.days }
    : null;
  const kmFromEv = (lat: number, lng: number) =>
    evening ? Math.round(greatCircleKm(evening.lat, evening.lng, lat, lng)) : 0;

  const anchors: Anchor[] = [];
  if (evening) anchors.push({ kind: "evening", label: evening.label, lat: evening.lat, lng: evening.lng, days: evening.days, kmFromEvening: 0 });
  for (const c of cluster(airports, DAYTRIP_CLUSTER_KM)) {
    const km = kmFromEv(c.lat, c.lng);
    if (evening && km > AIRPORT_MAX_KM) continue;
    // A flight card's address can be the airline ("Air Canada"); only a real
    // address names the airport's town, otherwise it is just "the airport".
    const addressed = c.pins.some((p) => (p.address ?? "").includes(","));
    anchors.push({ kind: "airport", label: addressed ? clusterLabel(c) : "the airport", lat: c.lat, lng: c.lng, days: distinctDays(c.pins), kmFromEvening: km });
  }
  for (const c of cluster(daytime, DAYTRIP_CLUSTER_KM)) {
    // Daytime pins in the evening cluster are the same errand; the evening anchor carries them.
    if (evening && greatCircleKm(evening.lat, evening.lng, c.lat, c.lng) <= DAYTRIP_CLUSTER_KM) continue;
    anchors.push({ kind: "daytrip", label: clusterLabel(c), lat: c.lat, lng: c.lng, days: distinctDays(c.pins), kmFromEvening: kmFromEv(c.lat, c.lng) });
  }

  // Stay days. Arrival counts a half when nothing but the airport is on it;
  // departure never counts; a day is a stay day when nothing is placed before 16:00.
  let stayDays = 0;
  dayList.forEach((date, i) => {
    const last = i === dayList.length - 1;
    if (last) return;
    const before = rest.filter((p) => p.dayDate === date && (hhmm(p.startTime) ?? "00:00") < STAY_DAY_BEFORE);
    if (i === 0) { if (before.length === 0) stayDays += 0.5; return; }
    if (before.length === 0) stayDays += 1;
  });

  const splitCandidates = anchors
    .filter((a) => a.kind === "daytrip" && a.days >= SPLIT_DAYS && a.kmFromEvening >= SPLIT_KM)
    .map((a) => ({ label: a.label, days: a.days, km: a.kmFromEvening }));

  return {
    nights,
    days,
    party,
    fit,
    kind: kindFor(nights, party),
    anchors,
    evening,
    radiusMin: EVENING_RADIUS_MIN,
    stayDays,
    splitCandidates,
  };
}
