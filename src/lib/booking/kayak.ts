/**
 * Kayak search links for the To book checklist in Bookings (6 Oct 2026).
 *
 * Every shape here was checked by Brennan on kayak.com on 6 Oct 2026:
 *   flights  /flights/YYZ-PSA/2027-08-24/2027-09-04/4adults/children-10-8-5?sort=bestflight_a
 *            several arrival airports comma-joined: /flights/YYZ-FLR,PSA/…
 *   stays    /hotels/Lucca/2027-08-24/2027-09-04/4adults/3children-10-8-5/2rooms   (plain English town, no country)
 *   cars     /cars/PSA/2027-08-24-14h/2027-09-04-10h   (+ ?sort=rank_a&fs=carcapacity=pas_7_X for 7–9 seats)
 *
 * Three traps, all found live:
 *   - kayak.ca does not resolve on his network; Canada's site is www.ca.kayak.com (below).
 *   - a TOWN in a flight route is dropped silently: airports are IATA codes only.
 *   - a comma in a stay's place falls back to Kayak's generic stays page:
 *     Stays and cars take the plain English town ("Florence", not "Florence-Italy", which opened the airport).
 */

import { homeCountryName } from "@/lib/budget/currency";

/** Kayak's own site, for anyone whose home country has no regional one. */
export const KAYAK = "https://www.kayak.com";

/**
 * Kayak prices in the currency of its regional site, so the link goes to the
 * person's own (6 Oct 2026, Brennan: the pricing should be in their home
 * currency). Every host answered 200 on 6 Oct 2026, and the flights, hotels
 * and cars shapes below resolved on each (hotels redirect to the place's id,
 * e.g. /hotels/Lucca-c14879/…). kayak.ca does NOT resolve; www.ca.kayak.com does.
 * kayak.co.nz did not answer, so New Zealand stays on kayak.com.
 */
const KAYAK_HOSTS: Record<string, string> = {
  canada: "https://www.ca.kayak.com",
  "united kingdom": "https://www.kayak.co.uk",
  australia: "https://www.kayak.com.au",
  ireland: "https://www.kayak.ie",
  germany: "https://www.kayak.de",
  france: "https://www.kayak.fr",
  italy: "https://www.kayak.it",
  spain: "https://www.kayak.es",
  netherlands: "https://www.kayak.nl",
  switzerland: "https://www.kayak.ch",
  mexico: "https://www.kayak.com.mx",
  india: "https://www.kayak.co.in",
};

/** The Kayak site for where someone lives ("Canada" → www.ca.kayak.com); anything else kayak.com. */
export function kayakBase(homeCountry: string | null | undefined): string {
  const name = homeCountryName(homeCountry);
  return (name && KAYAK_HOSTS[name]) || KAYAK;
}

/** Kayak's party: adults, and every child's age. */
export interface KayakParty { adults: number; children: number[] }

const IATA = /^[A-Z]{3}$/;
export const isIata = (s: unknown): s is string => typeof s === "string" && IATA.test(s);

/**
 * Ages to Kayak's party. 18 and over is an adult; under 18 a child with its
 * age; under 2 goes as 1 (a lap infant's age, never 0). With no ages at all,
 * everyone in the head count is an adult.
 */
export function kayakParty(ages: number[] | null | undefined, size: number | null | undefined): KayakParty {
  const known = (ages ?? []).filter((a) => typeof a === "number" && Number.isFinite(a) && a >= 0);
  if (!known.length) return { adults: Math.max(1, size ?? 1), children: [] };
  const adults = known.filter((a) => a >= 18).length;
  const children = known.filter((a) => a < 18).map((a) => Math.max(1, Math.floor(a)));
  return { adults: Math.max(1, adults), children };
}

export const travellers = (p: KayakParty) => p.adults + p.children.length;

/** One room per four people. */
export const roomsFor = (p: KayakParty) => Math.max(1, Math.ceil(travellers(p) / 4));

/**
 * Local town names as addresses print them, in the English Kayak resolves (6 Oct 2026, tested live):
 * a bare local name can land somewhere else entirely — "Roma" opened Roma, Queensland; "Firenze"
 * opened a hamlet — while the plain English name opened the right city every time (Lisbon, Paris,
 * London, Kyoto, Cancún, Positano, Orlando, Venice, Milan, Florence, Lucca).
 */
const ENGLISH: Record<string, string> = {
  firenze: "Florence", roma: "Rome", venezia: "Venice", milano: "Milan", napoli: "Naples", torino: "Turin",
  genova: "Genoa", padova: "Padua", siracusa: "Syracuse", mantova: "Mantua", lisboa: "Lisbon", sevilla: "Seville",
  "a coruña": "A Coruna", münchen: "Munich", köln: "Cologne", nürnberg: "Nuremberg", wien: "Vienna", praha: "Prague",
  warszawa: "Warsaw", kraków: "Krakow", bruxelles: "Brussels", brussel: "Brussels", "den haag": "The Hague",
  genève: "Geneva", zürich: "Zurich", athína: "Athens", αθήνα: "Athens", københavn: "Copenhagen",
  göteborg: "Gothenburg", moskva: "Moscow", "ciudad de méxico": "Mexico City", "città del vaticano": "Vatican City",
};
export function englishTown(town: string): string {
  return ENGLISH[town.trim().toLowerCase()] ?? town.trim();
}

/** "Lucca, Italy" → "Lucca-Italy": no commas (they break the stays search), no spaces. */
export function kayakPlace(...parts: (string | null | undefined)[]): string {
  return parts
    .filter((p): p is string => !!p && !!p.trim())
    .map((p) => p.replace(/[,/]+/g, " ").trim().replace(/\s+/g, "-"))
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("-");
}

/**
 * Flights, there and back. `to` is one to three IATA codes. Without a home
 * airport or any arrival code there is no route Kayak can read, so the link is
 * the plain flights page.
 */
export function flightsUrl(o: { from: string | null; to: string[]; out: string; back: string; party: KayakParty; base?: string }): string {
  const site = o.base ?? KAYAK;
  const to = o.to.filter(isIata);
  if (!isIata(o.from) || !to.length) return `${site}/flights`;
  const kids = o.party.children.length ? `/children-${o.party.children.join("-")}` : "";
  return `${site}/flights/${o.from}-${to.join(",")}/${o.out}/${o.back}/${o.party.adults}adults${kids}?sort=bestflight_a`;
}

/** Stays in a town for a run of nights. One room is Kayak's default and is left out. */
export function staysUrl(o: { place: string; checkIn: string; checkOut: string; party: KayakParty; base?: string }): string {
  const site = o.base ?? KAYAK;
  if (!o.place) return `${site}/stays`;
  const k = o.party.children;
  const kids = k.length ? `/${k.length}children-${k.join("-")}` : "";
  const rooms = roomsFor(o.party);
  return `${site}/hotels/${o.place}/${o.checkIn}/${o.checkOut}/${o.party.adults}adults${kids}${rooms > 1 ? `/${rooms}rooms` : ""}`;
}

const hour = (h: number) => `${String(Math.min(23, Math.max(0, Math.round(h)))).padStart(2, "0")}h`;

/**
 * Kayak's seats filter (verified live 6 Oct 2026): `fs=carcapacity=pas_5_6` is
 * 5–6 passengers, `pas_7_X` is 7–9. Four or fewer: no filter (every car fits).
 * Ten or more still searches 7+ — the row says two cars are needed.
 */
export function carCapacity(people: number): "pas_5_6" | "pas_7_X" | null {
  if (people >= 7) return "pas_7_X";
  if (people >= 5) return "pas_5_6";
  return null;
}

/** More than nine people do not fit one hire car. */
export const twoCars = (people: number) => people >= 10;

/** A car from an airport (or a town) to the last morning, big enough for the party. */
export function carsUrl(o: { at: string; pickUp: string; pickUpHour: number; dropOff: string; dropOffHour: number; people?: number; base?: string }): string {
  const site = o.base ?? KAYAK;
  if (!o.at) return `${site}/cars`;
  const seats = carCapacity(o.people ?? 0);
  return `${site}/cars/${o.at}/${o.pickUp}-${hour(o.pickUpHour)}/${o.dropOff}-${hour(o.dropOffHour)}${seats ? `?sort=rank_a&fs=carcapacity=${seats}` : ""}`;
}

/**
 * The city an airport serves, for the Bookings row's one line (6 Oct 2026):
 * "Toronto → Pisa", not "YYZ → PSA, FLR". The codes stay in the Kayak link.
 * The airports his journeys use and the big ones around them; anything else
 * shows its code, which is still right, only less friendly.
 */
const AIRPORT_CITY: Record<string, string> = {
  YYZ: "Toronto", YTZ: "Toronto", YHM: "Hamilton", YUL: "Montreal", YOW: "Ottawa", YVR: "Vancouver", YYC: "Calgary", YEG: "Edmonton", YHZ: "Halifax", YWG: "Winnipeg", YQB: "Quebec City",
  LGA: "New York", JFK: "New York", EWR: "Newark", BOS: "Boston", ORD: "Chicago", MDW: "Chicago", IAD: "Washington", DCA: "Washington", MIA: "Miami", FLL: "Fort Lauderdale", MCO: "Orlando", TPA: "Tampa",
  LAX: "Los Angeles", SFO: "San Francisco", SBA: "Santa Barbara", SAN: "San Diego", LAS: "Las Vegas", PSP: "Palm Springs", SEA: "Seattle", DEN: "Denver", PHX: "Phoenix", HNL: "Honolulu", OGG: "Maui", ATL: "Atlanta", DFW: "Dallas", IAH: "Houston",
  CUN: "Cancún", SJD: "Los Cabos", PVR: "Puerto Vallarta", MEX: "Mexico City", SJO: "San José", LIR: "Liberia", NAS: "Nassau", MBJ: "Montego Bay", PUJ: "Punta Cana", AUA: "Aruba", BGI: "Barbados",
  PSA: "Pisa", FLR: "Florence", FCO: "Rome", CIA: "Rome", MXP: "Milan", LIN: "Milan", VCE: "Venice", NAP: "Naples", BLQ: "Bologna", CTA: "Catania", PMO: "Palermo",
  LHR: "London", LGW: "London", STN: "London", LCY: "London", CDG: "Paris", ORY: "Paris", NCE: "Nice", MRS: "Marseille", BCN: "Barcelona", MAD: "Madrid", AGP: "Málaga", PMI: "Palma", LIS: "Lisbon", OPO: "Porto", FAO: "Faro",
  AMS: "Amsterdam", BRU: "Brussels", FRA: "Frankfurt", MUC: "Munich", BER: "Berlin", ZRH: "Zurich", GVA: "Geneva", VIE: "Vienna", PRG: "Prague", BUD: "Budapest", CPH: "Copenhagen", ARN: "Stockholm", OSL: "Oslo", KEF: "Reykjavík", DUB: "Dublin", EDI: "Edinburgh",
  ATH: "Athens", JTR: "Santorini", JMK: "Mykonos", DBV: "Dubrovnik", SPU: "Split", IST: "Istanbul", DXB: "Dubai", TLV: "Tel Aviv",
  NRT: "Tokyo", HND: "Tokyo", KIX: "Osaka", ITM: "Osaka", NGO: "Nagoya", FUK: "Fukuoka", CTS: "Sapporo", OKA: "Okinawa", KOJ: "Kagoshima", ICN: "Seoul", HKG: "Hong Kong", SIN: "Singapore", BKK: "Bangkok", DPS: "Bali",
  SYD: "Sydney", MEL: "Melbourne", BNE: "Brisbane", OOL: "Gold Coast", CNS: "Cairns", PER: "Perth", ADL: "Adelaide", AKL: "Auckland", ZQN: "Queenstown",
};
export function airportCity(code: string | null | undefined): string | null {
  return code && isIata(code) ? AIRPORT_CITY[code] ?? null : null;
}
