/**
 * Kayak search links for the To book checklist in Bookings (6 Oct 2026).
 *
 * Every shape here was checked by Brennan on kayak.com on 6 Oct 2026:
 *   flights  /flights/YYZ-PSA/2027-08-24/2027-09-04/4adults/children-10-8-5?sort=bestflight_a
 *            several arrival airports comma-joined: /flights/YYZ-FLR,PSA/…
 *   stays    /hotels/Lucca-Italy/2027-08-24/2027-09-04/4adults/3children-10-8-5/2rooms
 *   cars     /cars/PSA/2027-08-24-14h/2027-09-04-10h
 *
 * Three traps, all found live:
 *   - kayak.ca does not resolve on his network, so it is kayak.com for everyone.
 *   - a TOWN in a flight route is dropped silently: airports are IATA codes only.
 *   - a comma in a stay's place falls back to Kayak's generic stays page:
 *     "Lucca, Italy" must go as "Lucca-Italy".
 */

export const KAYAK = "https://www.kayak.com";

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
export function flightsUrl(o: { from: string | null; to: string[]; out: string; back: string; party: KayakParty }): string {
  const to = o.to.filter(isIata);
  if (!isIata(o.from) || !to.length) return `${KAYAK}/flights`;
  const kids = o.party.children.length ? `/children-${o.party.children.join("-")}` : "";
  return `${KAYAK}/flights/${o.from}-${to.join(",")}/${o.out}/${o.back}/${o.party.adults}adults${kids}?sort=bestflight_a`;
}

/** Stays in a town for a run of nights. One room is Kayak's default and is left out. */
export function staysUrl(o: { place: string; checkIn: string; checkOut: string; party: KayakParty }): string {
  if (!o.place) return `${KAYAK}/stays`;
  const k = o.party.children;
  const kids = k.length ? `/${k.length}children-${k.join("-")}` : "";
  const rooms = roomsFor(o.party);
  return `${KAYAK}/hotels/${o.place}/${o.checkIn}/${o.checkOut}/${o.party.adults}adults${kids}${rooms > 1 ? `/${rooms}rooms` : ""}`;
}

const hour = (h: number) => `${String(Math.min(23, Math.max(0, Math.round(h)))).padStart(2, "0")}h`;

/** A car from an airport (or a town) to the last morning. */
export function carsUrl(o: { at: string; pickUp: string; pickUpHour: number; dropOff: string; dropOffHour: number }): string {
  if (!o.at) return `${KAYAK}/cars`;
  return `${KAYAK}/cars/${o.at}/${o.pickUp}-${hour(o.pickUpHour)}/${o.dropOff}-${hour(o.dropOffHour)}`;
}
