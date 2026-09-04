import {
  defaultAssumptions,
  cardBudgetToCad,
  greatCircleKm,
  HOME,
  type Assumptions,
  type CardBudget,
} from "./model";
import { currencyForDestination, fetchRateToHome, HOME_CURRENCY } from "./currency";

export interface ExcursionItem {
  cardId: string;
  title: string;
  /** As typed on the card, in its own currency; null = no cost yet. */
  amount: number | null;
  currency: string;
  per: "party" | "person";
  /** How many the amount is multiplied by (party size, or 1 for a party price). */
  people: number;
  /** In home currency, after the rate. 0 when free or blank. */
  totalCad: number;
  /** The card's details as loaded, so an edit in the table can be merged in. */
  details: Record<string, unknown>;
}

export interface EstimateData {
  tripTitle: string;
  assumptions: Assumptions;
  basis: Record<string, string>;
  uncostedExcursions: number;
  rolledExcursionCount: number;
  /** The rate card costs convert at: typed and saved, else today's market rate, else 1.47. */
  fxToCad: number;
  fxSource: "typed" | "live" | "fallback";
  /** What the cards are priced in, from the destination ("Tuscany, Italy" → EUR). */
  cardCurrency: string;
  homeCurrency: string;
  /** One row per priced activity card, in home currency, for the breakdown table. */
  excursionItems: ExcursionItem[];
  /** Activity cards on days with a cost of zero. */
  excursionFree: number;
  dateRange: string;
  distanceKm: number;
  peak: boolean;
}

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso + "T12:00:00").toLocaleDateString("en-CA", {
        month: "short",
        day: "numeric",
      })
    : "";

/** One sentence that says what the Excursions figure is made of. */
function excursionsBasis(
  cards: number,
  priced: { title: string; amount: number; currency: string; per: string }[],
  freeCount: number,
  uncosted: number,
  partySize: number,
  fx: number,
): string {
  const parts: string[] = [];
  const pricedCount = priced.length;
  parts.push(
    `${cards} ${cards === 1 ? "activity" : "activities"} on your days: ${pricedCount} priced${freeCount ? `, ${freeCount} free` : ""}${uncosted ? `, ${uncosted} with no cost yet` : ""}.`,
  );
  if (priced.some((x) => x.currency !== "CAD")) parts.push(`Converted at ${fx} to the dollar.`);
  void partySize;
  parts.push("Change a card's cost and this follows; type a figure on the line and it wins.");
  return parts.join(" ");
}

/**
 * Everything the Estimate screen needs, derived once.
 *
 * Called from the route with the server client and from the overlay with the
 * browser one — the query surface is the same for both, and keeping a single
 * implementation is what stops the page and the overlay drifting apart.
 */
export async function loadEstimate(
  // Both Supabase clients satisfy this; typing it tighter drags server-only
  // generics into a client bundle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tripId: string,
): Promise<EstimateData | null> {
  const [{ data: trip }, { data: days }, { data: cards }, { data: saved }] =
    await Promise.all([
      supabase
        .from("trips")
        .select(
          "id, title, destination, start_date, end_date, party_size, destination_lat, destination_lng",
        )
        .eq("id", tripId)
        .single(),
      supabase.from("days").select("id").eq("trip_id", tripId),
      supabase
        .from("cards")
        .select("id, details, status, places(type, title)")
        .eq("trip_id", tripId)
        .eq("status", "in_itinerary"),
      supabase.from("trip_budgets").select("*").eq("trip_id", tripId).maybeSingle(),
    ]);

  if (!trip) return null;

  const partySize = trip.party_size ?? 1;
  const nights = Math.max((days ?? []).length - 1, 1);
  // The cards' currency, from the destination; the rate from the market today,
  // unless a rate was typed and saved. 1.47 is the last resort.
  const cardCurrency = currencyForDestination(trip.destination as string | null) ?? "EUR";
  const typedFx = saved?.fx_to_cad != null ? Number(saved.fx_to_cad) : null;
  const liveFx = typedFx == null ? await fetchRateToHome(cardCurrency) : null;
  const fxToCad = typedFx ?? liveFx ?? 1.47;
  const fxSource: "typed" | "live" | "fallback" = typedFx != null ? "typed" : liveFx != null ? "live" : "fallback";

  // An excursion is any scheduled activity card. Those carrying details.budget
  // seed the Excursions line; the rest are counted so the screen can say how
  // much of the itinerary is still uncosted.
  const cardBudgets: CardBudget[] = [];
  // Every activity on a day, for the breakdown table: priced, free (0), or
  // blank (no cost yet). `priced` and `freeCount` feed the footnote.
  type Activity = { cardId: string; title: string; amount: number | null; currency: string; per: "person" | "party"; people: number; details: Record<string, unknown> };
  const activities: Activity[] = [];
  const priced: { title: string; amount: number; currency: string; per: string }[] = [];
  let freeCount = 0;
  let uncostedExcursions = 0;
  for (const c of cards ?? []) {
    const place = c.places as { type?: string; title?: string } | null;
    if (place?.type !== "activity") continue;
    const det = c.details as { budget?: CardBudget; cost_per_person?: number; cost_people?: number } | null;
    const title = place.title ?? "a card";
    const details = (c.details ?? {}) as Record<string, unknown>;
    // How many pay on this card — set from the Estimate table; default is the party.
    const people = typeof det?.cost_people === "number" && det.cost_people >= 0 ? det.cost_people : partySize;
    // Rolled at that headcount: a per-person budget becomes a party figure.
    const asParty = (b: CardBudget): CardBudget =>
      b.per === "person" && people !== partySize ? { ...b, amount: b.amount * people, per: "party" } : b;
    if (det?.budget && typeof det.budget.amount === "number") {
      cardBudgets.push(asParty(det.budget));
      const per = det.budget.per === "person" ? "person" : "party";
      activities.push({ cardId: c.id as string, title, amount: det.budget.amount, currency: det.budget.currency ?? "", per, people, details });
      if (det.budget.amount > 0) priced.push({ title, amount: det.budget.amount, currency: det.budget.currency ?? "", per });
      else freeCount += 1;
    }
    // The card sheet's own "Cost per person" field — typed in the currency
    // you were quoted in, so it converts like a budget in any currency but
    // CAD.
    else if (typeof det?.cost_per_person === "number") {
      cardBudgets.push(asParty({ amount: det.cost_per_person, currency: "local", per: "person", confidence: "estimated" }));
      activities.push({ cardId: c.id as string, title, amount: det.cost_per_person, currency: "", per: "person", people, details });
      if (det.cost_per_person > 0) priced.push({ title, amount: det.cost_per_person, currency: "", per: "person" });
      else freeCount += 1;
    }
    else {
      activities.push({ cardId: c.id as string, title, amount: null, currency: "", per: "person", people, details });
      uncostedExcursions += 1;
    }
  }

  // The single FX conversion: cards are priced in whatever they were quoted
  // in, and the Excursions line arrives already in home currency.
  const rolledCad = Math.round(
    cardBudgets.reduce(
      (s: number, b: CardBudget) => s + cardBudgetToCad(b, partySize, fxToCad),
      0,
    ),
  );

  // Anything actually set wins, including a hand-typed excursions figure
  // that disagrees with the cards — except a saved zero, which is what
  // "Clear all prices" leaves behind and what an empty box saves as. A zero
  // is "nothing typed", so the cards' own sum shows through it.
  const savedA = { ...((saved?.assumptions ?? {}) as Partial<Assumptions>) };
  if (!savedA.excursionsTotal) delete savedA.excursionsTotal;
  const assumptions: Assumptions = {
    ...defaultAssumptions(partySize, nights),
    excursionsTotal: rolledCad,
    ...savedA,
  };

  const lat = trip.destination_lat as number | null;
  const lng = trip.destination_lng as number | null;

  return {
    tripTitle: trip.title ?? "Journey",
    fxToCad,
    fxSource,
    cardCurrency,
    homeCurrency: HOME_CURRENCY,
    // Unrounded per row, so the table sums to the same figure as the line
    // (rows rounded first added to one dollar more). Largest first.
    excursionItems: activities
      .map((x) => ({
        cardId: x.cardId,
        title: x.title,
        amount: x.amount,
        currency: x.currency,
        per: x.per,
        people: x.per === "person" ? x.people : 1,
        totalCad: x.amount == null ? 0 : cardBudgetToCad({ amount: x.amount, currency: x.currency || "local", per: x.per }, x.per === "person" ? x.people : 1, fxToCad),
        details: x.details,
      }))
      // Priced largest first, then the free ones, then the blanks.
      .sort((a, b) => {
        const ra = a.amount == null ? 2 : a.amount === 0 ? 1 : 0;
        const rb = b.amount == null ? 2 : b.amount === 0 ? 1 : 0;
        return ra - rb || b.totalCad - a.totalCad;
      }),
    excursionFree: freeCount,
    assumptions,
    // The Excursions sentence writes itself from the cards; a sentence you
    // typed for that line still wins.
    basis: {
      ...(cardBudgets.length
        ? { excursions: excursionsBasis(cardBudgets.length, priced, freeCount, uncostedExcursions, partySize, fxToCad) }
        : {}),
      ...((saved?.basis ?? {}) as Record<string, string>),
    },
    uncostedExcursions,
    rolledExcursionCount: cardBudgets.length,
    dateRange:
      trip.start_date && trip.end_date
        ? `${fmt(trip.start_date)} – ${fmt(trip.end_date)}, ${new Date(trip.end_date + "T12:00:00").getFullYear()}`
        : "",
    distanceKm:
      lat != null && lng != null ? greatCircleKm(HOME.lat, HOME.lng, lat, lng) : 0,
    peak: trip.start_date
      ? [7, 8, 12].includes(Number(trip.start_date.slice(5, 7)))
      : false,
  };
}
