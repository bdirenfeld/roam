import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { currencyForDestination, HOME_CURRENCY } from "@/lib/budget/currency";
import { ticketCost } from "@/lib/budget/load";

// ── Find a price for every activity that has none ─────────────────────────
//
// Part of "Estimate from this journey": each scheduled activity with no cost
// on the card and no ticket attached is looked up — Claude, with web search,
// reads the venue's own page and returns a per-person figure with the link
// it came from ("found"), or estimates from what it knows of that kind of
// place in that country ("guess"). The figure is written to the card so it
// is never looked up twice; typing over it in the table wins. Runs on the
// app's key, so every traveller gets it (Brennan, Sep 2026: "is the app not
// smart enough to just Google the price?").

export const maxDuration = 60;

interface Found {
  cardId: string;
  title: string;
  amount: number | null;
  currency: string;
  kind: "found" | "guess";
  url: string | null;
  note: string | null;
}

function extractJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  const candidates = [t, t.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], t.match(/\{[\s\S]*\}/)?.[0]];
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c.trim()) as Record<string, unknown>; } catch { /* next */ }
  }
  return null;
}

async function lookup(
  client: Anthropic,
  card: { id: string; title: string; subType: string | null; notes: string | null },
  destination: string,
  currency: string,
  when: string,
  siblings: string,
): Promise<Found> {
  const system = `You price one activity for a family trip so their budget is honest. Use web search to find the venue's own current price (adult admission, standard tour price, or a typical per-person spend). Answer in ${currency}; if the venue quotes another currency, convert at today's rate and say so in the note. Free things are 0. If you cannot find it online, estimate from what you know of that kind of place in that country and say confidence is "guess".
The journey's other stops are listed in order. A fee that one stop already pays — a park entrance, a museum pass, a venue ticket — is not paid again by a later stop inside the same park or venue: answer 0 for the later stop with the note "covered by <earlier stop>". Only the first stop inside carries the fee.
End your reply with exactly one JSON object and nothing after it:
{"amount_per_person": number|null, "currency": "${currency}", "source_url": string|null, "confidence": "found"|"guess", "note": string}
"note" is at most 12 words (e.g. "adult ticket, quoted US$45" or "typical spend, no listed price").`;
  const user = `Activity: ${card.title}${card.subType ? ` (${card.subType.replace("_", " ")})` : ""}
Destination: ${destination}
When: ${when}${card.notes ? `\nCard notes: ${card.notes.slice(0, 300)}` : ""}
Other stops on this journey, in order: ${siblings}`;
  try {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 900,
      system,
      messages: [{ role: "user", content: user }],
      // Server-side web search: Anthropic runs the searches; nothing to host.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    const j = extractJson(text);
    const amount = typeof j?.amount_per_person === "number" && j.amount_per_person >= 0 ? Math.round(j.amount_per_person * 100) / 100 : null;
    const url = typeof j?.source_url === "string" && /^https?:\/\//.test(j.source_url) ? j.source_url : null;
    const kind: "found" | "guess" = j?.confidence === "found" && url ? "found" : "guess";
    return { cardId: card.id, title: card.title, amount, currency, kind, url, note: typeof j?.note === "string" ? j.note.slice(0, 120) : null };
  } catch {
    return { cardId: card.id, title: card.title, amount: null, currency, kind: "guess", url: null, note: null };
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let tripId: string | null = null;
  try { tripId = ((await req.json()) as { tripId?: string }).tripId ?? null; } catch { /* below */ }
  if (!tripId) return NextResponse.json({ error: "tripId is required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Price lookup isn't configured" }, { status: 500 });

  const [{ data: trip }, { data: cards }] = await Promise.all([
    supabase.from("trips").select("destination, start_date, end_date").eq("id", tripId).single(),
    supabase
      .from("cards")
      .select("id, details, position, days(date), places(type, sub_type, title), card_attachments(parsed_data, parse_status)")
      .eq("trip_id", tripId)
      .eq("status", "in_itinerary"),
  ]);
  if (!trip) return NextResponse.json({ error: "Journey not found" }, { status: 404 });

  const destination = (trip.destination as string | null) ?? "";
  const currency = currencyForDestination(destination) ?? HOME_CURRENCY;
  const when = trip.start_date ? new Date(trip.start_date as string).toLocaleDateString("en-CA", { month: "long", year: "numeric" }) : "";

  // Every activity in journey order, so a lookup can see what comes before
  // it (a park entrance paid on the first stop is not paid again on the next).
  const ordered = (cards ?? [])
    .filter((c) => (c.places as { type?: string } | null)?.type === "activity")
    .sort((x, y) => {
      const dx = ((x.days as { date?: string } | null)?.date ?? "") + String(x.position ?? 0).padStart(4, "0");
      const dy = ((y.days as { date?: string } | null)?.date ?? "") + String(y.position ?? 0).padStart(4, "0");
      return dx < dy ? -1 : dx > dy ? 1 : 0;
    });
  const siblings = ordered
    .map((c) => {
      const det = (c.details ?? {}) as Record<string, unknown>;
      const priced = typeof det.cost_per_person === "number";
      return `${(c.places as { title?: string } | null)?.title ?? "a stop"}${priced ? " (priced)" : ""}`;
    })
    .join("; ")
    .slice(0, 1500);

  // Only the blanks: no typed cost, no budget, no readable ticket.
  const blanks = ordered.flatMap((c) => {
    const place = c.places as { type?: string; sub_type?: string | null; title?: string } | null;
    if (place?.type !== "activity") return [];
    const det = (c.details ?? {}) as Record<string, unknown>;
    if (typeof det.cost_per_person === "number") return [];
    if (det.budget && typeof (det.budget as { amount?: unknown }).amount === "number") return [];
    if (ticketCost((c as { card_attachments?: { parsed_data: unknown; parse_status: string | null }[] | null }).card_attachments)) return [];
    return [{ id: c.id as string, title: place.title ?? "an activity", subType: place.sub_type ?? null, notes: typeof det.notes === "string" ? det.notes : null, details: det }];
  }).slice(0, 15);

  if (blanks.length === 0) return NextResponse.json({ items: [], currency });

  const client = new Anthropic({ apiKey });

  // Each answer is written to its card the moment it lands, so a slow
  // journey keeps what it found. The route has 60 s; no new batch starts
  // after 35 s, and what is left is reported as "remaining" — the client says
  // so and a second tap picks them up (they are no longer blanks).
  const started = Date.now();
  const write = async (r: Found) => {
    if (r.amount == null) return;
    const card = blanks.find((b) => b.id === r.cardId);
    if (!card) return;
    const details = {
      ...card.details,
      cost_per_person: r.amount,
      budget: { amount: r.amount, currency, per: "person", confidence: "estimated", basis: r.note ?? (r.kind === "found" ? "found online" : "estimated") },
      cost_source: { kind: r.kind, url: r.url, note: r.note, at: new Date().toISOString() },
    };
    await supabase.from("cards").update({ details }).eq("id", r.cardId);
  };
  const results: Found[] = [];
  let i = 0;
  for (; i < blanks.length; i += 8) {
    if (i > 0 && Date.now() - started > 35_000) break;
    const batch = blanks.slice(i, i + 8);
    const found = await Promise.all(
      batch.map(async (b) => { const r = await lookup(client, b, destination, currency, when, siblings); await write(r); return r; }),
    );
    results.push(...found);
  }
  const remaining = Math.max(0, blanks.length - i);

  return NextResponse.json({ items: results, currency, remaining });
}
