// ── Where a person flies from, for the Budget's distance (7 Oct 2026) ─────
//
// The Budget's suggested fare is a distance band, and the distance was always
// measured from Toronto: a Londoner's Paris weekend came out long-haul. The
// origin is now the person's home airport (Profile, users.home_airport), else
// the main airport of their home country (users.home_country, then the
// passport), else Toronto — so a blank Profile behaves exactly as before.
//
// No coordinates live anywhere else in the app (lib/booking/kayak.ts only
// names cities), so this is a short table of the airports people actually
// live near, and one hub per country. Unknown codes fall through to the
// country, never to a guess.

import { HOME_CURRENCY, homeCountryName, homeCurrencyFor } from "./currency";

export interface HomeOrigin {
  lat: number;
  lng: number;
  /** "Toronto", "London" — the word after "km from". */
  label: string;
}

/** Roam began in Toronto: the origin when nothing says otherwise. */
export const TORONTO: HomeOrigin = { lat: 43.6532, lng: -79.3832, label: "Toronto" };

type Row = [number, number, string];

const AIRPORTS: Record<string, Row> = {
  // Canada
  // Toronto's airports measure from the city point the app always used, so
  // a Torontonian's distances do not move by the 20 km out to Pearson.
  YYZ: [43.6532, -79.3832, "Toronto"], YTZ: [43.6532, -79.3832, "Toronto"], YHM: [43.1736, -79.935, "Hamilton"],
  YUL: [45.4706, -73.7408, "Montreal"], YOW: [45.3225, -75.6692, "Ottawa"], YVR: [49.1947, -123.1792, "Vancouver"],
  YYC: [51.1215, -114.0076, "Calgary"], YEG: [53.3097, -113.58, "Edmonton"], YHZ: [44.8808, -63.5086, "Halifax"],
  YWG: [49.91, -97.2399, "Winnipeg"], YQB: [46.7911, -71.3933, "Quebec City"], YXE: [52.1708, -106.6997, "Saskatoon"],
  YQR: [50.4319, -104.6658, "Regina"], YYJ: [48.6469, -123.4258, "Victoria"], YXU: [43.0356, -81.1539, "London, Ontario"],
  // United States
  JFK: [40.6413, -73.7781, "New York"], LGA: [40.7769, -73.874, "New York"], EWR: [40.6895, -74.1745, "Newark"],
  BOS: [42.3656, -71.0096, "Boston"], ORD: [41.9742, -87.9073, "Chicago"], MDW: [41.7868, -87.7522, "Chicago"],
  IAD: [38.9531, -77.4565, "Washington"], DCA: [38.8512, -77.0402, "Washington"], BWI: [39.1754, -76.6684, "Baltimore"],
  PHL: [39.8744, -75.2424, "Philadelphia"], ATL: [33.6407, -84.4277, "Atlanta"], MIA: [25.7959, -80.287, "Miami"],
  FLL: [26.0742, -80.1506, "Fort Lauderdale"], MCO: [28.4312, -81.3081, "Orlando"], TPA: [27.9755, -82.5332, "Tampa"],
  CLT: [35.214, -80.9431, "Charlotte"], DTW: [42.2162, -83.3554, "Detroit"], MSP: [44.8848, -93.2223, "Minneapolis"],
  DFW: [32.8998, -97.0403, "Dallas"], IAH: [29.9902, -95.3368, "Houston"], AUS: [30.1975, -97.6664, "Austin"],
  DEN: [39.8561, -104.6737, "Denver"], PHX: [33.4342, -112.0116, "Phoenix"], LAS: [36.084, -115.1537, "Las Vegas"],
  LAX: [33.9416, -118.4085, "Los Angeles"], SFO: [37.6213, -122.379, "San Francisco"], SAN: [32.7338, -117.1933, "San Diego"],
  SEA: [47.4502, -122.3088, "Seattle"], PDX: [45.5898, -122.5951, "Portland"], SLC: [40.7899, -111.9791, "Salt Lake City"],
  BNA: [36.1263, -86.6774, "Nashville"], HNL: [21.3187, -157.9225, "Honolulu"],
  // Britain and Ireland
  LHR: [51.47, -0.4543, "London"], LGW: [51.1537, -0.1821, "London"], STN: [51.885, 0.235, "London"],
  LCY: [51.5048, 0.0495, "London"], LTN: [51.8747, -0.3683, "London"], MAN: [53.3537, -2.275, "Manchester"],
  BHX: [52.4539, -1.748, "Birmingham"], EDI: [55.95, -3.3725, "Edinburgh"], GLA: [55.8719, -4.4331, "Glasgow"],
  BRS: [51.3827, -2.7191, "Bristol"], DUB: [53.4264, -6.2499, "Dublin"],
  // Europe
  CDG: [49.0097, 2.5479, "Paris"], ORY: [48.7262, 2.3652, "Paris"], AMS: [52.3105, 4.7683, "Amsterdam"],
  FRA: [50.0379, 8.5622, "Frankfurt"], MUC: [48.3537, 11.775, "Munich"], BER: [52.3667, 13.5033, "Berlin"],
  ZRH: [47.4582, 8.5555, "Zurich"], GVA: [46.2381, 6.109, "Geneva"], VIE: [48.1103, 16.5697, "Vienna"],
  BRU: [50.901, 4.4844, "Brussels"], MAD: [40.4983, -3.5676, "Madrid"], BCN: [41.2974, 2.0833, "Barcelona"],
  LIS: [38.7742, -9.1342, "Lisbon"], FCO: [41.8003, 12.2389, "Rome"], MXP: [45.63, 8.7231, "Milan"],
  CPH: [55.618, 12.656, "Copenhagen"], ARN: [59.6498, 17.9238, "Stockholm"], OSL: [60.1976, 11.1004, "Oslo"],
  HEL: [60.3172, 24.9633, "Helsinki"], ATH: [37.9364, 23.9445, "Athens"], WAW: [52.1657, 20.9671, "Warsaw"],
  PRG: [50.1008, 14.26, "Prague"], BUD: [47.4369, 19.2556, "Budapest"],
  // Elsewhere
  SYD: [-33.9399, 151.1753, "Sydney"], MEL: [-37.669, 144.841, "Melbourne"], BNE: [-27.3842, 153.1175, "Brisbane"],
  PER: [-31.9385, 115.9672, "Perth"], AKL: [-37.0082, 174.785, "Auckland"], SIN: [1.3644, 103.9915, "Singapore"],
  HKG: [22.308, 113.9185, "Hong Kong"], NRT: [35.772, 140.3929, "Tokyo"], HND: [35.5494, 139.7798, "Tokyo"],
  ICN: [37.4602, 126.4407, "Seoul"], DXB: [25.2532, 55.3657, "Dubai"], TLV: [32.0055, 34.8854, "Tel Aviv"],
  BOM: [19.0896, 72.8656, "Mumbai"], DEL: [28.5562, 77.1, "Delhi"], JNB: [-26.1392, 28.246, "Johannesburg"],
  MEX: [19.4361, -99.0719, "Mexico City"], GRU: [-23.4356, -46.4731, "São Paulo"],
};

/** One hub per country, keyed by homeCountryName's lower-case name. */
const COUNTRY_HUB: Record<string, string> = {
  canada: "YYZ", "united states": "JFK", "united kingdom": "LHR", ireland: "DUB", france: "CDG",
  netherlands: "AMS", germany: "FRA", switzerland: "ZRH", austria: "VIE", belgium: "BRU", spain: "MAD",
  portugal: "LIS", italy: "FCO", denmark: "CPH", sweden: "ARN", norway: "OSL", finland: "HEL", greece: "ATH",
  poland: "WAW", czechia: "PRG", hungary: "BUD", australia: "SYD", "new zealand": "AKL", singapore: "SIN",
  "hong kong": "HKG", japan: "NRT", "south korea": "ICN", "united arab emirates": "DXB", israel: "TLV",
  india: "DEL", "south africa": "JNB", mexico: "MEX", brazil: "GRU",
};

const at = (r: Row): HomeOrigin => ({ lat: r[0], lng: r[1], label: r[2] });

/**
 * "YYZ", "yyz", "Toronto Pearson (YYZ)", "LHR - Heathrow" → the airport; also
 * a bare city name the table knows ("London"). Null when it reads as nothing.
 */
export function airportOrigin(raw: string | null | undefined): HomeOrigin | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const codes = s.length === 3 ? [s.toUpperCase()] : (s.match(/\b[A-Z]{3}\b/g) ?? []);
  for (const c of codes) if (AIRPORTS[c]) return at(AIRPORTS[c]);
  const lower = s.toLowerCase();
  const byCity = Object.values(AIRPORTS).find((r) => lower === r[2].toLowerCase() || lower.startsWith(r[2].toLowerCase() + " "));
  return byCity ? at(byCity) : null;
}

/**
 * Where this person's journeys start: home airport, then home country's hub,
 * then the passport's, then Toronto. Pass the Profile fields as stored.
 */
export function homeOriginFor(
  homeAirport: string | null | undefined,
  ...countries: (string | null | undefined)[]
): HomeOrigin {
  const a = airportOrigin(homeAirport);
  if (a) return a;
  for (const c of countries) {
    const name = homeCountryName(c);
    const hub = name ? COUNTRY_HUB[name] : null;
    if (hub && AIRPORTS[hub]) return at(AIRPORTS[hub]);
  }
  return TORONTO;
}

/**
 * The signed-in person's currency and origin, read once from `users`
 * (7 Oct 2026). Either Supabase client works. No id, no row, or an error:
 * CAD from Toronto, which is what everyone had before.
 */
export async function loadHomeProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string | null | undefined,
): Promise<{ currency: string; origin: HomeOrigin }> {
  if (!userId) return { currency: HOME_CURRENCY, origin: TORONTO };
  try {
    const { data } = await supabase.from("users").select("home_airport, home_country, passport_country").eq("id", userId).maybeSingle();
    const country = data?.home_country as string | null, passport = data?.passport_country as string | null;
    return { currency: homeCurrencyFor(country, passport), origin: homeOriginFor(data?.home_airport as string | null, country, passport) };
  } catch {
    return { currency: HOME_CURRENCY, origin: TORONTO };
  }
}
