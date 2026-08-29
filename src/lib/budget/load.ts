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
        .select("id, details, status, places(type)")
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
  let uncostedExcursions = 0;
  for (const c of cards ?? []) {
    const place = c.places as { type?: string } | null;
    if (place?.type !== "activity") continue;
    const b = (c.details as { budget?: CardBudget } | null)?.budget;
    if (b && typeof b.amount === "number") cardBudgets.push(b);
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

  const assumptions: Assumptions = {
    ...defaultAssumptions(partySize, nights),
    excursionsTotal: rolledCad,
    // Anything actually set wins, including a hand-typed excursions figure
    // that disagrees with the cards.
    ...((saved?.assumptions ?? {}) as Partial<Assumptions>),
  };

  const lat = trip.destination_lat as number | null;
  const lng = trip.destination_lng as number | null;

  return {
    tripTitle: trip.title ?? "Journey",
    assumptions,
    basis: (saved?.basis ?? {}) as Record<string, string>,
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
