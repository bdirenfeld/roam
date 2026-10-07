/**
 * Real money in the budget (6 Oct 2026, Brennan's yes): what was actually paid
 * for flights, stays and the car, instead of the estimate.
 *
 * Two sources, both written by the app:
 *   - a card's `details.paid_total` + `paid_currency`, written when a booking
 *     confirmation is uploaded (lib/confirmations/toCards). Once per booking:
 *     the outbound flight leg, the hotel's check-in card, the car's pick-up
 *     card — never the check-out or drop-off card.
 *   - a typed cost on a row marked Booked by hand in To book
 *     (trips.booking_checklist.costs, lib/booking/checklist readCosts).
 * Both are added together for their line. Cards older than 6 Oct 2026 carry no
 * price; their line stays an estimate (the reader is never re-run on old
 * uploads — that spends Claude money).
 *
 * Stays can be partly booked: the paid nights are the nights of the hotel runs
 * (lib/stays/stayRuns, the one reader) whose check-in card carries a price;
 * every other night of the journey is still estimated at the nightly rate.
 */

import { stayRuns } from "@/lib/stays/stayRuns";
import { isRentalCar } from "@/lib/bookings/summary";
import { readChecklist, readCosts, type CheckCard, type Cost } from "@/lib/booking/checklist";
import { HOME_CURRENCY, referenceRateToHome } from "./currency";

export type Paid = Cost;

export interface BookedSpend {
  flights: Paid[];
  stays: Paid[];
  car: Paid[];
  /** Nights covered by a priced hotel (or every night, when Stays was marked Booked by hand). */
  nightsPaid: number;
  /** The journey's nights, from its dates. */
  nights: number;
}

/** In home currency, ready for the estimate. A line is absent when nothing was paid. */
export interface BookedHome {
  flights?: number;
  accommodation?: { paid: number; nightsPaid: number; nights: number };
  car?: number;
  /** Prices in a currency with no rate to hand; left out rather than guessed. */
  unconverted: number;
}

const FLIGHT = new Set(["flight_arrival", "flight_departure"]);
const DAY = 86_400_000;
const ms = (iso: string) => Date.parse(iso + "T12:00:00Z");
const addDays = (iso: string, n: number) => new Date(ms(iso) + n * DAY).toISOString().slice(0, 10);

/** A card's recorded price, if it has one. */
export function paidOf(details: Record<string, unknown> | null | undefined): Paid | null {
  const amount = details?.paid_total;
  const currency = details?.paid_currency;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  if (typeof currency !== "string" || !/^[A-Z]{3}$/.test(currency)) return null;
  return { amount, currency };
}

export function bookedSpend(input: {
  trip: { start_date: string; end_date: string; booking_checklist?: Record<string, unknown> | null };
  days: { id: string; date: string }[];
  cards: CheckCard[];
}): BookedSpend {
  const { trip } = input;
  const dayIds = new Set(input.days.map((d) => d.id));
  const dateOf = new Map(input.days.map((d) => [d.id, d.date]));
  const mine = input.cards.filter((c) => !!c.day_id && dayIds.has(c.day_id) && c.status !== "interested" && c.status !== "cut");
  const nights = Math.max(0, Math.round((ms(trip.end_date) - ms(trip.start_date)) / DAY));

  // One price per booking, even if a reader put it on two cards of it.
  const seen = new Set<string>();
  const once = (c: CheckCard): Paid | null => {
    const p = paidOf(c.details);
    if (!p) return null;
    const ref = typeof c.details?.confirmation === "string" && c.details.confirmation.trim() ? c.details.confirmation.trim() : c.id;
    const key = `${ref}|${p.amount}|${p.currency}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return p;
  };

  const flights: Paid[] = [];
  const stays: Paid[] = [];
  const car: Paid[] = [];
  const pricedHotels: { placeId: string | null; date: string }[] = [];
  for (const c of mine) {
    const sub = c.place?.sub_type ?? "";
    const kind = FLIGHT.has(sub) ? "flights" : sub === "hotel" ? "stays" : isRentalCar(c) ? "car" : null;
    if (!kind) continue;
    const p = once(c);
    if (!p) continue;
    if (kind === "flights") flights.push(p);
    else if (kind === "car") car.push(p);
    else { stays.push(p); pricedHotels.push({ placeId: c.place_id, date: dateOf.get(c.day_id!)! }); }
  }

  // Which nights the priced hotels cover.
  const runs = stayRuns(input.days.map((d) => ({ date: d.date, cards: mine.filter((c) => c.day_id === d.id) })), trip.end_date);
  const paidNights = new Set<string>();
  for (const r of runs) {
    if (!pricedHotels.some((h) => h.placeId === r.placeId && h.date >= r.checkIn && h.date < r.checkOut)) continue;
    for (let d = r.checkIn; d < r.checkOut; d = addDays(d, 1)) if (d >= trip.start_date && d < trip.end_date) paidNights.add(d);
  }

  // Booked by hand, with what it cost.
  const choices = readChecklist(trip.booking_checklist);
  const typed = readCosts(trip.booking_checklist);
  let nightsPaid = paidNights.size;
  if (choices.flights === "booked" && typed.flights) flights.push(typed.flights);
  if (choices.car === "booked" && typed.car) car.push(typed.car);
  if (choices.stays === "booked" && typed.stays) { stays.push(typed.stays); nightsPaid = nights; }

  return { flights, stays, car, nightsPaid: Math.min(nightsPaid, nights), nights };
}

/**
 * One price in home dollars, the way the estimate converts a card: home is 1,
 * the journey's own currency is the estimate's rate (typed, today's, or the
 * reference — whatever the screen shows), anything else the dated reference
 * table. Null when there is no rate at all.
 */
export function toHome(p: Paid, cardCurrency: string, fxToCad: number, home: string = HOME_CURRENCY): number | null {
  if (p.currency === home) return p.amount;
  if (p.currency === cardCurrency) return p.amount * fxToCad;
  const ref = referenceRateToHome(p.currency, home);
  return ref == null ? null : p.amount * ref;
}

export function bookedInHome(spend: BookedSpend | null | undefined, cardCurrency: string, fxToCad: number, home: string = HOME_CURRENCY): BookedHome {
  const out: BookedHome = { unconverted: 0 };
  if (!spend) return out;
  const sum = (ps: Paid[]): number | undefined => {
    let total = 0, any = false;
    for (const p of ps) {
      const v = toHome(p, cardCurrency, fxToCad, home);
      if (v == null) { out.unconverted += 1; continue; }
      total += v; any = true;
    }
    return any ? Math.round(total) : undefined;
  };
  const f = sum(spend.flights);
  if (f != null) out.flights = f;
  const s = sum(spend.stays);
  if (s != null) out.accommodation = { paid: s, nightsPaid: spend.nightsPaid, nights: spend.nights };
  const c = sum(spend.car);
  if (c != null) out.car = c;
  return out;
}
