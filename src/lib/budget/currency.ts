// ── Which currency a journey's cards are priced in, and today's rate ──────
//
// The journey says where it goes ("Tuscany, Italy"); the country says the
// currency; a free public source says the rate. The Estimate converts card
// costs at that rate unless the traveller typed one (Brennan, Sep 2026:
// "is the app smart enough to know it's in euros and convert it?").

import { COUNTRIES } from "@/lib/countries";

/** The default when nobody has said where they live: Roam began in Toronto. */
const HOME = "CAD";
export const HOME_CURRENCY = HOME;

const BY_COUNTRY: Record<string, string> = {
  // Regions that are one currency, or mostly (27 Sep 2026): a summer across
  // "Europe" priced its excursions in dollars. The British Isles and
  // Scandinavia are not the euro; they stay unset rather than guessed.
  europe: "EUR", "western europe": "EUR", "the mediterranean": "EUR", "the alps": "EUR",
  "southeast asia": "USD", "central america": "USD", "the caribbean": "USD",
  // Euro area
  italy: "EUR", france: "EUR", spain: "EUR", portugal: "EUR", germany: "EUR", netherlands: "EUR",
  belgium: "EUR", austria: "EUR", ireland: "EUR", greece: "EUR", finland: "EUR", croatia: "EUR",
  slovenia: "EUR", slovakia: "EUR", estonia: "EUR", latvia: "EUR", lithuania: "EUR", luxembourg: "EUR",
  malta: "EUR", cyprus: "EUR", montenegro: "EUR",
  // Others
  "united states": "USD", usa: "USD", "u.s.": "USD", mexico: "MXN", "united kingdom": "GBP", uk: "GBP",
  england: "GBP", scotland: "GBP", wales: "GBP", switzerland: "CHF", japan: "JPY", australia: "AUD",
  "new zealand": "NZD", canada: "CAD", denmark: "DKK", sweden: "SEK", norway: "NOK", iceland: "ISK",
  czechia: "CZK", "czech republic": "CZK", poland: "PLN", hungary: "HUF", turkey: "TRY", thailand: "THB",
  vietnam: "VND", indonesia: "IDR", singapore: "SGD", india: "INR", "south africa": "ZAR", morocco: "MAD",
  "united arab emirates": "AED", dubai: "AED", israel: "ILS", brazil: "BRL", argentina: "ARS",
  chile: "CLP", peru: "PEN", colombia: "COP", "hong kong": "HKD", china: "CNY",
  // Countries where what a traveller buys is priced in US dollars, whatever
  // the local unit. Costa Rica's tours and parks quote in USD, not colones.
  "costa rica": "USD", panama: "USD", ecuador: "USD", belize: "USD", cambodia: "USD", "el salvador": "USD",
  "puerto rico": "USD", bahamas: "USD",
  "south korea": "KRW", korea: "KRW", philippines: "PHP", malaysia: "MYR",
};

/** "Tuscany, Italy" → "EUR"; unknown → null. Looks at every comma part. */
export function currencyForDestination(destination: string | null | undefined): string | null {
  if (!destination) return null;
  // Home first: "Toronto & the GTA" has no comma and no country.
  if (/\b(toronto|ontario|gta|canada|ontario|quebec|montr[eé]al|vancouver|muskoka)\b/i.test(destination)) return HOME;
  const parts = destination.toLowerCase().split(",").map((s) => s.trim()).reverse();
  for (const part of parts) {
    if (BY_COUNTRY[part]) return BY_COUNTRY[part];
  }
  return null;
}

/**
 * What people type for where they live, beyond a country's own name
 * (6 Oct 2026): codes, "America", "Britain". Demonyms ("Canadian",
 * "American") come from lib/countries, since a passport is often typed that way.
 */
const COUNTRY_ALIASES: Record<string, string> = {
  ca: "canada", us: "united states", usa: "united states", "u.s.": "united states", "u.s.a.": "united states",
  america: "united states", "united states of america": "united states", "the united states": "united states",
  uk: "united kingdom", "u.k.": "united kingdom", gb: "united kingdom", britain: "united kingdom",
  "great britain": "united kingdom", england: "united kingdom", scotland: "united kingdom", wales: "united kingdom",
  "northern ireland": "united kingdom", au: "australia", nz: "new zealand", ie: "ireland", "republic of ireland": "ireland",
  fr: "france", de: "germany", it: "italy", es: "spain", nl: "netherlands", "the netherlands": "netherlands",
  holland: "netherlands", ch: "switzerland", mx: "mexico", jp: "japan", in: "india", uae: "united arab emirates",
  korea: "south korea", "republic of korea": "south korea", "czech republic": "czechia",
};

/**
 * Where someone lives, as typed in Profile ("Canada", "USA", "Canadian",
 * "Toronto, Canada"), to one lower-case country name; null when it reads as
 * nothing known. Shared by the home currency and the Kayak site.
 */
export function homeCountryName(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const parts = raw.toLowerCase().split(",").map((s) => s.trim()).filter(Boolean).reverse();
  for (const p of parts) {
    if (COUNTRY_ALIASES[p]) return COUNTRY_ALIASES[p];
    const c = COUNTRIES.find((x) => x.name.toLowerCase() === p || x.demonym.toLowerCase() === p);
    if (c) return COUNTRY_ALIASES[c.name.toLowerCase()] ?? c.name.toLowerCase();
    if (BY_COUNTRY[p]) return p;
  }
  if (/(toronto|ontario|gta|quebec|montr[eé]al|vancouver)/i.test(raw)) return "canada";
  return null;
}

/**
 * The currency a person's own money is in (6 Oct 2026, Brennan: "based on
 * the passport and the person's home country … that's the currency they get
 * the pricing in"): Profile's home country first, then the passport, then
 * CAD. Pass them in that order; the first one that names a currency wins.
 */
export function homeCurrencyFor(...countries: (string | null | undefined)[]): string {
  for (const c of countries) {
    const name = homeCountryName(c);
    if (name && BY_COUNTRY[name]) return BY_COUNTRY[name];
  }
  return HOME;
}

/**
 * The signed-in person's home currency, read once from `users`. Either
 * Supabase client works. No id, or no row: CAD.
 */
export async function loadHomeCurrency(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) return HOME;
  try {
    const { data } = await supabase.from("users").select("home_country, passport_country").eq("id", userId).maybeSingle();
    return homeCurrencyFor(data?.home_country as string | null, data?.passport_country as string | null);
  } catch {
    return HOME;
  }
}

export const SYMBOL: Record<string, string> = {
  CAD: "$", USD: "US$", EUR: "€", GBP: "£", JPY: "¥", CHF: "CHF ", AUD: "A$", NZD: "NZ$", MXN: "MX$",
  DKK: "kr ", SEK: "kr ", NOK: "kr ", ISK: "kr ", CZK: "Kč ", PLN: "zł ", HUF: "Ft ", TRY: "₺", THB: "฿",
  VND: "₫", IDR: "Rp ", SGD: "S$", INR: "₹", ZAR: "R ", MAD: "MAD ", AED: "AED ", ILS: "₪", BRL: "R$",
  ARS: "AR$", CLP: "CL$", PEN: "S/ ", COP: "CO$", CRC: "₡", HKD: "HK$", CNY: "¥", KRW: "₩", PHP: "₱", MYR: "RM ",
};

/**
 * Reference rates to the dollar, refreshed by hand now and then — the floor
 * under the live fetch, so a network miss never shows a made-up number. The
 * month is shown to the traveller so they know what they are looking at.
 */
export const REFERENCE_MONTH = "September 2026";
const REFERENCE_RATES: Record<string, number> = {
  USD: 1.379, EUR: 1.603, GBP: 1.865, JPY: 0.009, MXN: 0.081, AUD: 0.993, NZD: 0.811, CHF: 1.707,
  THB: 0.042, INR: 0.015, AED: 0.376, CRC: 0.003, DOP: 0.024, JMD: 0.009, BRL: 0.271, CLP: 0.001,
  PEN: 0.411, ZAR: 0.086, MAD: 0.148, EGP: 0.027, TRY: 0.028, ISK: 0.011, NOK: 0.148, SEK: 0.144,
  DKK: 0.214, CZK: 0.066, HUF: 0.004, PLN: 0.371, KRW: 0.001, SGD: 1.088, HKD: 0.176, TWD: 0.044,
  PHP: 0.022, MYR: 0.341, CNY: 0.205, ILS: 0.41, VND: 0.00005, IDR: 0.00008, COP: 0.00033, ARS: 0.001,
};

/**
 * How a person's own money is written: a plain "$" for every dollar country
 * (an American reads "$", not "US$"), otherwise the currency's own sign.
 */
export function homeSymbol(home: string): string {
  if (["CAD", "USD", "AUD", "NZD", "SGD", "HKD"].includes(home)) return "$";
  return SYMBOL[home] ?? `${home} `;
}

/** "dollars", "pounds", "euros" — the word in "1.6 dollars per euro". */
export function unitName(code: string): string {
  if (/^(CAD|USD|AUD|NZD|SGD|HKD|MXN)$/.test(code)) return "dollars";
  const words: Record<string, string> = { GBP: "pounds", EUR: "euros", JPY: "yen", CHF: "francs", INR: "rupees", ZAR: "rand" };
  return words[code] ?? code;
}

/**
 * The table's rate from `from` to `home`. The table is quoted against the
 * Canadian dollar, so any other home divides through it.
 */
export function referenceRateToHome(from: string, home: string = HOME): number | null {
  if (!from || from === home) return 1;
  const toCad = (c: string) => (c === HOME ? 1 : REFERENCE_RATES[c] ?? null);
  const a = toCad(from), b = toCad(home);
  if (a == null || b == null) return null;
  return a / b;
}

async function getJson(url: string, ms: number): Promise<Record<string, unknown> | null> {
  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
    const res = await fetch(url, { signal: ctrl?.signal, next: { revalidate: 3600 } } as RequestInit);
    if (t) clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Today's rate: how many home dollars one unit of `from` buys. Two free,
 * keyless sources, tried in turn — exchangerate-api's open feed (daily, most
 * currencies) then Frankfurter (the ECB's reference rates, on its current
 * host; the old api.frankfurter.app now only redirects). Null when neither
 * answers; the caller then uses the reference table, and says so.
 * Cached an hour on the server.
 */
export async function fetchRateToHome(from: string, home: string = HOME): Promise<number | null> {
  if (!from || from === home) return 1;
  const clean = (r: unknown) => (typeof r === "number" && r > 0 ? Math.round(r * 1000) / 1000 : null);

  const a = await getJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`, 4000);
  const ra = clean((a?.rates as Record<string, number> | undefined)?.[home]);
  if (ra != null) return ra;

  const b = await getJson(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${home}`, 4000);
  return clean((b?.rates as Record<string, number> | undefined)?.[home]);
}

/**
 * Cities where a visitor rides the metro, not a rental car. Car hire starts
 * off for these; the toggle is one tap. Matched on the destination text.
 */
const METRO_CITIES = /\b(tokyo|osaka|london|paris|new york|nyc|manhattan|rome|roma|barcelona|madrid|berlin|amsterdam|hong kong|singapore|seoul|taipei|shanghai|beijing|mexico city|chicago|boston|washington|montr[eé]al|vienna|prague|lisbon|milan|munich|copenhagen|stockholm|oslo|budapest|istanbul|athens|buenos aires|s[aã]o paulo|kuala lumpur|bangkok|delhi|mumbai)\b/i;
export function isMetroCity(destination: string | null | undefined): boolean {
  return !!destination && METRO_CITIES.test(destination);
}
