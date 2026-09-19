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

  // Splitting the journey between two households (Brennan, 19 Sep 2026: his
  // parents join Tuscany and he cannot tell what they cost versus his five).
  // Off until someone is travelling with you: `guestPeople` above zero is the
  // switch, so there is no separate tick to forget.
  /** Travellers in the second household. `people` stays the whole party. */
  guestPeople: number;
  /**
   * What the guests cover of the lines one household cannot split by head —
   * the villa, the car. Per-person lines ignore this and divide by headcount;
   * the dog and the gifts are never theirs. A third by default because that is
   * the shape of the conversation, not a rule.
   */
  guestSharePct: number;
  /** The exchange rate was typed by hand (kept), not taken from the market (refreshed daily). */
  fxTyped?: boolean;
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
  /**
   * How this line divides when two households travel together.
   * `person` — everyone pays for themselves, so it splits by headcount.
   * `shared` — one bill for the whole party; the guests' share is a percentage.
   * `ours`   — never the guests' (the dog, the gifts you are buying).
   */
  share: ShareBasis;
}

export type ShareBasis = "person" | "shared" | "ours";

/** What each household owes. */
export interface Split {
  /** Travellers in each household. */
  usPeople: number;
  guestPeople: number;
  us: number;
  guests: number;
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
  /** Present only while someone is travelling with you. */
  split?: Split;
}

const money = (n: number) => Math.round(n);

export function defaultAssumptions(
  partySize: number,
  nights: number,
  /** The journey is at home (within ~80 km): no car hire, no boarding for the dog. */
  home = false,
  /** A city with a metro: car hire starts off (Tokyo carried $1,430 of it before). */
  metro = false,
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
    // Every other night out; a third was low for how this family travels.
    mealsOut: Math.max(2, Math.round(nights / 2)),
    excursionsTotal: 0,

    // Smart rather than arbitrary: a multi-night journey almost always needs a
    // car and leaves the dog behind; tourist tax is destination-specific, so it
    // stays off until the traveller says otherwise.
    carEnabled: !home && !metro && nights >= 2,
    carDayRate: 0,
    dogEnabled: !home && nights >= 1,
    dogNightlyRate: 0,
    dogNights: nights + 1,
    extrasEnabled: true,
    extrasPerDay: 0,
    touristTaxEnabled: false,
    touristTaxPerNight: 0,

    contingencyPct: 10,
    pointsCredit: 0,

    // Nobody else is coming until you say so, and then a third of the villa is
    // the opening position rather than an answer.
    guestPeople: 0,
    guestSharePct: 33,
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

/**
 * Divide a computed journey between the two households.
 *
 * Per-person lines go by headcount, shared lines by the guests' percentage,
 * and "ours" lines never move. Contingency is a proportion of the whole, so
 * each household carries it in the ratio of its own subtotal. Points are not
 * apportioned at all — they are yours, and they come off your side.
 *
 * `us + guests` equals the total exactly, which is the only property worth
 * guaranteeing here: two figures that do not add up to the number above them
 * are worse than no split at all.
 */
export function splitTotals(
  lines: EstimateLine[],
  a: Assumptions,
  contingency: number,
  pointsCredit: number,
): Split {
  const guestPeople = Math.max(0, Math.min(a.guestPeople, Math.max(a.people, 0)));
  const usPeople = Math.max(a.people, 0) - guestPeople;
  const headcount = usPeople + guestPeople;
  // Nobody travelling with you owes nothing, whatever the percentage says —
  // otherwise a leftover 33% keeps charging a household that isn't coming.
  const guestPct = guestPeople === 0
    ? 0
    : Math.max(0, Math.min(a.guestSharePct, 100)) / 100;

  let guestBase = 0;
  let base = 0;
  for (const l of lines) {
    if (!l.enabled) continue;
    base += l.amount;
    if (l.share === "person") {
      // No headcount means nobody to divide between; the line stays ours.
      guestBase += headcount > 0 ? (l.amount * guestPeople) / headcount : 0;
    } else if (l.share === "shared") {
      guestBase += l.amount * guestPct;
    }
  }

  // Contingency is a proportion of the whole, so both households carry it in
  // the ratio of their own subtotal. Points are NOT — they are yours, earned on
  // your card, and spreading them across both households quietly hands your
  // guests a discount you paid for. They come off your side first (Brennan,
  // 19 Sep 2026: $1,810 of his points had landed on his parents' total).
  const guestContingency = base > 0 ? (contingency * guestBase) / base : 0;
  const guestGross = guestBase + guestContingency;
  const usGross = base + contingency - guestGross;

  // Only if the credit is bigger than your entire share does the remainder
  // reach theirs — otherwise a large redemption would take you below zero.
  const usCredit = Math.min(Math.max(pointsCredit, 0), Math.max(usGross, 0));
  const guestCredit = Math.max(pointsCredit, 0) - usCredit;

  const total = money(base + contingency - pointsCredit);
  const guests = money(guestGross - guestCredit);

  return { usPeople, guestPeople, guests, us: total - guests };
}

export function compute(
  a: Assumptions,
  opts: { uncostedExcursions: number; rolledExcursionCount: number },
): Estimate {
  // Counts multiply as typed — 0 travellers means $0 of flights (Brennan,
  // Sep 2026: "when you put flights to zero it still drives a cost"). The
  // clamp to 1 lives only under the per-person and per-day divisions.
  const people = Math.max(a.people, 0);
  const days = Math.max(a.days, 0);

  const lines: EstimateLine[] = [
    {
      key: "flights",
      share: "person",
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
      share: "shared",
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
      share: "person",
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
      share: "person",
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
      share: "person",
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
      // "4 of 9 without a cost" — one figure a reader can act on. The old
      // "from 5 cards · 4 uncosted" clipped and read as five cards in total.
      hint: opts.rolledExcursionCount + opts.uncostedExcursions > 0
        ? (opts.uncostedExcursions
            ? `${opts.uncostedExcursions} of ${opts.rolledExcursionCount + opts.uncostedExcursions} without a cost`
            : `all ${opts.rolledExcursionCount} priced`)
        : undefined,
    },
    {
      key: "car",
      share: "shared",
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
      share: "ours",
      label: "Dog boarding",
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
      share: "ours",
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
      share: "person",
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
    perPerson: money(total / Math.max(people, 1)),
    perDay: money(total / Math.max(days, 1)),
    uncostedExcursions: opts.uncostedExcursions,
    rolledExcursionCount: opts.rolledExcursionCount,
    // Absent unless someone is actually travelling with you, so the footer
    // stays a single number on every other journey.
    split: a.guestPeople > 0
      ? splitTotals(lines, a, contingency, pointsCredit)
      : undefined,
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
  // At home there is no fare. Toronto & the GTA came out with $1,400 of
  // flights before this (Brennan, Sep 2026).
  const home = km < 80;
  const fare = home ? 0 : near(band * (ctx.peak ? 1.15 : 1), 10);
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
      flights: home ? "at home · no flights" : `${km.toLocaleString("en-CA")} km from Toronto · ${bandName}${ctx.peak ? " · +15% peak season" : ""}`,
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
