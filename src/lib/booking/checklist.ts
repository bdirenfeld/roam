/**
 * The To book checklist at the top of Bookings (6 Oct 2026, mock approved):
 * three rows — Flights, Stays, Car — each booked, not needed, or open with a
 * Kayak search filled in.
 *
 * A row ticks itself when the journey already has it ON THE DAYS (uploaded or
 * added by hand): a flight card, hotels covering every night (lib/stays/stayRuns,
 * the one reader of which nights a hotel covers), a rental car's pick-up card
 * (lib/bookings/summary isRentalCar). Saved ideas that hold a day_id but are
 * "interested" never count — Japan's ryokans sit on day one that way. The
 * owner's own "Booked" / "Not needed" (trips.booking_checklist) wins over all
 * of it.
 */

import { stayRuns } from "@/lib/stays/stayRuns";
import { townFromAddress, countryFromAddress } from "@/lib/stays/brief";
import { isRentalCar, range } from "@/lib/bookings/summary";
import { cardTimes } from "@/lib/cardTime";
import { SYMBOL } from "@/lib/budget/currency";
import { airportCity, carsUrl, englishTown, flightsUrl, isIata, kayakParty, kayakPlace, staysUrl, travellers, twoCars, KAYAK, type KayakParty } from "./kayak";

export type RowKey = "flights" | "stays" | "car";
export type Choice = "booked" | "skip";
export type Checklist = Partial<Record<RowKey, Choice>>;
export const ROW_KEYS: RowKey[] = ["flights", "stays", "car"];
/**
 * What a row cost, typed when it was marked Booked by hand (6 Oct 2026). Stored
 * beside the choices: { stays: "booked", costs: { stays: { amount, currency } } }.
 * The budget counts it as real money (lib/budget/booked).
 */
export interface Cost { amount: number; currency: string }
export type Costs = Partial<Record<RowKey, Cost>>;

export interface CheckCard {
  id: string;
  day_id: string | null;
  place_id: string | null;
  status?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  details?: Record<string, unknown> | null;
  place?: { sub_type?: string | null; title?: string | null; address?: string | null } | null;
}

export interface CheckInput {
  trip: {
    destination: string;
    start_date: string;
    end_date: string;
    party_size: number | null;
    party_ages: number[] | null;
    booking_checklist?: Record<string, unknown> | null;
  };
  home: { airport: string | null; country: string | null };
  days: { id: string; date: string }[];
  cards: CheckCard[];
  /** people.birthdate, the fallback when the journey has no ages. */
  birthdates?: (string | null)[];
  /** Arrival airports from /api/booking/airports; null while not asked. */
  airports?: string[] | null;
}

export interface CheckRow {
  key: RowKey;
  title: string;
  line: string;
  state: "booked" | "skip" | "open";
  /** The owner's own choice, if any (the box menu shows "Clear" then). */
  manual: Choice | null;
  /** Kayak, when the row is open. */
  url: string | null;
  /** What a hand-marked Booked row cost, when it was typed. */
  cost: Cost | null;
  /** The day the row's booking sits on (a booked row with no file opens it). */
  dayId: string | null;
  /** The booking's own name: the airline, the hotel, the car company. */
  name: string | null;
}

const TITLES: Record<RowKey, string> = { flights: "Flights", stays: "Stays", car: "Car" };
const FLIGHT = new Set(["flight_arrival", "flight_departure"]);
const AWAY = new Set(["flight_arrival", "flight_departure", "transit"]);
const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(iso + "T12:00:00Z");
const addDays = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const peopleLine = (n: number) => plural(n, "person", "people");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${new Date(ms(iso)).getUTCDate()} ${MON[new Date(ms(iso)).getUTCMonth()]}`;

/** The owner's saved choices, cleaned: anything but "booked" / "skip" is ignored. */
export function readChecklist(raw: Record<string, unknown> | null | undefined): Checklist {
  const out: Checklist = {};
  for (const k of ROW_KEYS) {
    const v = raw?.[k];
    if (v === "booked" || v === "skip") out[k] = v;
  }
  return out;
}

/** The typed costs, cleaned: a positive amount and a three-letter currency. */
export function readCosts(raw: Record<string, unknown> | null | undefined): Costs {
  const out: Costs = {};
  const costs = raw?.costs as Record<string, unknown> | undefined;
  if (!costs || typeof costs !== "object") return out;
  for (const k of ROW_KEYS) {
    const c = costs[k] as { amount?: unknown; currency?: unknown } | undefined;
    const amount = typeof c?.amount === "number" ? c.amount : Number.NaN;
    const currency = typeof c?.currency === "string" ? c.currency.trim().toUpperCase() : "";
    if (Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(currency)) out[k] = { amount, currency };
  }
  return out;
}

/**
 * What goes in trips.booking_checklist: the choices, and a cost only for a row
 * still marked Booked (Not needed or Clear drops it). No "costs" key when empty.
 */
export function storeChecklist(choices: Checklist, costs: Costs): Record<string, unknown> {
  const out: Record<string, unknown> = { ...choices };
  const kept: Costs = {};
  for (const k of ROW_KEYS) if (choices[k] === "booked" && costs[k]) kept[k] = costs[k];
  if (Object.keys(kept).length) out.costs = kept;
  return out;
}

/** "€1,200", "$850", "US$90". */
export function costLabel(c: Cost): string {
  const sym = SYMBOL[c.currency] ?? `${c.currency} `;
  return `${sym}${Math.round(c.amount).toLocaleString("en-CA")}`;
}

/** The checklist with one row set (or cleared with null). */
export function withChoice(list: Checklist, key: RowKey, choice: Choice | null): Checklist {
  const next: Checklist = { ...list };
  if (choice) next[key] = choice; else delete next[key];
  return next;
}

/** On a day, and not a saved idea or a cut card. */
const onDays = (c: CheckCard, dayIds: Set<string>) => !!c.day_id && dayIds.has(c.day_id) && c.status !== "interested" && c.status !== "cut";

/** A code out of "LGA", or "Pisa International Airport (PSA)". */
function codeOf(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (/^[A-Z]{3}$/.test(s)) return s;
  const m = s.match(/\(([A-Z]{3})\)\s*$/);
  return m ? m[1] : null;
}

/** The people travelling: ages first, then birthdates at the start, then the head count. */
export function partyOf(input: Pick<CheckInput, "trip" | "birthdates">): KayakParty {
  const ages = input.trip.party_ages ?? [];
  if (ages.length) return kayakParty(ages, input.trip.party_size);
  const start = ms(input.trip.start_date);
  const fromPeople = (input.birthdates ?? [])
    .filter((b): b is string => !!b && /^\d{4}-\d{2}-\d{2}/.test(b))
    .map((b) => Math.floor((start - ms(b.slice(0, 10))) / (365.25 * DAY)));
  return kayakParty(fromPeople.length ? fromPeople : null, input.trip.party_size);
}

/** The last part of "Tuscany, Italy", or null when there is no comma to go on. */
export function destinationCountry(destination: string): string | null {
  const parts = destination.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

// Countries that share a flying day with each other. Kept small on purpose:
// the rule only has to tell a Toronto → New York hop from a Toronto → Pisa
// overnight.
const REGION: Record<string, string> = {};
for (const c of ["canada", "usa", "us", "united states", "united states of america", "mexico", "costa rica", "bahamas", "jamaica", "cuba", "dominican republic", "barbados", "aruba", "turks and caicos", "puerto rico", "belize", "panama", "guatemala"]) REGION[c] = "north america";
for (const c of ["italy", "france", "spain", "portugal", "uk", "united kingdom", "england", "scotland", "ireland", "germany", "netherlands", "belgium", "switzerland", "austria", "greece", "croatia", "romania", "denmark", "sweden", "norway", "iceland", "czechia", "czech republic", "hungary", "poland", "monaco"]) REGION[c] = "europe";

/**
 * Long-haul flights east leave the night before (6 Oct 2026). When the
 * journey has no flight cards and home and the destination are in different
 * countries — and not two countries of the same region (Canada and the US,
 * Italy and France) — the outbound search is the day before the journey
 * starts. Unknown on either side: no shift.
 */
export function overnightOutbound(homeCountry: string | null, destCountry: string | null): boolean {
  if (!homeCountry || !destCountry) return false;
  const a = homeCountry.trim().toLowerCase(), b = destCountry.trim().toLowerCase();
  if (a === b) return false;
  return !(REGION[a] && REGION[a] === REGION[b]);
}

/** The town most of these addresses are in. */
function townOf(addresses: (string | null | undefined)[]): { town: string; address: string } | null {
  const count = new Map<string, { n: number; address: string }>();
  for (const a of addresses) {
    const t = townFromAddress(a ?? null);
    if (!t) continue;
    const was = count.get(t);
    count.set(t, { n: (was?.n ?? 0) + 1, address: was?.address ?? a! });
  }
  let best: { town: string; address: string } | null = null, n = 0;
  count.forEach((v, t) => { if (v.n > n) { n = v.n; best = { town: t, address: v.address }; } });
  return best;
}

export function checklistRows(input: CheckInput): CheckRow[] {
  const { trip, home } = input;
  const manual = readChecklist(trip.booking_checklist);
  const costs = readCosts(trip.booking_checklist);
  const dayIds = new Set(input.days.map((d) => d.id));
  const dateOf = new Map(input.days.map((d) => [d.id, d.date]));
  const mine = input.cards.filter((c) => onDays(c, dayIds));
  const party = partyOf(input);
  const people = travellers(party);
  const homeAirport = isIata(home.airport) ? home.airport : null;
  const destCountry = destinationCountry(trip.destination);
  const destName = trip.destination.split(",")[0].trim() || trip.destination;

  // ── Flights on the days, by date ─────────────────────────────────────────
  const flights = mine
    .filter((c) => FLIGHT.has(c.place?.sub_type ?? ""))
    .map((c) => ({ c, date: dateOf.get(c.day_id!)! }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const own = ownAirports(input);
  const asked = (input.airports ?? []).filter(isIata);
  const airports = (own.length ? own : asked.filter((c) => c !== homeAirport)).slice(0, 3);

  const rows: CheckRow[] = [];
  // The mark says booked / to book / not needed, so the line never does: it
  // says where and how many (6 Oct 2026 redesign).
  const row = (key: RowKey, auto: { state: "booked" | "skip"; line: string } | null, open: { line: string; url: string }, at: { dayId: string | null; name: string | null }): CheckRow => {
    const m = manual[key] ?? null;
    const cost = m === "booked" ? costs[key] ?? null : null;
    const base = { key, title: TITLES[key], dayId: at.dayId, name: at.name };
    if (m) return { ...base, line: m === "booked" ? (cost ? `Paid ${costLabel(cost)}` : "Marked booked") : "Not needed", state: m, manual: m, url: null, cost };
    if (auto) return { ...base, line: auto.line, state: auto.state, manual: null, url: null, cost: null };
    return { ...base, line: open.line, state: "open", manual: null, url: open.url, cost: null };
  };

  // ── Flights ──────────────────────────────────────────────────────────────
  {
    const dates = Array.from(new Set(flights.map((f) => f.date)));
    const airline = flights.map(({ c }) => str(c.details?.airline)).find(Boolean) ?? null;
    const when = dates.length <= 2 ? dates.map(short).join(" and ") : `${flights.length} flights, ${range(dates[0], dates[dates.length - 1])}`;
    const auto = dates.length
      ? { state: "booked" as const, line: airline ? `${airline} · ${when}` : when }
      // Every airport Kayak could fly to is home: a journey from the doorstep.
      : !own.length && asked.length > 0 && !airports.length ? { state: "skip" as const, line: "Not needed" } : null;
    const out = overnightOutbound(home.country, destCountry) ? addDays(trip.start_date, -1) : trip.start_date;
    // City names, not the airport list: the codes stay in the Kayak link.
    const from = airportCity(homeAirport) ?? homeAirport;
    const to = airportCity(airports[0]) ?? airports[0] ?? destName;
    const open = !homeAirport
      ? { line: "Add your home airport in Profile", url: `${KAYAK}/flights` }
      : {
          line: `${from} → ${to} · ${peopleLine(people)}`,
          url: flightsUrl({ from: homeAirport, to: airports, out, back: trip.end_date, party }),
        };
    rows.push(row("flights", auto, open, { dayId: flights[0]?.c.day_id ?? null, name: airline }));
  }

  // ── Stays ────────────────────────────────────────────────────────────────
  {
    const nights: string[] = [];
    for (let d = trip.start_date; d < trip.end_date; d = addDays(d, 1)) nights.push(d);
    const runs = stayRuns(input.days.map((d) => ({ date: d.date, cards: mine.filter((c) => c.day_id === d.id) })), trip.end_date);
    const covered = new Set<string>();
    for (const r of runs) for (let d = r.checkIn; d < r.checkOut; d = addDays(d, 1)) covered.add(d);
    const open = nights.filter((n) => !covered.has(n));
    let auto: { state: "booked" | "skip"; line: string } | null = null;
    let openRow = { line: "", url: `${KAYAK}/stays` };
    if (!nights.length) auto = { state: "skip", line: "Not needed" };
    else if (!open.length) auto = { state: "booked", line: `${runs.length === 1 ? runs[0].title : `${runs.length} stays`} · all ${plural(nights.length, "night")}` };
    else {
      // The first run of open nights.
      const checkIn = open[0];
      let last = checkIn;
      while (open.includes(addDays(last, 1))) last = addDays(last, 1);
      const checkOut = addDays(last, 1);
      // Where: the town the first open night's plans are in, else the stay
      // next to the gap, else the destination.
      const dayId = input.days.find((d) => d.date === checkIn)?.id;
      const there = townOf(mine.filter((c) => c.day_id === dayId && !AWAY.has(c.place?.sub_type ?? "")).map((c) => c.place?.address));
      const addressOf = (placeId: string) => mine.find((c) => c.place_id === placeId)?.place?.address ?? null;
      const before = runs.filter((r) => r.checkOut <= checkIn).pop();
      const after = runs.find((r) => r.checkIn >= checkOut);
      const near = there ?? townOf([before ? addressOf(before.placeId) : null]) ?? townOf([after ? addressOf(after.placeId) : null]);
      const town = englishTown(near?.town ?? destName);
      const country = (near ? countryFromAddress(near.address) : null) ?? destCountry;
      // The plain English town, no country: "Florence-Italy" and "Lisboa-Portugal" opened the AIRPORT
      // on Kayak, "Florence" and "Lisbon" the city (tested live 6 Oct 2026). A region ("Tuscany") is
      // not a Kayak place and falls back to the stays page with dates and guests kept.
      void country;
      const url = staysUrl({ place: kayakPlace(englishTown(town)), checkIn, checkOut, party });
      openRow = covered.size
        ? { line: `${covered.size} of ${nights.length} nights booked`, url }
        : { line: `${town} · ${plural(nights.length, "night")}`, url };
    }
    const first = runs[0] ? mine.find((c) => c.id === runs[0].cardId) ?? null : null;
    rows.push(row("stays", auto, openRow, { dayId: first?.day_id ?? null, name: runs.length === 1 ? runs[0].title : null }));
  }

  // ── Car ──────────────────────────────────────────────────────────────────
  {
    const car = mine.find(isRentalCar);
    const carName = car ? str(car.place?.title) ?? str(car.details?.title) : null;
    const auto = car ? { state: "booked" as const, line: `${carName ?? "Rental car"} · ${range(dateOf.get(car.day_id!)!, str(car.details?.drop_off) ?? trip.end_date)}` } : null;
    // Picked up where the journey lands: two hours after a known landing, else 2 pm.
    const landing = flights.find(({ c }) => c.place?.sub_type === "flight_arrival" && codeOf(c.details?.arriving_at) !== homeAirport);
    const landAt = landing ? cardTimes({ start_time: landing.c.start_time ?? null, end_time: landing.c.end_time ?? null, details: landing.c.details ?? null, place: { sub_type: landing.c.place?.sub_type ?? null } }).start : null;
    const hm = landAt?.match(/^(\d{1,2}):(\d{2})/);
    const pickUpHour = hm ? Math.min(22, Number(hm[1]) + 2 + (Number(hm[2]) > 0 ? 1 : 0)) : 14;
    const pickUp = landing?.date ?? trip.start_date;
    const code = (landing ? codeOf(landing.c.details?.arriving_at) : null) ?? airports[0] ?? null;
    // No airport yet: the town the first day's plans are in ("Toronto & the GTA" is no place to Kayak).
    const firstDay = input.days.find((d) => d.date === pickUp)?.id;
    const town = townOf(mine.filter((c) => c.day_id === firstDay && !AWAY.has(c.place?.sub_type ?? "")).map((c) => c.place?.address))?.town ?? destName;
    const at = code ?? kayakPlace(englishTown(town));
    // Seats for the whole party (Kayak's filter); ten or more need two cars.
    rows.push(row("car", auto, {
      line: `${code ? `${airportCity(code) ?? code} airport` : englishTown(town)} · ${plural(people, "seat")}${twoCars(people) ? ", two cars" : ""}`,
      url: carsUrl({ at, pickUp, pickUpHour, dropOff: trip.end_date, dropOffHour: 10, people }),
    }, { dayId: car?.day_id ?? null, name: carName }));
  }
  return rows;
}

/**
 * The airports the journey's own flight cards name ("LGA", or "Pisa
 * International Airport (PSA)"), in date order, never the home airport.
 */
export function ownAirports(input: Pick<CheckInput, "home" | "days" | "cards">): string[] {
  const dayIds = new Set(input.days.map((d) => d.id));
  const dateOf = new Map(input.days.map((d) => [d.id, d.date]));
  const home = isIata(input.home.airport) ? input.home.airport : null;
  const out: string[] = [];
  input.cards
    .filter((c) => onDays(c, dayIds) && FLIGHT.has(c.place?.sub_type ?? ""))
    .sort((a, b) => dateOf.get(a.day_id!)!.localeCompare(dateOf.get(b.day_id!)!))
    .forEach((c) => {
      for (const v of [c.details?.arriving_at, c.details?.origin_airport]) {
        const code = codeOf(v);
        if (code && code !== home && !out.includes(code)) out.push(code);
      }
    });
  return out.slice(0, 3);
}

/**
 * Whether the sheet should ask /api/booking/airports: only while the Flights
 * or Car row is open, and only when the journey's own flights carry no codes.
 */
export function needsAirports(input: CheckInput): boolean {
  if (input.airports != null || ownAirports(input).length) return false;
  const rows = checklistRows({ ...input, airports: null });
  return rows.some((r) => (r.key === "flights" || r.key === "car") && r.state === "open");
}
