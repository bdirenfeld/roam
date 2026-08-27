// ── Holiday Climate Index (HCI:Urban) ─────────────────────────────────────
// Scott, Rutty, Amelung & Tang (2016), "An Inter-Comparison of the Holiday
// Climate Index (HCI) and the Tourism Climate Index (TCI) in Europe",
// Atmosphere 7(6):80 — the published index for urban/sightseeing tourism:
//
//   HCI = 4·TC + 2·A + 3·P + 1·W          (0–100)
//
// Facet rating tables below are encoded from the reproduction of the Scott
// et al. scheme in Journal of Tourism Futures (Emerald, 2024;
// doi 10.1108/JTF-11-2024-0243, "Evaluation of the HCI:Urban … Sarajevo"),
// with the formula/weights cross-checked against the ECMWF Copernicus C3S
// "Climate Suitability for Tourism" dataset description (which implements
// this index). MDPI's site blocks automated access, so the original Table
// couldn't be read directly; rows marked [reproduction] carry that caveat,
// and the two low-wind rows marked [reconstructed] were garbled in the
// reproduction and rebuilt from the facet's documented shape (light breeze
// ideal at 10, calm slightly lower — mirroring the cloud facet's "few
// clouds beat none" pattern).
//
// Adaptations for our monthly profile (commented at each site):
//  - TC uses Open-Meteo's apparent_temperature_max (feels-like) as the
//    effective-temperature proxy.
//  - A (aesthetic) derives cloud % from sunshine fraction:
//    cloud ≈ (1 − sunshine/daylight)·100 — we don't store cloud cover.
//  - P uses mean mm/day derived from the monthly total (÷ 30.44).
//  - W uses the monthly mean of DAILY MAX wind (that's what we store), which
//    biases slightly windy — i.e. slightly conservative scores.

export interface HciProfileInput {
  feelsMax?: number; // monthly mean daily apparent-temperature max, °C
  sunFrac?: number; // monthly mean sunshine/daylight fraction, 0..1
  precipMm?: number; // monthly mean total precipitation, mm
  windMax?: number; // monthly mean daily max wind, km/h
}

// Thermal Comfort — feels-like °C → 0–10 [reproduction]
export function rateThermalComfort(t: number): number {
  if (t >= 39) return 0;
  if (t >= 37) return 2;
  if (t >= 35) return 4;
  if (t >= 33) return 5;
  if (t >= 31) return 6;
  if (t >= 29) return 7;
  if (t >= 27) return 8;
  if (t >= 26) return 9;
  if (t >= 23) return 10;
  if (t >= 20) return 9;
  if (t >= 18) return 7;
  if (t >= 15) return 6;
  if (t >= 11) return 5;
  if (t >= 7) return 4;
  if (t >= 0) return 3;
  if (t >= -6) return 2;
  return 1;
}

// Aesthetic — cloud cover % → 1–10 [reproduction]
// (a few clouds rate above a bare sky: 11–20% is the 10)
export function rateAesthetic(cloudPct: number): number {
  if (cloudPct < 1) return 8;
  if (cloudPct < 11) return 9;
  if (cloudPct < 21) return 10;
  if (cloudPct < 31) return 9;
  if (cloudPct < 41) return 8;
  if (cloudPct < 51) return 7;
  if (cloudPct < 61) return 6;
  if (cloudPct < 71) return 5;
  if (cloudPct < 81) return 4;
  if (cloudPct < 91) return 3;
  if (cloudPct < 100) return 2;
  return 1;
}

// Precipitation — mm/day → −1–10 [reproduction, negative row included]
export function ratePrecipitation(mmDay: number): number {
  if (mmDay <= 0) return 10;
  if (mmDay < 3) return 9;
  if (mmDay < 6) return 8;
  if (mmDay < 9) return 5;
  if (mmDay < 12) return 2;
  if (mmDay < 25) return 0;
  return -1;
}

// Wind — km/h → −10–10
export function rateWind(kmh: number): number {
  if (kmh < 1) return 8; // [reconstructed] calm
  if (kmh < 10) return 10; // [reconstructed] light breeze is the ideal
  if (kmh < 20) return 9; // [reproduction]
  if (kmh < 30) return 8; // [reproduction]
  if (kmh < 40) return 6; // [reproduction]
  if (kmh < 50) return 3; // [reproduction]
  if (kmh <= 70) return 0; // [reproduction]
  return -10; // [reproduction] — storm-force
}

// Full index from raw facet inputs. The paper's facets can go negative on
// extreme rain/wind; the total is clamped at 0 (a "negative holiday score"
// carries no extra meaning for us).
export function computeHci(input: {
  feelsMax: number;
  cloudPct: number;
  precipMmDay: number;
  windKmh: number;
}): number {
  const raw =
    4 * rateThermalComfort(input.feelsMax) +
    2 * rateAesthetic(input.cloudPct) +
    3 * ratePrecipitation(input.precipMmDay) +
    1 * rateWind(input.windKmh);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// Our monthly profile → HCI, or null when any needed field is missing
// (rows stored before these fields existed).
export function computeMonthlyHci(p: HciProfileInput): number | null {
  if (p.feelsMax == null || p.sunFrac == null || p.precipMm == null || p.windMax == null) {
    return null;
  }
  return computeHci({
    feelsMax: p.feelsMax,
    cloudPct: Math.max(0, Math.min(100, (1 - p.sunFrac) * 100)),
    precipMmDay: p.precipMm / 30.44, // mean month length; bands are coarse
    windKmh: p.windMax,
  });
}

// HCI → our four tones. Anchored on the paper's category scale (90–100
// ideal, 80–89 excellent, 70–79 very good, 60–69 good, 50–59 acceptable,
// 40–49 marginal, <40 unacceptable): great begins at "very good", good
// spans 55–69, fair covers the acceptable/marginal band, rough is the
// paper's unacceptable territory.
export function hciTone(hci: number): "great" | "good" | "fair" | "rough" {
  if (hci >= 70) return "great";
  if (hci >= 55) return "good";
  if (hci >= 40) return "fair";
  return "rough";
}
