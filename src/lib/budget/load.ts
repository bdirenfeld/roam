import {
  defaultAssumptions,
  cardBudgetToCad,
  greatCircleKm,
  HOME,
  type Assumptions,
  type CardBudget,
} from "./model";

export interface EstimateData {
  tripTitle: string;
  assumptions: Assumptions;
  basis: Record<string, string>;
  uncostedExcursions: number;
  rolledExcursionCount: number;
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
    `Adds up the cost on the ${cards} ${cards === 1 ? "activity" : "activities"} on your days: ${pricedCount} priced${freeCount ? `, ${freeCount} free` : ""}${uncosted ? `, ${uncosted} with no cost yet` : ""}.`,
  );
  const perPerson = priced.some((x) => x.per === "person");
  if (perPerson) parts.push(`Per-person costs are × ${partySize} travellers.`);
  if (priced.some((x) => x.currency !== "CAD")) parts.push(`Converted at ${fx} to the dollar.`);
  const top = [...priced].sort((a, b) => (b.per === "person" ? b.amount * partySize : b.amount) - (a.per === "person" ? a.amount * partySize : a.amount)).slice(0, 3);
  if (top.length) {
    const sym = (c: string) => (c === "CAD" ? "$" : c === "EUR" ? "€" : c === "USD" ? "US$" : c === "GBP" ? "£" : "");
    parts.push(`Biggest: ${top.map((x) => `${x.title} ${sym(x.currency)}${Math.round(x.amount)}${x.per === "person" ? " each" : ""}`).join(", ")}.`);
  }
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
          "id, title, start_date, end_date, party_size, destination_lat, destination_lng",
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
  const fxToCad = Number(saved?.fx_to_cad ?? 1.47);

  // An excursion is any scheduled activity card. Those carrying details.budget
  // seed the Excursions line; the rest are counted so the screen can say how
  // much of the itinerary is still uncosted.
  const cardBudgets: CardBudget[] = [];
  // For the "how this was worked out" sentence: what was priced, what was free.
  const priced: { title: string; amount: number; currency: string; per: string }[] = [];
  let freeCount = 0;
  let uncostedExcursions = 0;
  for (const c of cards ?? []) {
    const place = c.places as { type?: string; title?: string } | null;
    if (place?.type !== "activity") continue;
    const det = c.details as { budget?: CardBudget; cost_per_person?: number } | null;
    if (det?.budget && typeof det.budget.amount === "number") {
      cardBudgets.push(det.budget);
      if (det.budget.amount > 0) priced.push({ title: place.title ?? "a card", amount: det.budget.amount, currency: det.budget.currency ?? "", per: det.budget.per ?? "party" });
      else freeCount += 1;
    }
    // The card sheet's own "Cost per person" field — typed in the currency
    // you were quoted in, so it converts like a budget in any currency
    // but CAD. Two fields for one idea used to be two fields; this is the
    // bridge until the planning skill writes cost_per_person too.
    else if (typeof det?.cost_per_person === "number") {
      cardBudgets.push({ amount: det.cost_per_person, currency: "local", per: "person", confidence: "estimated" });
      if (det.cost_per_person > 0) priced.push({ title: place.title ?? "a card", amount: det.cost_per_person, currency: "", per: "person" });
      else freeCount += 1;
    }
    else uncostedExcursions += 1;
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
