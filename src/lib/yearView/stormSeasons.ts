// ── Official tropical storm seasons, by basin ─────────────────────────────
// Static, honest-numbers config for the "Your year" heat row: when a picked
// destination falls inside one of these coastal boxes, its season months get
// a storm glyph. This is a risk marker, not a forecast — it never changes a
// month's tone, and inland/out-of-basin places (Tuscany, Toronto) match
// nothing.
//
// Boxes are [latMin, latMax, lngMin, lngMax] in decimal degrees, drawn
// deliberately tight to the coastlines that actually see landfalls. Season
// dates are the official basin definitions (sources per entry).

export interface StormSeason {
  label: string; // shown in tooltips and the legend, includes the months
  months: number[]; // 1–12, calendar months inside the official season
  boxes: [number, number, number, number][];
}

export const STORM_SEASONS: StormSeason[] = [
  {
    // NOAA/NHC: Atlantic hurricane season, Jun 1 – Nov 30
    label: "Hurricane season (Jun–Nov)",
    months: [6, 7, 8, 9, 10, 11],
    boxes: [
      [9, 23, -89, -59], // Caribbean (Yucatán–Lesser Antilles)
      [18, 31, -98, -80], // Gulf of Mexico coasts
      [24, 42, -82, -58], // US East Coast + Bermuda (latMax 42 keeps Toronto/inland Ontario out)
    ],
  },
  {
    // NOAA/NHC: Eastern Pacific hurricane season, May 15 – Nov 30
    // (Central Pacific/Hawaii officially Jun 1 – Nov 30 — folded in here)
    label: "Hurricane season (May–Nov)",
    months: [5, 6, 7, 8, 9, 10, 11],
    boxes: [
      [12, 28, -118, -92], // Mexican Pacific coast (Los Cabos–Oaxaca)
      [18, 23, -161, -154], // Hawaiian islands
    ],
  },
  {
    // JMA: NW Pacific typhoons occur year-round; May–Oct is the main season
    label: "Typhoon season (May–Oct)",
    months: [5, 6, 7, 8, 9, 10],
    boxes: [
      [24, 41, 123, 146], // Japan
      [21.5, 25.5, 119.5, 122.5], // Taiwan
      [5, 19, 117, 127], // Philippines
      [18, 31, 105, 123], // SE China coast (Hainan–Shanghai)
      [8, 21, 104, 110], // Vietnam coast
    ],
  },
  {
    // IMD: North Indian Ocean cyclones peak pre-monsoon (Apr–Jun) and
    // post-monsoon (Sep–Dec)
    label: "Cyclone season (Apr–Jun, Sep–Dec)",
    months: [4, 5, 6, 9, 10, 11, 12],
    boxes: [
      [5, 23, 79, 95], // Bay of Bengal coasts (E India, Bangladesh, Myanmar, Sri Lanka)
      [5, 25, 60, 78], // Arabian Sea coasts (W India, Pakistan, Oman)
    ],
  },
  {
    // Météo-France La Réunion: SW Indian Ocean season, Nov 15 – Apr 30
    label: "Cyclone season (Nov–Apr)",
    months: [11, 12, 1, 2, 3, 4],
    boxes: [
      [-26, -11, 42, 51], // Madagascar
      [-22, -19, 54, 58.5], // Réunion + Mauritius
    ],
  },
  {
    // BoM / Fiji Met Service: Australian region + South Pacific season,
    // Nov 1 – Apr 30
    label: "Cyclone season (Nov–Apr)",
    months: [11, 12, 1, 2, 3, 4],
    boxes: [
      [-23, -10, 112, 153], // Northern Australia coast (Broome–Cairns)
      [-21, -12, 166, 180], // Vanuatu + Fiji
      [-22, -13, -177, -168], // Tonga + Samoa (east of the antimeridian)
    ],
  },
];

export function stormSeasonFor(
  lat: number,
  lng: number
): { label: string; months: number[] } | null {
  for (const season of STORM_SEASONS) {
    for (const [latMin, latMax, lngMin, lngMax] of season.boxes) {
      if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) {
        return { label: season.label, months: season.months };
      }
    }
  }
  return null;
}
