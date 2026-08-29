// ── Climate profiles for wishlist destinations (Open-Meteo archive) ───────
// Lifted out of components/trips/YearView.tsx so the Year View and the Ideas
// screen share one implementation. Both add rows to wishlist_destinations and
// both need the same 12-month profile; two copies would drift.

import { computeMonthlyHci } from "@/lib/yearView/hci";

export interface MonthClimate {
  high: number; // mean daily max °C for the calendar month — what cells display
  rainShare: number; // share of days with ≥1mm precipitation, 0..1
  // Mean total precipitation for the calendar month (mm, averaged across
  // the archive years). Optional: wishlist rows stored before this field
  // existed lack it — treated as unknown, no wet-season marker.
  precipMm?: number;
  // HCI inputs (see lib/yearView/hci.ts) — optional for the same reason
  feelsMax?: number; // monthly mean daily apparent-temperature max, °C
  sunFrac?: number; // monthly mean sunshine/daylight fraction, 0..1
  windMax?: number; // monthly mean daily max wind, km/h (API default unit)
  hci?: number; // Holiday Climate Index score, 0–100
}

// Number of full archive years the aggregation spans
const CLIMATE_YEARS = 5;

const climateCache = new Map<string, MonthClimate[]>();

export async function fetchClimate(lat: number, lng: number): Promise<MonthClimate[]> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = climateCache.get(key);
  if (cached) return cached;

  const y = new Date().getFullYear();
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: `${y - CLIMATE_YEARS}-01-01`, // past N full years
    end_date: `${y - 1}-12-31`,
    daily:
      "temperature_2m_max,precipitation_sum,apparent_temperature_max,sunshine_duration,daylight_duration,wind_speed_10m_max",
    timezone: "auto",
  });
  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo archive responded ${res.status}`);
  const data = (await res.json()) as {
    daily: {
      time: string[];
      temperature_2m_max: (number | null)[];
      precipitation_sum: (number | null)[];
      apparent_temperature_max: (number | null)[];
      sunshine_duration: (number | null)[];
      daylight_duration: (number | null)[];
      wind_speed_10m_max: (number | null)[]; // km/h — the API's default unit
    };
  };

  const sum = Array(12).fill(0) as number[];
  const cnt = Array(12).fill(0) as number[];
  const rainy = Array(12).fill(0) as number[];
  const totalMm = Array(12).fill(0) as number[];
  const feelsSum = Array(12).fill(0) as number[];
  const feelsCnt = Array(12).fill(0) as number[];
  const sunSum = Array(12).fill(0) as number[];
  const sunCnt = Array(12).fill(0) as number[];
  const windSum = Array(12).fill(0) as number[];
  const windCnt = Array(12).fill(0) as number[];
  for (let i = 0; i < data.daily.time.length; i++) {
    const mi = Number(data.daily.time[i].slice(5, 7)) - 1;
    const t = data.daily.temperature_2m_max[i];
    if (t == null) continue;
    sum[mi] += t;
    cnt[mi] += 1;
    const mm = data.daily.precipitation_sum[i] ?? 0;
    totalMm[mi] += mm;
    if (mm >= 1) rainy[mi] += 1;
    const feels = data.daily.apparent_temperature_max[i];
    if (feels != null) {
      feelsSum[mi] += feels;
      feelsCnt[mi] += 1;
    }
    // Sunshine as a fraction of daylight (guarding polar-night zero days) —
    // the HCI aesthetic facet's cloud proxy
    const sunshine = data.daily.sunshine_duration[i];
    const daylight = data.daily.daylight_duration[i];
    if (sunshine != null && daylight != null && daylight > 0) {
      sunSum[mi] += Math.min(1, sunshine / daylight);
      sunCnt[mi] += 1;
    }
    const wind = data.daily.wind_speed_10m_max[i];
    if (wind != null) {
      windSum[mi] += wind;
      windCnt[mi] += 1;
    }
  }
  const result: MonthClimate[] = sum.map((s, mi) => {
    const profile: MonthClimate = {
      high: cnt[mi] > 0 ? Math.round(s / cnt[mi]) : 0,
      rainShare: cnt[mi] > 0 ? rainy[mi] / cnt[mi] : 1,
      precipMm: Math.round(totalMm[mi] / CLIMATE_YEARS),
      feelsMax: feelsCnt[mi] > 0 ? Math.round((feelsSum[mi] / feelsCnt[mi]) * 10) / 10 : undefined,
      sunFrac: sunCnt[mi] > 0 ? Math.round((sunSum[mi] / sunCnt[mi]) * 100) / 100 : undefined,
      windMax: windCnt[mi] > 0 ? Math.round((windSum[mi] / windCnt[mi]) * 10) / 10 : undefined,
    };
    const hci = computeMonthlyHci(profile);
    if (hci != null) profile.hci = hci;
    return profile;
  });
  climateCache.set(key, result);
  return result;
}

/** A wishlist row's second line: the tail of a formatted address, so
 *  "Tuscany, Italy" survives intact and a resort's street address collapses
 *  to "Town, Country" beside its own name. */
export function compactAddress(address: string, fallback: string): string {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts.slice(-2).join(", ");
}

/** Seed the cache from an already-stored profile, so picking a wishlist row
 *  that carries a complete one skips the archive fetch entirely. */
export function seedClimateCache(lat: number, lng: number, profile: MonthClimate[]): void {
  climateCache.set(`${lat.toFixed(2)},${lng.toFixed(2)}`, profile);
}
