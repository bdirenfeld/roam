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
 * Two groups: things that happen on every trip, and things that might. Optional
 * rows keep their numbers when unticked and simply drop out of the total.
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

  // Every trip
  flightPerPerson: number;
  nightlyRate: number;
  groceriesPerDay: number;
  perMealOut: number;
  mealsOut: number;
  /** null = use the roll-up from costed cards. */
  excursionsOverride: number | null;

  // Might happen
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
  group: "always" | "optional";
  amount: number;
  unit: number;
  unitKey: keyof Assumptions;
  count: number;
  countKey: keyof Assumptions;
  /** Word after the count box — "people", "nights", "days". */
  countLabel: string;
  enabled: boolean;
  enabledKey?: keyof Assumptions;
  /** Excursions is the one row you don't type into — it comes from the cards. */
  readOnly?: boolean;
  unitDisplay?: string;
  note?: string;
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
    people: partySize,
    nights,
    days: nights,

    flightPerPerson: 1370,
    nightlyRate: 650,
    groceriesPerDay: 145,
    perMealOut: 60 * Math.max(partySize, 1),
    mealsOut: Math.max(2, Math.round(nights / 3)),
    excursionsOverride: null,

    // Smart rather than arbitrary: a multi-night journey almost always needs a
    // car and leaves the dog behind; tourist tax is destination-specific, so it
    // stays off until the traveller says otherwise.
    carEnabled: nights >= 2,
    carDayRate: 210,
    dogEnabled: nights >= 1,
    dogNightlyRate: 75,
    dogNights: nights + 1,
    extrasEnabled: true,
    extrasPerDay: 60,
    touristTaxEnabled: false,
    touristTaxPerNight: 3 * Math.max(partySize, 1),

    contingencyPct: 10,
    pointsCredit: 0,
  };
}

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
  opts: {
    cardBudgets: CardBudget[];
    uncostedExcursions: number;
    fxToCad: number;
  },
): Estimate {
  const { cardBudgets, fxToCad } = opts;
  const people = Math.max(a.people, 1);
  const days = Math.max(a.days, 1);

  const rolled = cardBudgets.reduce(
    (s, b) => s + cardBudgetToCad(b, people, fxToCad),
    0,
  );
  const foreign = cardBudgets.find((b) => b.currency && b.currency !== "CAD");
  const rawForeign = cardBudgets.reduce(
    (s, b) => s + (b.per === "person" ? b.amount * people : b.amount),
    0,
  );
  const excursions = a.excursionsOverride != null ? a.excursionsOverride : rolled;

  const raw: EstimateLine[] = [
    {
      key: "flights",
      label: "Flights",
      group: "always",
      amount: a.flightPerPerson * people,
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
      group: "always",
      amount: a.nightlyRate * a.nights,
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
      group: "always",
      amount: a.groceriesPerDay * days,
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
      group: "always",
      amount: a.perMealOut * a.mealsOut,
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
      group: "always",
      amount: excursions,
      unit: excursions,
      unitKey: "excursionsOverride",
      count: cardBudgets.length,
      countKey: "excursionsOverride",
      countLabel: cardBudgets.length === 1 ? "card" : "cards",
      enabled: true,
      readOnly: a.excursionsOverride == null,
      unitDisplay:
        a.excursionsOverride == null && foreign
          ? `${foreign.currency === "EUR" ? "€" : ""}${money(rawForeign)}`
          : undefined,
    },
    {
      key: "car",
      label: "Car hire",
      group: "optional",
      amount: a.carEnabled ? a.carDayRate * days : 0,
      unit: a.carDayRate,
      unitKey: "carDayRate",
      count: a.days,
      countKey: "days",
      countLabel: "days",
      enabled: a.carEnabled,
      enabledKey: "carEnabled",
      note: "all-in per day — rental, fuel and tolls",
    },
    {
      key: "dog",
      label: "Finn",
      group: "optional",
      amount: a.dogEnabled ? a.dogNightlyRate * a.dogNights : 0,
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
      label: "Gifts & extras",
      group: "optional",
      amount: a.extrasEnabled ? a.extrasPerDay * days : 0,
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
      group: "optional",
      amount: a.touristTaxEnabled ? a.touristTaxPerNight * a.nights : 0,
      unit: a.touristTaxPerNight,
      unitKey: "touristTaxPerNight",
      count: a.nights,
      countKey: "nights",
      countLabel: "nights",
      enabled: a.touristTaxEnabled,
      enabledKey: "touristTaxEnabled",
      note: "whole party, per night",
    },
  ];

  const lines: EstimateLine[] = raw.map((l) => ({
    ...l,
    amount: money(l.amount),
  }));

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
    rolledExcursionCount: cardBudgets.length,
  };
}
