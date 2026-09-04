// ── Which currency a journey's cards are priced in, and today's rate ──────
//
// The journey says where it goes ("Tuscany, Italy"); the country says the
// currency; a free public source says the rate. The Estimate converts card
// costs at that rate unless the traveller typed one (Brennan, Sep 2026:
// "is the app smart enough to know it's in euros and convert it?").

const HOME = "CAD";
export const HOME_CURRENCY = HOME;

const BY_COUNTRY: Record<string, string> = {
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
  chile: "CLP", peru: "PEN", colombia: "COP", "costa rica": "CRC", "hong kong": "HKD", china: "CNY",
  "south korea": "KRW", korea: "KRW", philippines: "PHP", malaysia: "MYR",
};

/** "Tuscany, Italy" → "EUR"; unknown → null. Looks at every comma part. */
export function currencyForDestination(destination: string | null | undefined): string | null {
  if (!destination) return null;
  const parts = destination.toLowerCase().split(",").map((s) => s.trim()).reverse();
  for (const part of parts) {
    if (BY_COUNTRY[part]) return BY_COUNTRY[part];
  }
  return null;
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

export function referenceRateToHome(from: string): number | null {
  if (!from || from === HOME) return 1;
  return REFERENCE_RATES[from] ?? null;
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
export async function fetchRateToHome(from: string): Promise<number | null> {
  if (!from || from === HOME) return 1;
  const clean = (r: unknown) => (typeof r === "number" && r > 0 ? Math.round(r * 1000) / 1000 : null);

  const a = await getJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`, 4000);
  const ra = clean((a?.rates as Record<string, number> | undefined)?.[HOME]);
  if (ra != null) return ra;

  const b = await getJson(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${HOME}`, 4000);
  return clean((b?.rates as Record<string, number> | undefined)?.[HOME]);
}
