// ── The listing link, with the journey already filled in ──────────────────
// Brennan, 10 Sept 2026: "when the website opens [make it] pre-populated with
// the number of people, the stay date, and all that stuff" — and, for the rows
// that come back with no price, "as soon as you go to the website, I guarantee
// we're going to be able to find the cost."
//
// So two exports. `bookingUrl` adds this journey's dates and party to a link
// we already have. `priceSearchUrl` is the net for a place that was never on a
// booking list at all — his own saved villas, and anything the map turned up —
// which is where every unpriced row on Tuscany came from.

export interface StayDates {
  checkIn: string;      // YYYY-MM-DD
  checkOut: string;
  adults: number;
  childrenAges: number[];
}

/** Every site keys the same four facts differently. */
const SITES: { test: RegExp; params: (d: StayDates) => [string, string][] }[] = [
  {
    test: /(^|\.)airbnb\./i,
    params: (d) => [
      ["check_in", d.checkIn], ["check_out", d.checkOut],
      ["adults", String(d.adults)], ["children", String(d.childrenAges.length)],
    ],
  },
  {
    test: /(^|\.)(vrbo|homeaway)\./i,
    params: (d) => [
      ["startDate", d.checkIn], ["endDate", d.checkOut],
      ["adults", String(d.adults + d.childrenAges.length)],
    ],
  },
  {
    test: /(^|\.)booking\.com$/i,
    params: (d) => [
      ["checkin", d.checkIn], ["checkout", d.checkOut],
      ["group_adults", String(d.adults)], ["group_children", String(d.childrenAges.length)],
      ...d.childrenAges.map((a) => ["age", String(a)] as [string, string]),
    ],
  },
  {
    test: /(^|\.)(expedia|hotels)\./i,
    params: (d) => [
      ["chkin", d.checkIn], ["chkout", d.checkOut],
      ["adults", String(d.adults)],
    ],
  },
  {
    test: /(^|\.)google\./i,
    params: (d) => [["checkin", d.checkIn], ["checkout", d.checkOut]],
  },
];

/**
 * The same link, carrying the journey's dates and party.
 * A host we do not know keeps its URL untouched — a wrong parameter is worse
 * than none, because it silently changes what the page shows.
 */
export function bookingUrl(url: string | null, d: StayDates): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return url; }
  const site = SITES.find((s) => s.test.test(u.hostname));
  if (!site) return url;
  for (const [k, v] of site.params(d)) {
    if (k === "age") u.searchParams.append(k, v);
    else u.searchParams.set(k, v);
  }
  return u.toString();
}

/** True when we know how to fill this host in. */
export function canPrefill(url: string | null): boolean {
  if (!url) return false;
  try { return SITES.some((s) => s.test.test(new URL(url).hostname)); } catch { return false; }
}

/**
 * Where to go looking when nobody quoted a price.
 *
 * Booking.com's search, because it is the one that actually honours the
 * journey: checked on 10 Sept 2026, it came back 'Sat 14 Aug — Sun 29 Aug,
 * 2 adults · 3 children · 1 room' in CAD. Google Travel's /travel/search
 * looks like the obvious choice and is NOT — it accepts checkin/checkout in
 * the URL, silently ignores them, and shows tonight for two people.
 */
export function priceSearchUrl(name: string, where: string | null, d: StayDates): string {
  const u = new URL("https://www.booking.com/searchresults.html");
  u.searchParams.set("ss", where ? `${name} ${where}` : name);
  u.searchParams.set("checkin", d.checkIn);
  u.searchParams.set("checkout", d.checkOut);
  u.searchParams.set("group_adults", String(d.adults));
  u.searchParams.set("group_children", String(d.childrenAges.length));
  for (const a of d.childrenAges) u.searchParams.append("age", String(a));
  return u.toString();
}

/**
 * The window the prices on screen are for.
 *
 * When the search had to roll the year (Japan 2028 priced off April 2027) the
 * link has to roll with it, or the page opens on dates showing a different
 * number from the card. Both ends move by the same whole years, so a journey
 * that straddles New Year still ends after it starts.
 */
export function shiftToYear(start: string, end: string, year: number | null): { start: string; end: string } {
  if (!year) return { start, end };
  const delta = year - Number(start.slice(0, 4));
  if (!delta) return { start, end };
  const roll = (d: string) => `${Number(d.slice(0, 4)) + delta}${d.slice(4)}`;
  return { start: roll(start), end: roll(end) };
}

/**
 * Why this row has no price.
 *
 * It must describe OUR search, never the property. "No price on a booking
 * site" was on La Serena Villas, which plainly is on booking sites, and read
 * as a statement about the villa (Brennan, 10 Sept 2026). By the time this
 * shows, the search has already asked for the place by name and come back
 * empty, so the true sentence is that no rate was found for these nights.
 */
export function noPriceReason(opts: {
  site: string | null;
  url: string | null;
  source: string | null;
  /** Did anything else in this run come back priced? Then the dates are fine. */
  othersPriced?: boolean;
  /** How many people we asked for. */
  party?: number | null;
}): string {
  const listed = opts.url && opts.site && opts.site !== "google";
  // Google prices for the party we ask about — two adults and three children —
  // and a property that cannot take them comes back with no price at all
  // (probed 10 Sept 2026: Holiday Inn Express priced for two and not for five).
  // So when the same run priced other places, the dates are quotable and this
  // one is the problem, not the calendar.
  if (listed && opts.othersPriced && opts.party) {
    return `No room for your ${opts.party} on these nights.`;
  }
  if (listed) return `No rate for these nights on ${siteLabel(opts.site)}.`;
  return "No rate found for these nights.";
}

function siteLabel(site: string | null): string {
  const names: Record<string, string> = { vrbo: "Vrbo", airbnb: "Airbnb", booking: "Booking.com", expedia: "Expedia", direct: "the site" };
  return names[site ?? ""] ?? "the site";
}
