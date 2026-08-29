/**
 * Journey estimate — the costing model behind the Estimate screen.
 *
 * Nine lines, deliberately. The screen exists to let you assess a journey at a
 * glance and adjust the numbers, not to account for it — so every row is the
 * same shape, unit cost × count, and both are editable. Nothing is derived and
 * locked: the party size and the nights are seeded from the journey but can be
 * typed over, because changing them here is faster than navigating to Settings
 * to find out what they are.
 *
 * Two groups: the costs every journey carries, and the ones only some do.
 * Additional rows keep their numbers when unticked and simply drop out.
 *
 * Everything is in home currency. Excursions is seeded from the costed cards —
 * converted once, on the server, at the journey's stored rate — and is then an
 * ordinary editable number like every other line. That is the whole of the FX
 * story on this screen: one conversion, out of sight, on a figure you can
 * overwrite.
 *
 * Points are a single deduction rather than a per-line toggle. Card points are
 * fungible cash — they can cover part of a fare, all of it, or the villa — so a
 * tick on one row would force a false choice.
 */

export type Confidence = "quoted" | "estimated" | "placeholder";

/** The shape written onto `cards.details.budget` by the trip-planning skill. */
export interface CardBudget {
  amount: number;
  currency?: string;
  per?: "party" | "person";
  operator?: string;
  basis?: string;
  confidence?: Confidence;
}

export interface Assumptions {
  // Counts, seeded from the journey but editable here.
  people: number;
  nights: number;
  days: number;

  // Standard
  flightPerPerson: number;
  nightlyRate: number;
  groceriesPerDay: number;
  perMealOut: number;
  mealsOut: number;
  /** Seeded from the costed cards, then yours to overwrite. */
  excursionsTotal: number;

  // Additional
  carEnabled: boolean;
  carDayRate: number;
  dogEnabled: boolean;
  dogNightlyRate: number;
  dogNights: number;
  extrasEnabled: boolean;
  extrasPerDay: number;
  touristTaxEnabled: boolean;
  touristTaxPerNight: number;

  contingencyPct: number;
  /** Dollars covered by card points, deducted from the total. */
  pointsCredit: number;
}

export interface EstimateLine {
  key: string;
  label: string;
  group: "standard" | "additional";
  amount: number;
  unit: number;
  unitKey: keyof Assumptions;
  count: number;
  countKey: keyof Assumptions;
  /** Word after the count box — "people", "nights", "days". */
  countLabel: string;
  enabled: boolean;
  enabledKey?: keyof Assumptions;
  /** A flat sum: one editable figure, no × count. */
  lump?: boolean;
  /** Where a lump figure came from, shown where the count would be. */
  hint?: string;
}

export interface Estimate {
  lines: EstimateLine[];
  subtotal: number;
  contingency: number;
  pointsCredit: number;
  total: number;
  perPerson: number;
  perDay: number;
  uncostedExcursions: number;
  rolledExcursionCount: number;
}

const money = (n: number) => Math.round(n);

export function defaultAssumptions(
  partySize: number,
  nights: number,
): Assumptions {
  return {
    // Counts are true — they come from the journey. Prices are left unset:
    // a seeded price looks researched, anchors whatever you type next, and
    // months later reads as fact. The counts alone give each row its shape.
    people: partySize,
    nights,
    days: nights,

    flightPerPerson: 0,
    nightlyRate: 0,
    groceriesPerDay: 0,
    perMealOut: 0,
    mealsOut: Math.max(2, Math.round(nights / 3)),
    excursionsTotal: 0,

    // Smart rather than arbitrary: a multi-night journey almost always needs a
    // car and leaves the dog behind; tourist tax is destination-specific, so it
    // stays off until the traveller says otherwise.
    carEnabled: nights >= 2,
    carDayRate: 0,
    dogEnabled: nights >= 1,
    dogNightlyRate: 0,
    dogNights: nights + 1,
    extrasEnabled: true,
    extrasPerDay: 0,
    touristTaxEnabled: false,
    touristTaxPerNight: 0,

    contingencyPct: 10,
    pointsCredit: 0,
  };
}

/** Card budgets carry their own currency; this is the one place FX applies. */
export function cardBudgetToCad(
  b: CardBudget,
  partySize: number,
  fxToCad: number,
): number {
  const base = b.per === "person" ? b.amount * partySize : b.amount;
  const rate = !b.currency || b.currency === "CAD" ? 1 : fxToCad;
  return base * rate;
}

export function compute(
  a: Assumptions,
  opts: { uncostedExcursions: number; rolledExcursionCount: number },
): Estimate {
  const people = Math.max(a.people, 1);
  const days = Math.max(a.days, 1);

  const lines: EstimateLine[] = [
    {
      key: "flights",
      label: "Flights",
      group: "standard",
      amount: money(a.flightPerPerson * people),
      unit: a.flightPerPerson,
      unitKey: "flightPerPerson",
      count: a.people,
      countKey: "people",
      countLabel: "people",
      enabled: true,
    },
    {
      key: "accommodation",
      label: "Accommodation",
      group: "standard",
      amount: money(a.nightlyRate * a.nights),
      unit: a.nightlyRate,
      unitKey: "nightlyRate",
      count: a.nights,
      countKey: "nights",
      countLabel: "nights",
      enabled: true,
    },
    {
      key: "groceries",
      label: "Groceries",
      group: "standard",
      amount: money(a.groceriesPerDay * days),
      unit: a.groceriesPerDay,
      unitKey: "groceriesPerDay",
      count: a.days,
      countKey: "days",
      countLabel: "days",
      enabled: true,
    },
    {
      key: "restaurants",
      label: "Restaurants",
      group: "standard",
      amount: money(a.perMealOut * a.mealsOut),
      unit: a.perMealOut,
      unitKey: "perMealOut",
      count: a.mealsOut,
      countKey: "mealsOut",
      countLabel: "meals",
      enabled: true,
    },
    {
      key: "excursions",
      label: "Excursions",
      group: "standard",
      amount: money(a.excursionsTotal),
      unit: a.excursionsTotal,
      unitKey: "excursionsTotal",
      count: 0,
      countKey: "excursionsTotal",
      countLabel: "",
      enabled: true,
      lump: true,
      hint: opts.rolledExcursionCount
        ? `from ${opts.rolledExcursionCount} ${opts.rolledExcursionCount === 1 ? "card" : "cards"}`
        : undefined,
    },
    {
      key: "car",
      label: "Car hire",
      group: "additional",
      amount: money(a.carEnabled ? a.carDayRate * days : 0),
      unit: a.carDayRate,
      unitKey: "carDayRate",
      count: a.days,
      countKey: "days",
      countLabel: "days",
      enabled: a.carEnabled,
      enabledKey: "carEnabled",
    },
    {
      key: "dog",
      label: "Finn",
      group: "additional",
      amount: money(a.dogEnabled ? a.dogNightlyRate * a.dogNights : 0),
      unit: a.dogNightlyRate,
      unitKey: "dogNightlyRate",
      count: a.dogNights,
      countKey: "dogNights",
      countLabel: "nights",
      enabled: a.dogEnabled,
      enabledKey: "dogEnabled",
    },
    {
      key: "extras",
      label: "Gifts",
      group: "additional",
      amount: money(a.extrasEnabled ? a.extrasPerDay * days : 0),
      unit: a.extrasPerDay,
      unitKey: "extrasPerDay",
      count: a.days,
      countKey: "days",
      countLabel: "days",
      enabled: a.extrasEnabled,
      enabledKey: "extrasEnabled",
    },
    {
      key: "touristTax",
      label: "Tourist tax",
      group: "additional",
      amount: money(a.touristTaxEnabled ? a.touristTaxPerNight * a.nights : 0),
      unit: a.touristTaxPerNight,
      unitKey: "touristTaxPerNight",
      count: a.nights,
      countKey: "nights",
      countLabel: "nights",
      enabled: a.touristTaxEnabled,
      enabledKey: "touristTaxEnabled",
    },
  ];

  const subtotal = lines.reduce((s, l) => s + (l.enabled ? l.amount : 0), 0);
  const contingency = money((subtotal * a.contingencyPct) / 100);
  // Points can't take the journey below zero, however good the redemption.
  const pointsCredit = Math.min(Math.max(a.pointsCredit, 0), subtotal + contingency);
  const total = subtotal + contingency - pointsCredit;

  return {
    lines,
    subtotal,
    contingency,
    pointsCredit,
    total,
    perPerson: money(total / people),
    perDay: money(total / days),
    uncostedExcursions: opts.uncostedExcursions,
    rolledExcursionCount: opts.rolledExcursionCount,
  };
}

/* ------------------------------------------------------------------ *
 * Suggestion
 *
 * Structure comes from the journey — distance, party size, nights, season.
 * The rates are priors: reasonable mid-market figures, not quotes. Each one
 * returns the basis it was derived from so the screen can answer "how did you
 * get that" months later.
 * ------------------------------------------------------------------ */

export interface Suggestion {
  values: Partial<Assumptions>;
  basis: Record<string, string>;
}

export const HOME = { lat: 43.6532, lng: -79.3832 }; // Toronto

export function greatCircleKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const r = Math.PI / 180;
  return Math.round(
    Math.acos(
      Math.min(
        1,
        Math.sin(aLat * r) * Math.sin(bLat * r) +
          Math.cos(aLat * r) * Math.cos(bLat * r) * Math.cos((bLng - aLng) * r),
      ),
    ) * 6371,
  );
}

const near = (n: number, to: number) => Math.round(n / to) * to;

export function suggest(
  a: Assumptions,
  ctx: { distanceKm: number; peak: boolean },
): Suggestion {
  const people = Math.max(a.people, 1);
  const km = ctx.distanceKm;

  const band =
    km < 800 ? 240 : km < 2500 ? 480 : km < 6000 ? 880 : km < 10000 ? 1050 : 1500;
  const bandName =
    km < 800 ? "short-haul" : km < 2500 ? "medium-haul" : km < 6000 ? "long-haul" : km < 10000 ? "long-haul" : "ultra-long-haul";
  const fare = near(band * (ctx.peak ? 1.15 : 1), 10);
  const bedrooms = Math.max(1, Math.ceil(people / 2));
  const vehicles = people > 5 ? 2 : 1;

  return {
    values: {
      flightPerPerson: fare,
      nightlyRate: near(150 + bedrooms * 110, 10),
      groceriesPerDay: near(22 * people, 10),
      perMealOut: near(57 * people, 10),
      carDayRate: near(vehicles * 105, 10),
      dogNightlyRate: 75,
      extrasPerDay: near(9 * people, 10),
      touristTaxPerNight: near(3 * people, 1),
    },
    basis: {
      flights: `${km.toLocaleString("en-CA")} km from Toronto · ${bandName}${ctx.peak ? " · +15% peak season" : ""}`,
      accommodation: `${people} people needs ${bedrooms} bedrooms`,
      groceries: `$22 per person per day × ${people}`,
      restaurants: `$57 a head × ${people}`,
      car: `${vehicles} ${vehicles === 1 ? "vehicle" : "vehicles"} · includes fuel and tolls`,
      dog: `boarding rate · ${a.dogNights} nights`,
      extras: `$9 per person per day × ${people}`,
      touristTax: `$3 per person per night × ${people}`,
    },
  };
}
