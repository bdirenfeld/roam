import {
  defaultAssumptions,
  cardBudgetToCad,
  greatCircleKm,
  HOME,
  type Assumptions,
  type CardBudget,
} from "./model";
import { currencyForDestination, fetchRateToHome, referenceRateToHome, REFERENCE_MONTH, HOME_CURRENCY } from "./currency";

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
  /** The card is marked Confirmed (booked); until then a cost is an estimate. */
  confirmed: boolean;
  /** The cost was read from an attachment on the card (a ticket or receipt), not typed. */
  fromTicket: boolean;
  /** The cost was looked up by the app: "found" online (with the page) or a "guess". */
  found: { kind: "found" | "guess"; url: string | null; note: string | null } | null;
}

/** The app's own lookup, if one wrote this card's cost. */
function foundSource(details: Record<string, unknown>): ExcursionItem["found"] {
  const src = details.cost_source as { kind?: string; url?: string | null; note?: string | null } | undefined;
  if (!src || (src.kind !== "found" && src.kind !== "guess")) return null;
  if (typeof details.cost_per_person !== "number") return null;
  return { kind: src.kind, url: src.url ?? null, note: src.note ?? null };
}

/**
 * A cost read off a card's attachments. The upload route asks the model for
 * `cost_per_person` and `currency`; other documents come back with a total
 * under a handful of names. Per-person wins; a bare total is for the party.
 * (Brennan, Sep 2026: "it should be smart enough to look at the attachment
 * in the day to see if the cost is available.")
 */
export function ticketCost(
  attachments: { parsed_data: unknown; parse_status: string | null }[] | null | undefined,
): { amount: number; per: "person" | "party" } | null {
  const num = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
    if (typeof v === "string") {
      const m = v.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
      if (m) return Number(m[0]);
    }
    return null;
  };
  // The parser names its fields loosely — cost_total, total_charged,
  // amount_paid, ticket_adult_price — so match on shape. Explicit per-person
  // first; then anything that reads as the whole bill (the museum ticket had
  // adult 43 + child 26 = cost_total 69, and the total is the honest figure);
  // then a per-adult price as a last resort.
  const firstNum = (d: Record<string, unknown>, re: RegExp): number | null => {
    for (const [k, v] of Object.entries(d)) {
      if (!re.test(k)) continue;
      const n = num(v);
      if (n != null) return n;
    }
    return null;
  };
  for (const a of attachments ?? []) {
    if (a.parse_status !== "parsed" || !a.parsed_data || typeof a.parsed_data !== "object") continue;
    const d = a.parsed_data as Record<string, unknown>;
    const perPerson = num(d.cost_per_person) ?? firstNum(d, /per_person|per_guest|per_traveller|per_traveler/i);
    if (perPerson != null) return { amount: perPerson, per: "person" };
    const total =
      firstNum(d, /^(total|grand_total|total_cost|cost_total|total_price|price_total|total_paid|amount_paid|total_charged|total_amount|amount_total|order_total)$/i) ??
      firstNum(d, /^(cost|price|amount|paid)$/i) ??
      firstNum(d, /(^|_)total($|_)|_paid$|_charged$/i);
    if (total != null) return { amount: total, per: "party" };
    const perAdult = firstNum(d, /per_adult|adult_price|adult_ticket|ticket_adult/i);
    if (perAdult != null) return { amount: perAdult, per: "person" };
  }
  return null;
}

export interface EstimateData {
  tripTitle: string;
  assumptions: Assumptions;
  basis: Record<string, string>;
  uncostedExcursions: number;
  rolledExcursionCount: number;
  /** The rate card costs convert at: typed and saved, else today's market rate, else 1.47. */
  fxToCad: number;
  fxSource: "typed" | "live" | "reference" | "fallback";
  /** Which month the reference table was taken from (shown when it is in use). */
  fxReferenceMonth: string;
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
        .select("id, details, status, confirmed, places(type, title), card_attachments(parsed_data, parse_status)")
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
  // The column is NOT NULL, so "typed" is a flag in the saved assumptions.
  const savedFx = saved?.fx_to_cad != null ? Number(saved.fx_to_cad) : null;
  const fxTyped = Boolean((saved?.assumptions as { fxTyped?: boolean } | null)?.fxTyped) && savedFx != null;
  // Typed wins. Otherwise today's rate; failing that the dated reference
  // table; failing even that, whatever the row last held.
  const liveFx = fxTyped ? null : await fetchRateToHome(cardCurrency);
  const refFx = liveFx == null ? referenceRateToHome(cardCurrency) : null;
  const fxToCad = fxTyped ? (savedFx as number) : (liveFx ?? refFx ?? savedFx ?? 1.47);
  const fxSource: "typed" | "live" | "reference" | "fallback" =
    fxTyped ? "typed" : liveFx != null ? "live" : refFx != null ? "reference" : "fallback";

  // An excursion is any scheduled activity card. Those carrying details.budget
  // seed the Excursions line; the rest are counted so the screen can say how
  // much of the itinerary is still uncosted.
  const cardBudgets: CardBudget[] = [];
  // Every activity on a day, for the breakdown table: priced, free (0), or
  // blank (no cost yet). `priced` and `freeCount` feed the footnote.
  type Activity = { cardId: string; title: string; amount: number | null; currency: string; per: "person" | "party"; people: number; details: Record<string, unknown>; confirmed: boolean; fromTicket: boolean };
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
      activities.push({ cardId: c.id as string, title, amount: det.budget.amount, currency: det.budget.currency ?? "", per, people, details, confirmed: Boolean((c as { confirmed?: boolean }).confirmed), fromTicket: false });
      if (det.budget.amount > 0) priced.push({ title, amount: det.budget.amount, currency: det.budget.currency ?? "", per });
      else freeCount += 1;
    }
    // The card sheet's own "Cost per person" field — typed in the currency
    // you were quoted in, so it converts like a budget in any currency but
    // CAD.
    else if (typeof det?.cost_per_person === "number") {
      cardBudgets.push(asParty({ amount: det.cost_per_person, currency: "local", per: "person", confidence: "estimated" }));
      activities.push({ cardId: c.id as string, title, amount: det.cost_per_person, currency: "", per: "person", people, details, confirmed: Boolean((c as { confirmed?: boolean }).confirmed), fromTicket: false });
      if (det.cost_per_person > 0) priced.push({ title, amount: det.cost_per_person, currency: "", per: "person" });
      else freeCount += 1;
    }
    else {
      const ticket = ticketCost((c as { card_attachments?: { parsed_data: unknown; parse_status: string | null }[] | null }).card_attachments);
      if (ticket) {
        // Read off the ticket or receipt on the card. Counted like a typed
        // cost; typing over it in the table saves to the card and wins.
        cardBudgets.push(asParty({ amount: ticket.amount, currency: "local", per: ticket.per, confidence: "estimated" }));
        activities.push({ cardId: c.id as string, title, amount: ticket.amount, currency: "", per: ticket.per, people, details, confirmed: Boolean((c as { confirmed?: boolean }).confirmed), fromTicket: true });
        if (ticket.amount > 0) priced.push({ title, amount: ticket.amount, currency: "", per: ticket.per });
        else freeCount += 1;
      } else {
        activities.push({ cardId: c.id as string, title, amount: null, currency: "", per: "person", people, details, confirmed: Boolean((c as { confirmed?: boolean }).confirmed), fromTicket: false });
        uncostedExcursions += 1;
      }
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
    fxReferenceMonth: REFERENCE_MONTH,
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
        confirmed: x.confirmed,
        fromTicket: x.fromTicket,
        found: x.fromTicket ? null : foundSource(x.details),
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
