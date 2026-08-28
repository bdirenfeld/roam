/**
 * Journey estimate — the costing model behind the Estimate screen.
 *
 * Nine lines, deliberately. The screen exists to let you assess a journey at a
 * glance and adjust the unit costs, not to account for it — so every row is one
 * editable unit cost times a stated multiplier, and anything that doesn't move
 * the answer was cut rather than kept "for completeness".
 *
 * Two groups: things that happen on every trip, and things that might. Optional
 * rows keep their numbers when unticked and simply drop out of the total, so you
 * can flick one on and watch the total move without losing the assumption.
 *
 * Everything computes in CAD. Card budgets carry their own currency and convert
 * at the journey's stored rate — flights are booked at home, excursions abroad.
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
  // Every trip
  flightPerPerson: number;
  flightsOnPoints: boolean;
  /** Award seats still bill taxes, bags and seat selection. */
  flightTaxesPerPerson: number;
  nightlyRate: number;
  accommodationOnPoints: boolean;
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
  touristTaxPerPersonPerNight: number;

  contingencyPct: number;
}

export interface EstimateLine {
  key: string;
  label: string;
  group: "always" | "optional";
  amount: number;
  /** The editable unit cost, and which assumption it writes to. */
  unit: number;
  unitKey: keyof Assumptions;
  /** Text after the unit box, e.g. "× 7 people". */
  multiplier: string;
  /** Set when the count itself is editable (meals out, dog nights). */
  countKey?: keyof Assumptions;
  count?: number;
  countLabel?: string;
  /** Optional rows carry a tick; unticked rows contribute nothing. */
  enabled: boolean;
  enabledKey?: keyof Assumptions;
  /** Flights and accommodation can be paid with points. */
  pointsKey?: keyof Assumptions;
  onPoints?: boolean;
  /** Excursions is read-only — it comes from the cards. */
  readOnly?: boolean;
  unitDisplay?: string;
  hint?: string;
}

export interface Estimate {
  lines: EstimateLine[];
  subtotal: number;
  contingency: number;
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
    flightPerPerson: 1370,
    flightsOnPoints: false,
    flightTaxesPerPerson: 140,
    nightlyRate: 650,
    accommodationOnPoints: false,
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
    touristTaxPerPersonPerNight: 3,

    contingencyPct: 10,
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
    partySize: number;
    nights: number;
    cardBudgets: CardBudget[];
    uncostedExcursions: number;
    fxToCad: number;
  },
): Estimate {
  const { partySize, nights, cardBudgets, fxToCad } = opts;
  const days = Math.max(nights, 1);

  const rolled = cardBudgets.reduce(
    (s, b) => s + cardBudgetToCad(b, partySize, fxToCad),
    0,
  );
  const foreign = cardBudgets.find((b) => b.currency && b.currency !== "CAD");
  const rawForeign = cardBudgets.reduce(
    (s, b) => s + (b.per === "person" ? b.amount * partySize : b.amount),
    0,
  );

  // On points the fare is covered but the taxes are not — zeroing the whole row
  // would flatter the estimate by roughly a thousand dollars on a party of seven.
  const flightUnit = a.flightsOnPoints
    ? a.flightTaxesPerPerson
    : a.flightPerPerson;

  const raw: EstimateLine[] = [
    {
      key: "flights",
      label: "Flights",
      group: "always",
      amount: flightUnit * partySize,
      unit: flightUnit,
      unitKey: a.flightsOnPoints ? "flightTaxesPerPerson" : "flightPerPerson",
      multiplier: `× ${partySize} ${partySize === 1 ? "person" : "people"}`,
      enabled: true,
      pointsKey: "flightsOnPoints",
      onPoints: a.flightsOnPoints,
      hint: a.flightsOnPoints ? "taxes & fees — fare on points" : undefined,
    },
    {
      key: "accommodation",
      label: "Accommodation",
      group: "always",
      amount: a.accommodationOnPoints ? 0 : a.nightlyRate * nights,
      unit: a.nightlyRate,
      unitKey: "nightlyRate",
      multiplier: `× ${nights} ${nights === 1 ? "night" : "nights"}`,
      enabled: true,
      pointsKey: "accommodationOnPoints",
      onPoints: a.accommodationOnPoints,
      hint: a.accommodationOnPoints ? "covered by points" : undefined,
    },
    {
      key: "groceries",
      label: "Groceries",
      group: "always",
      amount: a.groceriesPerDay * days,
      unit: a.groceriesPerDay,
      unitKey: "groceriesPerDay",
      multiplier: `× ${days} days`,
      enabled: true,
    },
    {
      key: "restaurants",
      label: "Restaurants",
      group: "always",
      amount: a.perMealOut * a.mealsOut,
      unit: a.perMealOut,
      unitKey: "perMealOut",
      multiplier: "×",
      countKey: "mealsOut",
      count: a.mealsOut,
      countLabel: "meals out",
      enabled: true,
    },
    {
      key: "excursions",
      label: "Excursions",
      group: "always",
      amount: a.excursionsOverride != null ? a.excursionsOverride : rolled,
      unit: a.excursionsOverride ?? rolled,
      unitKey: "excursionsOverride",
      multiplier:
        a.excursionsOverride != null
          ? "set by hand"
          : cardBudgets.length
            ? `from ${cardBudgets.length} costed ${cardBudgets.length === 1 ? "card" : "cards"}`
            : "no cards carry a cost yet",
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
      multiplier: `× ${days} days`,
      enabled: a.carEnabled,
      enabledKey: "carEnabled",
      hint: "all-in per day — rental, fuel and tolls",
    },
    {
      key: "dog",
      label: "Finn",
      group: "optional",
      amount: a.dogEnabled ? a.dogNightlyRate * a.dogNights : 0,
      unit: a.dogNightlyRate,
      unitKey: "dogNightlyRate",
      multiplier: "×",
      countKey: "dogNights",
      count: a.dogNights,
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
      multiplier: `× ${days} days`,
      enabled: a.extrasEnabled,
      enabledKey: "extrasEnabled",
    },
    {
      key: "touristTax",
      label: "Tourist tax",
      group: "optional",
      amount: a.touristTaxEnabled
        ? a.touristTaxPerPersonPerNight * partySize * nights
        : 0,
      unit: a.touristTaxPerPersonPerNight,
      unitKey: "touristTaxPerPersonPerNight",
      multiplier: `× ${partySize} people × ${nights} nights`,
      enabled: a.touristTaxEnabled,
      enabledKey: "touristTaxEnabled",
    },
  ];

  const lines: EstimateLine[] = raw.map((l) => ({
    ...l,
    amount: money(l.amount),
  }));

  const subtotal = lines.reduce((s, l) => s + (l.enabled ? l.amount : 0), 0);
  const contingency = money((subtotal * a.contingencyPct) / 100);
  const total = subtotal + contingency;

  return {
    lines,
    subtotal,
    contingency,
    total,
    perPerson: money(total / Math.max(partySize, 1)),
    perDay: money(total / days),
    uncostedExcursions: opts.uncostedExcursions,
    rolledExcursionCount: cardBudgets.length,
  };
}
