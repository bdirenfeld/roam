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
 * Today's rate: how many home dollars one unit of `from` buys. Frankfurter is
 * the ECB's reference rates, free and keyless. Null when it cannot be had —
 * the caller falls back to the last rate it knew. Cached for a day on the
 * server; in the browser a request a day is nothing.
 */
export async function fetchRateToHome(from: string): Promise<number | null> {
  if (!from || from === HOME) return 1;
  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), 4000) : null;
    const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${HOME}`, {
      signal: ctrl?.signal,
      next: { revalidate: 86400 },
    } as RequestInit);
    if (t) clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.[HOME];
    return typeof rate === "number" && rate > 0 ? Math.round(rate * 1000) / 1000 : null;
  } catch {
    return null;
  }
}
