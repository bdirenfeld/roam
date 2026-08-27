// ── Documented heavy insect seasons, by region ────────────────────────────
// Same honest-data pattern as stormSeasons: static config, coast/park-tight
// boxes, a source per entry. A matching destination gets a bug glyph on the
// season's months in the "Your year" heat row. Information only — never
// changes a month's tone.
//
// Boxes are [latMin, latMax, lngMin, lngMax] in decimal degrees.

export interface BugSeason {
  label: string; // shown in tooltips and the legend, includes the months
  months: number[]; // 1–12; all twelve = year-round nuisance
  boxes: [number, number, number, number][];
}

export const BUG_SEASONS: BugSeason[] = [
  {
    // Ontario Parks / Parks Canada visitor advisories: blackflies emerge
    // mid-May, mosquitoes overlap through late June in Shield country
    label: "Blackfly & mosquito season (May–Jun)",
    months: [5, 6],
    boxes: [
      [44.5, 46.6, -80.5, -77], // Muskoka, Algonquin, Kawarthas (Toronto stays south of 44.5)
      [45.7, 47.8, -76.5, -72.3], // Laurentians, Mont-Tremblant, La Mauricie (Montreal & Quebec City excluded)
      [46.5, 52, -90, -74], // Northern Ontario/Quebec Shield (Sudbury, Temagami, Chibougamau)
    ],
  },
  {
    // US Forest Service, Superior NF: Boundary Waters mosquito peak is June
    label: "Mosquito season (Jun)",
    months: [6],
    boxes: [
      [47.0, 49.0, -93.5, -89.5], // Boundary Waters / Ely / Gunflint Trail
    ],
  },
  {
    // VisitScotland: Highland midges are worst June through August
    label: "Midge season (Jun–Aug)",
    months: [6, 7, 8],
    boxes: [
      [56.0, 58.7, -6.5, -3.0], // Scottish Highlands + Skye (Edinburgh/Glasgow stay south)
    ],
  },
  {
    // Visit Finland / Swedish Lapland tourism: mosquito peak after midsummer,
    // late June through July
    label: "Mosquito season (late Jun–Jul)",
    months: [6, 7],
    boxes: [
      [65, 71, 14, 31], // Lapland — northern Norway, Sweden, Finland
    ],
  },
  {
    // NPS Denali visitor guidance: mosquitoes peak June–July
    label: "Mosquito season (Jun–Jul)",
    months: [6, 7],
    boxes: [
      [61, 68, -160, -140], // Alaska interior (Denali, Fairbanks)
      [60, 66, -141, -128], // Yukon
    ],
  },
  {
    // NPS Everglades: wet-season mosquitoes, roughly June–October
    label: "Mosquito season (Jun–Oct)",
    months: [6, 7, 8, 9, 10],
    boxes: [
      [24.8, 26.6, -81.8, -80.2], // Everglades + Ten Thousand Islands (Miami's coastal strip excluded)
    ],
  },
  {
    // Amazon river-basin travel guidance: insects year-round, worst in the
    // wet season, roughly December–May
    label: "Mosquito season (Dec–May)",
    months: [12, 1, 2, 3, 4, 5],
    boxes: [
      [-13, 2, -75, -50], // Amazon basin (Manaus, Iquitos, Madre de Dios)
    ],
  },
  {
    // NZ Department of Conservation: West Coast / Fiordland sandflies are a
    // year-round fixture
    label: "Sandflies (year-round)",
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    boxes: [
      [-46.5, -40.9, 166.3, 172.5], // South Island West Coast + Fiordland
    ],
  },
  {
    // Visit North Iceland: Mývatn ("midge lake") swarms peak June–July
    label: "Midge season (Jun–Jul)",
    months: [6, 7],
    boxes: [
      [65.4, 65.8, -17.2, -16.7], // Lake Mývatn area only
    ],
  },
];

export function bugSeasonFor(
  lat: number,
  lng: number
): { label: string; months: number[] } | null {
  for (const season of BUG_SEASONS) {
    for (const [latMin, latMax, lngMin, lngMax] of season.boxes) {
      if (lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax) {
        return { label: season.label, months: season.months };
      }
    }
  }
  return null;
}
