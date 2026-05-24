// ============================================================
// Roam — Companion assistant route
// The chat UI talks only to this route; this route talks to
// Anthropic and Supabase. All Supabase access is RLS-scoped under
// the signed-in user — no service role.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buildTripSkeleton } from "@/lib/companion/skeleton";
import { buildSystemPrompt } from "@/lib/companion/prompt";
import type {
  AddProposal,
  AssistantStreamEvent,
  CutCardSummary,
  CutProposal,
  MoveProposal,
  ProposalIcon,
  ResolvedPlace,
  RestoreEntry,
} from "@/lib/companion/types";

export const maxDuration = 60;

const MODEL = "claude-opus-4-7";
const MAX_TOKENS = 4096;
const HISTORY_TURNS = 20; // last N turns sent to the model verbatim
const MAX_TOOL_ITERS = 6; // safety cap on the tool loop

const DISCARD_TRACE = "Discarded — nothing moved.";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_card_detail",
    description:
      "Fetch the full details of one card already in this journey — its details JSON and linked place data — when the skeleton's one-line summary is not enough. card_id is the UUID shown in the skeleton as [card <id>].",
    input_schema: {
      type: "object",
      properties: {
        card_id: { type: "string", description: "The card UUID from the skeleton." },
      },
      required: ["card_id"],
    },
  },
  {
    name: "propose_cut",
    description:
      "Propose to cut (soft-delete) one or more cards already in this journey. This writes NOTHING — it shows the traveller a confirm card, and nothing is cut unless they approve. Cuts are always restorable. NEVER originate a cut — only call this tool when the traveller has explicitly told you which card(s) to drop. If the request is ambiguous, ask in plain conversation FIRST; do not call this tool to disambiguate. NEVER invent a reason — pass `reason` only if the traveller gave one, and use their exact phrasing verbatim.",
    input_schema: {
      type: "object",
      properties: {
        heading: {
          type: "string",
          description:
            "A short Playfair-italic lede for the cut card header, in Roam's editorial voice.",
        },
        lede: { type: "string", description: "Optional one-sentence supporting line." },
        reason: {
          type: "string",
          description:
            "ONLY pass this if the traveller gave a reason for the cut, and quote their words verbatim. Otherwise OMIT this field entirely — never invent or paraphrase.",
        },
        card_ids: {
          type: "array",
          description:
            "The UUIDs of the cards to cut, taken from the skeleton's [card <uuid>] tokens.",
          items: { type: "string" },
        },
      },
      required: ["heading", "card_ids"],
    },
  },
  {
    name: "propose_add",
    description:
      "Propose one or more specific, real places to add to this journey. This writes NOTHING — it shows the traveller a confirm card, and nothing is added unless they approve. Added places land unscheduled. Use only when the traveller wants places added.",
    input_schema: {
      type: "object",
      properties: {
        heading: {
          type: "string",
          description:
            "A short Playfair-italic lede for the proposal card header, in Roam's editorial voice.",
        },
        lede: { type: "string", description: "Optional one-sentence supporting line." },
        places: {
          type: "array",
          description: "The places to propose — each one specific, real establishment.",
          items: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "The establishment's name plus its city or neighbourhood, specific enough to resolve unambiguously against Google Places.",
              },
              kind: {
                type: "string",
                description: "A short editorial label, e.g. 'Breakfast', 'Workshop', 'Dinner'.",
              },
              icon: {
                type: "string",
                enum: ["coffee", "fork", "dessert", "bar", "shop", "flag", "bed", "pin"],
                description: "An icon that fits the place.",
              },
            },
            required: ["query", "kind", "icon"],
          },
        },
      },
      required: ["heading", "places"],
    },
  },
  {
    name: "propose_move",
    description:
      "Propose to move ONE already-scheduled card from its current day to a different day. This writes NOTHING — it shows the traveller a confirm card, and nothing moves unless they approve. The card keeps its start_time and end_time exactly; it lands at the END of the target day's manual order. Use only when the traveller has explicitly told you both the card AND the day. NEVER originate a move. NEVER invent or shift a time. If the request is ambiguous, ask in plain conversation FIRST; do not call this tool to disambiguate. Move only works on cards currently scheduled on a day — never on UNSCHEDULED PLACES.",
    input_schema: {
      type: "object",
      properties: {
        heading: {
          type: "string",
          description:
            "A short Playfair-italic lede for the move card header, in Roam's editorial voice.",
        },
        lede: { type: "string", description: "Optional one-sentence supporting line." },
        card_id: {
          type: "string",
          description:
            "The UUID of the card to move, taken from the skeleton's [card <uuid>] tokens. Must be a card currently scheduled on a day.",
        },
        target_day_id: {
          type: "string",
          description:
            "The UUID of the day to move it to, taken from the skeleton's [day <uuid>] tokens. Must be a different day than the card's current day.",
        },
      },
      required: ["heading", "card_id", "target_day_id"],
    },
  },
];

const ICON_KEYS: ProposalIcon[] = [
  "coffee",
  "fork",
  "dessert",
  "bar",
  "shop",
  "flag",
  "bed",
  "pin",
];

function normalizeIcon(v: unknown): ProposalIcon {
  return typeof v === "string" && (ICON_KEYS as string[]).includes(v)
    ? (v as ProposalIcon)
    : "pin";
}

// ── Place resolution — reuses /api/places/autocomplete ─────────
// The model supplies a free-text query; Google supplies the verified
// place_id. The model never fabricates place data. A query that does
// not resolve is dropped — never backfilled with a guessed place.
async function resolveQuery(
  query: string,
  lat: number | null,
  lng: number | null,
  origin: string,
  cookie: string,
): Promise<{ google_place_id: string; name: string; meta: string } | null> {
  const url = new URL("/api/places/autocomplete", origin);
  url.searchParams.set("input", query);
  url.searchParams.set("types", "establishment");
  if (lat != null && lng != null) {
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lng", String(lng));
  }
  try {
    // Forward the user's session cookie — /api/places/autocomplete sits
    // behind the auth middleware; an uncredentialed internal fetch is
    // 307'd to /login. Mirrors the bulk-import call in handleApprove.
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { cookie },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      predictions?: {
        place_id?: string;
        description?: string;
        structured_formatting?: { main_text?: string; secondary_text?: string };
      }[];
    };
    const pred = data.predictions?.[0];
    if (!pred?.place_id) return null;
    return {
      google_place_id: pred.place_id,
      name: pred.structured_formatting?.main_text ?? pred.description ?? query,
      meta: pred.structured_formatting?.secondary_text ?? "",
    };
  } catch {
    return null;
  }
}

interface ProposeInput {
  heading: string;
  lede?: string;
  places: { query: string; kind: string; icon: ProposalIcon }[];
}

function parseProposeInput(input: unknown): ProposeInput | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.places)) return null;
  const places: ProposeInput["places"] = [];
  for (const p of o.places) {
    if (!p || typeof p !== "object") continue;
    const po = p as Record<string, unknown>;
    if (typeof po.query !== "string" || !po.query.trim()) continue;
    places.push({
      query: po.query.trim(),
      kind: typeof po.kind === "string" && po.kind.trim() ? po.kind.trim() : "Place",
      icon: normalizeIcon(po.icon),
    });
  }
  if (places.length === 0) return null;
  return {
    heading:
      typeof o.heading === "string" && o.heading.trim()
        ? o.heading.trim()
        : "A few places to consider.",
    lede: typeof o.lede === "string" && o.lede.trim() ? o.lede.trim() : undefined,
    places,
  };
}

// ── Cut proposal — parse + resolve ─────────────────────────────
// Model passes card UUIDs from the skeleton. Server reads the live row
// (joined to places) to format the user-facing title and meta line —
// the model NEVER supplies card titles or times.
interface CutInput {
  heading: string;
  lede?: string;
  reason?: string;
  card_ids: string[];
}

function parseCutInput(input: unknown): CutInput | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  if (!Array.isArray(o.card_ids)) return null;
  const ids: string[] = [];
  for (const id of o.card_ids) {
    if (typeof id === "string" && id.trim()) ids.push(id.trim());
  }
  if (ids.length === 0) return null;
  return {
    heading:
      typeof o.heading === "string" && o.heading.trim()
        ? o.heading.trim()
        : "About to cut.",
    lede: typeof o.lede === "string" && o.lede.trim() ? o.lede.trim() : undefined,
    reason:
      typeof o.reason === "string" && o.reason.trim() ? o.reason.trim() : undefined,
    card_ids: Array.from(new Set(ids)),
  };
}

interface CutCardRow {
  id: string;
  status: string;
  start_time: string | null;
  day_id: string | null;
  place: { title: string | null } | { title: string | null }[] | null;
  day: { day_number: number } | { day_number: number }[] | null;
}

function singleOf<T>(v: T | T[] | null): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

async function resolveCutProposal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  input: CutInput,
): Promise<CutProposal | null> {
  // RLS-scoped read — only this user's cards on this trip. Already-cut
  // cards are excluded so the companion can't propose to cut what's
  // already gone.
  const { data } = await supabase
    .from("cards")
    .select(
      "id, status, start_time, day_id, place:places(title), day:days(day_number)",
    )
    .eq("trip_id", tripId)
    .in("id", input.card_ids)
    .neq("status", "cut");

  const rows = (data ?? []) as CutCardRow[];
  if (rows.length === 0) return null;

  const cards: CutCardSummary[] = rows.map((r) => {
    const place = singleOf(r.place);
    const day = singleOf(r.day);
    const title = place?.title ?? "Untitled";
    const time = r.start_time ? r.start_time.slice(0, 5) : "";
    let meta: string;
    if (day?.day_number != null) {
      meta = time ? `Day ${day.day_number} · ${time}` : `Day ${day.day_number}`;
    } else {
      meta = "Unscheduled";
    }
    return { card_id: r.id, title, meta };
  });

  return {
    heading: input.heading,
    lede: input.lede,
    reason: input.reason,
    cards,
  };
}

async function resolveProposal(
  input: ProposeInput,
  trip: { destination_lat: number | null; destination_lng: number | null },
  origin: string,
  cookie: string,
): Promise<AddProposal | null> {
  const resolved = await Promise.all(
    input.places.map(async (p) => {
      const r = await resolveQuery(
        p.query,
        trip.destination_lat,
        trip.destination_lng,
        origin,
        cookie,
      );
      if (!r) return null;
      const place: ResolvedPlace = {
        google_place_id: r.google_place_id,
        name: r.name,
        meta: r.meta,
        kind: p.kind,
        icon: p.icon,
      };
      return place;
    }),
  );

  const seen = new Set<string>();
  const places: ResolvedPlace[] = [];
  for (const p of resolved) {
    if (p && !seen.has(p.google_place_id)) {
      seen.add(p.google_place_id);
      places.push(p);
    }
  }
  if (places.length === 0) return null;
  return { heading: input.heading, lede: input.lede, places };
}

// ── Move proposal — parse + resolve ─────────────────────────────
// Model passes the moving card's UUID and the target day's UUID, both
// from the skeleton's tokens. Server reads the live rows to format the
// user-facing title, time, and day numbers — the model NEVER supplies
// titles, times, or day labels. Both edge cases are caught here so the
// confirm card never even renders for an invalid move.
interface MoveInput {
  heading: string;
  lede?: string;
  card_id: string;
  target_day_id: string;
}

function parseMoveInput(input: unknown): MoveInput | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const cardId =
    typeof o.card_id === "string" && o.card_id.trim() ? o.card_id.trim() : "";
  const targetDayId =
    typeof o.target_day_id === "string" && o.target_day_id.trim()
      ? o.target_day_id.trim()
      : "";
  if (!cardId || !targetDayId) return null;
  return {
    heading:
      typeof o.heading === "string" && o.heading.trim()
        ? o.heading.trim()
        : "About to move.",
    lede: typeof o.lede === "string" && o.lede.trim() ? o.lede.trim() : undefined,
    card_id: cardId,
    target_day_id: targetDayId,
  };
}

interface MoveCardRow {
  id: string;
  status: string;
  day_id: string | null;
  position: number | null;
  start_time: string | null;
  end_time: string | null;
  place: { title: string | null } | { title: string | null }[] | null;
  day: { day_number: number } | { day_number: number }[] | null;
}

type MoveResolution =
  | { ok: true; proposal: MoveProposal }
  | { ok: false; note: string };

async function resolveMoveProposal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  input: MoveInput,
): Promise<MoveResolution> {
  const { data } = await supabase
    .from("cards")
    .select(
      "id, status, day_id, position, start_time, end_time, place:places(title), day:days(day_number)",
    )
    .eq("trip_id", tripId)
    .eq("id", input.card_id)
    .maybeSingle();
  const card = data as MoveCardRow | null;

  if (!card) {
    return {
      ok: false,
      note: "I couldn't find that card on this journey — let's name it a little more precisely.",
    };
  }
  if (card.status === "cut") {
    return {
      ok: false,
      note: "That one's already cut — there's nothing to move.",
    };
  }
  // The unscheduled / interested edge case: no source day, so no move.
  if (!card.day_id || card.status !== "in_itinerary") {
    return {
      ok: false,
      note:
        "That one isn't on a day yet — it's in your unscheduled places, so there's nothing to move from. Schedule it onto a day first, or tell me to add a new place there directly.",
    };
  }

  const { data: targetDayRow } = await supabase
    .from("days")
    .select("id, day_number")
    .eq("trip_id", tripId)
    .eq("id", input.target_day_id)
    .maybeSingle();
  const targetDay = targetDayRow as { id: string; day_number: number } | null;
  if (!targetDay) {
    return {
      ok: false,
      note: "I couldn't find that day on this journey — let's name it a little more precisely.",
    };
  }

  // The same-day edge case: source equals target. The confirm card never
  // renders; the assistant just notes it plainly.
  if (card.day_id === targetDay.id) {
    return {
      ok: false,
      note: `It's already on Day ${targetDay.day_number} — nothing to move.`,
    };
  }

  const place = singleOf(card.place);
  const sourceDay = singleOf(card.day);
  const title = place?.title ?? "Untitled";
  const start = card.start_time ? card.start_time.slice(0, 5) : "";
  const end = card.end_time ? card.end_time.slice(0, 5) : "";
  const time = start ? (end ? `${start}–${end}` : start) : "no time set";

  return {
    ok: true,
    proposal: {
      heading: input.heading,
      lede: input.lede,
      card_id: card.id,
      card_title: title,
      card_time: time,
      source_day_number: sourceDay?.day_number ?? 0,
      target_day_id: targetDay.id,
      target_day_number: targetDay.day_number,
    },
  };
}

// ── Read tool: single-card detail ──────────────────────────────
async function getCardDetail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  cardId: unknown,
): Promise<unknown> {
  if (typeof cardId !== "string" || !cardId) {
    return { error: "card_id must be a string." };
  }
  const { data } = await supabase
    .from("cards")
    .select(
      "id, status, start_time, end_time, details, place:places(title, address, rating, price_level, type, sub_type)",
    )
    .eq("trip_id", tripId)
    .eq("id", cardId)
    .maybeSingle();
  return data ?? { error: "No such card in this journey." };
}

function buildApproveAck(names: string[]): string {
  if (names.length === 1) {
    return `Added ${names[0]} — it's held in this journey's places now, unscheduled. Slot it into a day whenever the shape feels right.`;
  }
  return `Added ${names.length} places — ${names.join(", ")} — held in this journey's places now, unscheduled. Slot them into days whenever the shape feels right.`;
}

function buildCutAck(names: string[]): string {
  if (names.length === 1) {
    return `Cut ${names[0]}. Nothing destroyed — held in case you want it back.`;
  }
  return `Cut ${names.length} cards — ${names.join(", ")}. Nothing destroyed — held in case you want them back.`;
}

function buildMoveAck(name: string, targetDayNumber: number, repackOk: boolean): string {
  // A successful move with a clean re-pack is the happy path. A move that
  // succeeded but whose source-day re-pack failed is a different state —
  // the card DID move; only the old day's order is left with a gap that
  // the next move/cut on that day will tidy. Surface that honestly rather
  // than presenting the whole move as a failure.
  if (!repackOk) {
    return `Moved ${name} to Day ${targetDayNumber} — its time held. The previous day's order may need a quick tidy; the move went through, but the old day didn't re-pack cleanly.`;
  }
  return `Moved ${name} to Day ${targetDayNumber} — its time held, sitting at the end of that day's order.`;
}

function buildRestoreAck(names: string[]): string {
  if (names.length === 1) {
    return `Restored ${names[0]} — back where it was.`;
  }
  return `Restored ${names.length} cards — ${names.join(", ")} — back where they were.`;
}

// ── Active conversation = the most-recent row's conversation_id ─
// Conversations are identified by conversation_id; the "active" one
// for a trip is whichever id last received a message. New-conversation
// = mint a new id and let the next insert reset which one wins.
async function getActiveConversationId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("companion_messages")
    .select("conversation_id")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = (data as { conversation_id: string | null } | null)?.conversation_id;
  return id ?? null;
}

// ════════════════════════════════════════════════════════════
// GET — load this journey's conversation history (trip-scoped)
// ════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  // Keep-warm short-circuit. Vercel Cron pings GET ?keepalive=1 every
  // 5 minutes to hold this Node lambda's container warm. Return before
  // ANY auth, Supabase, or Anthropic work — the whole point is a near-
  // zero-cost invocation. See vercel.json crons.
  if (req.nextUrl.searchParams.get("keepalive") === "1") {
    return new Response("ok", {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tripId = req.nextUrl.searchParams.get("tripId");
  if (!tripId) return NextResponse.json({ error: "tripId required" }, { status: 400 });

  // RLS scopes companion_messages through trips.user_id — a tripId that
  // is not the user's simply returns nothing. No cross-trip bleed.
  // Scope to the active conversation only — most-recent row's
  // conversation_id wins. Older conversations stay in the DB untouched
  // but do not bleed into the current thread.
  const activeId = await getActiveConversationId(supabase, tripId);
  if (!activeId) return NextResponse.json({ messages: [] });

  const { data } = await supabase
    .from("companion_messages")
    .select("id, role, content, created_at")
    .eq("trip_id", tripId)
    .eq("conversation_id", activeId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ messages: data ?? [] });
}

// ════════════════════════════════════════════════════════════
// POST — a conversation turn, an approval, or a discard
// ════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tripId = body.tripId;
  if (typeof tripId !== "string" || !tripId) {
    return NextResponse.json({ error: "tripId required" }, { status: 400 });
  }

  // Confirm the journey is the user's (RLS would also block).
  const { data: tripCheck } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();
  if (!tripCheck) return NextResponse.json({ error: "Journey not found" }, { status: 404 });

  if (body.approve !== undefined) return handleApprove(req, supabase, tripId, body.approve);
  if (body.approveCut !== undefined)
    return handleApproveCut(supabase, tripId, body.approveCut);
  if (body.approveMove !== undefined)
    return handleApproveMove(supabase, tripId, body.approveMove);
  if (body.restore !== undefined) return handleRestore(supabase, tripId, body.restore);
  if (body.discard === true) return handleDiscard(supabase, tripId);
  if (typeof body.message === "string") {
    // Optional: client-minted conversation_id for "new conversation" —
    // when present, this turn (and its assistant reply) start a fresh
    // conversation under that id. Old conversations stay in the DB
    // untouched.
    const clientConvId =
      typeof body.conversationId === "string" && body.conversationId.trim()
        ? body.conversationId.trim()
        : null;
    return handleTurn(req, supabase, apiKey, tripId, body.message, clientConvId);
  }
  return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
}

// ── Discard — leaves a quiet trace, writes no places ───────────
async function handleDiscard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
) {
  const conversationId = await getActiveConversationId(supabase, tripId);
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "assistant",
    content: DISCARD_TRACE,
    conversation_id: conversationId,
  });
  return NextResponse.json({ ok: true, trace: DISCARD_TRACE });
}

// ── Approve — the one write. Routes places through bulk-import
//    for Google enrichment, then inserts interested cards. ──────
async function handleApprove(
  req: NextRequest,
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  approve: unknown,
) {
  const ids: string[] = [];
  if (approve && typeof approve === "object") {
    const places = (approve as Record<string, unknown>).places;
    if (Array.isArray(places)) {
      for (const p of places) {
        if (p && typeof p === "object") {
          const id = (p as Record<string, unknown>).google_place_id;
          if (typeof id === "string" && id) ids.push(id);
        }
      }
    }
  }
  const googlePlaceIds = Array.from(new Set(ids));
  if (googlePlaceIds.length === 0) {
    return NextResponse.json({ error: "No places to add" }, { status: 400 });
  }

  // Enrichment + places rows go through bulk-import — never a direct
  // places insert. Forward the user's cookies so it stays RLS-scoped.
  const importRes = await fetch(new URL("/api/places/bulk-import", req.url).toString(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: JSON.stringify({ google_place_ids: googlePlaceIds }),
  });
  if (!importRes.ok) {
    return NextResponse.json({ error: "Place enrichment failed" }, { status: 502 });
  }
  const importData = (await importRes.json()) as {
    imported?: { place_id: string; google_place_id: string; title: string }[];
  };
  const imported = importData.imported ?? [];
  if (imported.length === 0) {
    return NextResponse.json({ error: "No places could be added" }, { status: 502 });
  }

  // Insert interested cards — unscheduled (day_id null), the single write
  // this route performs. The column set matches AddToTripSheet's working
  // insert: world facts (title / type / sub_type) live on the enriched
  // places row and join via place_id — they are not columns on `cards`.
  const cardRows = imported.map((i) => ({
    trip_id: tripId,
    day_id: null,
    status: "interested",
    position: 0,
    details: { place_id: i.google_place_id },
    place_id: i.place_id,
  }));
  const { error: insertErr } = await supabase.from("cards").insert(cardRows);
  if (insertErr) {
    console.error("[assistant] card insert failed", insertErr);
    return NextResponse.json({ error: "Could not add to the journey" }, { status: 500 });
  }

  const names = imported.map((i) => i.title);
  const ack = buildApproveAck(names);
  // Read the active conv id once so both rows of this turn share it.
  const conversationId = await getActiveConversationId(supabase, tripId);
  // Two sequential inserts so the pair gets distinct created_at timestamps
  // and reloads in the right order (companion_messages has no sequence).
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "user",
    content: `Approved — adding ${names.length} ${names.length === 1 ? "place" : "places"}.`,
    conversation_id: conversationId,
  });
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "assistant",
    content: ack,
    conversation_id: conversationId,
  });

  return NextResponse.json({ added: imported.length, names, ack });
}

// ── Approve Cut — flip status to 'cut', capture prior_status per
//    card so Restore can put each one back exactly where it was. ──
async function handleApproveCut(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  approveCut: unknown,
) {
  const ids: string[] = [];
  if (approveCut && typeof approveCut === "object") {
    const list = (approveCut as Record<string, unknown>).card_ids;
    if (Array.isArray(list)) {
      for (const v of list) {
        if (typeof v === "string" && v) ids.push(v);
      }
    }
  }
  const cardIds = Array.from(new Set(ids));
  if (cardIds.length === 0) {
    return NextResponse.json({ error: "No cards to cut" }, { status: 400 });
  }

  // Read current status per card BEFORE updating, so Restore can revert
  // each one to exactly where it was (in_itinerary, interested, etc.).
  const { data: priorRows } = await supabase
    .from("cards")
    .select("id, status, place:places(title)")
    .eq("trip_id", tripId)
    .in("id", cardIds)
    .neq("status", "cut");

  const priors = (priorRows ?? []) as {
    id: string;
    status: string;
    place: { title: string | null } | { title: string | null }[] | null;
  }[];

  if (priors.length === 0) {
    return NextResponse.json({ error: "No cards to cut" }, { status: 400 });
  }

  const restoreEntries: RestoreEntry[] = priors.map((p) => ({
    card_id: p.id,
    prior_status: p.status,
  }));
  const names = priors.map((p) => singleOf(p.place)?.title ?? "Untitled");

  const { error: updateErr } = await supabase
    .from("cards")
    .update({ status: "cut" })
    .eq("trip_id", tripId)
    .in(
      "id",
      priors.map((p) => p.id),
    );
  if (updateErr) {
    console.error("[assistant] cut update failed", updateErr);
    return NextResponse.json({ error: "Could not cut those cards" }, { status: 500 });
  }

  const ack = buildCutAck(names);
  const conversationId = await getActiveConversationId(supabase, tripId);
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "user",
    content: `Approved — cutting ${names.length} ${names.length === 1 ? "card" : "cards"}.`,
    conversation_id: conversationId,
  });
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "assistant",
    content: ack,
    conversation_id: conversationId,
  });

  return NextResponse.json({
    cut: priors.length,
    names,
    restore_entries: restoreEntries,
    ack,
  });
}

// ── Approve Move — relocate one card to a target day, append at the
//    end of its order, re-pack the source day. Two writes, no TX:
//    consistent with the rest of this route. The card's start_time /
//    end_time are NEVER touched. ─────────────────────────────────
async function handleApproveMove(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  approveMove: unknown,
) {
  let cardId = "";
  let targetDayId = "";
  if (approveMove && typeof approveMove === "object") {
    const o = approveMove as Record<string, unknown>;
    if (typeof o.card_id === "string") cardId = o.card_id.trim();
    if (typeof o.target_day_id === "string") targetDayId = o.target_day_id.trim();
  }
  if (!cardId || !targetDayId) {
    return NextResponse.json({ error: "Move missing card_id or target_day_id" }, { status: 400 });
  }

  // Re-read the card under RLS — defence in depth, the resolver's checks
  // ran at propose time; the world may have shifted (a cut, a manual
  // move) between proposal and approval.
  const { data: cardRow } = await supabase
    .from("cards")
    .select("id, status, day_id, position, place:places(title)")
    .eq("trip_id", tripId)
    .eq("id", cardId)
    .maybeSingle();
  const card = cardRow as
    | {
        id: string;
        status: string;
        day_id: string | null;
        position: number | null;
        place: { title: string | null } | { title: string | null }[] | null;
      }
    | null;
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  if (card.status !== "in_itinerary" || !card.day_id) {
    return NextResponse.json(
      { error: "That card isn't scheduled on a day — nothing to move." },
      { status: 400 },
    );
  }
  if (card.day_id === targetDayId) {
    return NextResponse.json(
      { error: "Card is already on that day." },
      { status: 400 },
    );
  }

  const { data: targetDayRow } = await supabase
    .from("days")
    .select("id, day_number")
    .eq("trip_id", tripId)
    .eq("id", targetDayId)
    .maybeSingle();
  const targetDay = targetDayRow as { id: string; day_number: number } | null;
  if (!targetDay) {
    return NextResponse.json({ error: "Target day not found" }, { status: 404 });
  }

  const sourceDayId = card.day_id;
  const currentPosition = card.position ?? 0;

  // Append at the END of the target day's manual order. Positions on a
  // day are contiguous 1..N for in_itinerary cards; reading the current
  // max and adding 1 keeps that invariant.
  const { data: maxRow } = await supabase
    .from("cards")
    .select("position")
    .eq("trip_id", tripId)
    .eq("day_id", targetDayId)
    .eq("status", "in_itinerary")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentMax = (maxRow as { position: number | null } | null)?.position ?? 0;
  const nextPos = currentMax + 1;

  // Write 1 — the actual move. start_time / end_time / status untouched.
  const { error: moveErr } = await supabase
    .from("cards")
    .update({ day_id: targetDayId, position: nextPos })
    .eq("trip_id", tripId)
    .eq("id", cardId);
  if (moveErr) {
    console.error("[assistant] move update failed", moveErr);
    return NextResponse.json({ error: "Could not move that card" }, { status: 500 });
  }

  // Write 2 — re-pack the source day. Decrement position by 1 for every
  // in_itinerary card whose position was above the moved card's old
  // position, so the source day stays contiguous 1..N. A failure here
  // does NOT undo the move; the card has already relocated. The worst
  // case is a one-slot gap on the old day that the next move/cut on
  // that day will close.
  let repackOk = true;
  const { data: repackRows, error: readErr } = await supabase
    .from("cards")
    .select("id, position")
    .eq("trip_id", tripId)
    .eq("day_id", sourceDayId)
    .eq("status", "in_itinerary")
    .gt("position", currentPosition);
  if (readErr) {
    console.error("[assistant] move re-pack read failed", sourceDayId, readErr);
    repackOk = false;
  } else {
    const rows = (repackRows ?? []) as { id: string; position: number | null }[];
    for (const r of rows) {
      const newPos = (r.position ?? 0) - 1;
      const { error: updErr } = await supabase
        .from("cards")
        .update({ position: newPos })
        .eq("trip_id", tripId)
        .eq("id", r.id);
      if (updErr) {
        console.error("[assistant] move re-pack update failed", r.id, updErr);
        repackOk = false;
        // Stop on first failure — a partial decrement is worse than a
        // single clean gap, since it can collide positions.
        break;
      }
    }
  }

  const name = singleOf(card.place)?.title ?? "Untitled";
  const ack = buildMoveAck(name, targetDay.day_number, repackOk);
  const conversationId = await getActiveConversationId(supabase, tripId);
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "user",
    content: `Approved — moving ${name} to Day ${targetDay.day_number}.`,
    conversation_id: conversationId,
  });
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "assistant",
    content: ack,
    conversation_id: conversationId,
  });

  return NextResponse.json({
    moved: true,
    name,
    target_day_number: targetDay.day_number,
    repack_ok: repackOk,
    ack,
  });
}

// ── Restore — direct, non-model. Reverts each card to the status
//    it held just before the cut (NOT a hardcoded fallback). ─────
async function handleRestore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  restore: unknown,
) {
  const entries: RestoreEntry[] = [];
  if (restore && typeof restore === "object") {
    const list = (restore as Record<string, unknown>).entries;
    if (Array.isArray(list)) {
      for (const e of list) {
        if (!e || typeof e !== "object") continue;
        const eo = e as Record<string, unknown>;
        if (
          typeof eo.card_id === "string" &&
          eo.card_id &&
          typeof eo.prior_status === "string" &&
          eo.prior_status
        ) {
          entries.push({ card_id: eo.card_id, prior_status: eo.prior_status });
        }
      }
    }
  }
  if (entries.length === 0) {
    return NextResponse.json({ error: "Nothing to restore" }, { status: 400 });
  }

  // Per-card update — a single UPDATE can't fan a different status to
  // each row, and the entry list is small (typically 1–3).
  for (const e of entries) {
    const { error } = await supabase
      .from("cards")
      .update({ status: e.prior_status })
      .eq("trip_id", tripId)
      .eq("id", e.card_id);
    if (error) {
      console.error("[assistant] restore failed for", e.card_id, error);
      return NextResponse.json({ error: "Could not restore" }, { status: 500 });
    }
  }

  const { data: nameRows } = await supabase
    .from("cards")
    .select("id, place:places(title)")
    .eq("trip_id", tripId)
    .in(
      "id",
      entries.map((e) => e.card_id),
    );
  const names = (nameRows ?? []).map(
    (r) =>
      singleOf(
        (r as { place: { title: string | null } | { title: string | null }[] | null })
          .place,
      )?.title ?? "Untitled",
  );

  const ack = buildRestoreAck(names);
  const conversationId = await getActiveConversationId(supabase, tripId);
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "user",
    content: `Restored ${entries.length} ${entries.length === 1 ? "card" : "cards"}.`,
    conversation_id: conversationId,
  });
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "assistant",
    content: ack,
    conversation_id: conversationId,
  });

  return NextResponse.json({ restored: entries.length, names, ack });
}

// ── Turn — the streaming Anthropic tool loop ───────────────────
async function handleTurn(
  req: NextRequest,
  supabase: Awaited<ReturnType<typeof createClient>>,
  apiKey: string,
  tripId: string,
  message: string,
  clientConvId: string | null,
) {
  const trimmed = message.trim();
  if (!trimmed) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  // Resolve the active conversation_id ONCE per turn so the user row,
  // the assistant final, and the history-window read all agree. Order:
  // a client-minted id (a fresh new-conversation) overrides; else the
  // most-recent row's id; else a fresh uuid for a brand-new trip.
  const activeConvId =
    clientConvId ?? (await getActiveConversationId(supabase, tripId)) ?? crypto.randomUUID();

  // Persist the user turn first — storage keeps the full thread.
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "user",
    content: trimmed,
    conversation_id: activeConvId,
  });

  // Skeleton — assembled once, here, then reused across the loop.
  const skeleton = await buildTripSkeleton(supabase, tripId);
  if (!skeleton) return NextResponse.json({ error: "Journey not found" }, { status: 404 });

  // Last HISTORY_TURNS turns, oldest-first, sent verbatim (no summarization).
  // Scoped to the active conversation — older conversations are out of
  // context for the model; that's the whole point of new-conversation.
  const { data: historyRows } = await supabase
    .from("companion_messages")
    .select("role, content")
    .eq("trip_id", tripId)
    .eq("conversation_id", activeConvId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_TURNS);
  const history = (historyRows ?? []).reverse() as { role: string; content: string }[];
  // The model requires the first message to be a user turn.
  while (history.length && history[0].role !== "user") history.shift();

  const messages: Anthropic.MessageParam[] = history.map((h) => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: h.content,
  }));

  const client = new Anthropic({ apiKey });
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: buildSystemPrompt(skeleton.text),
      cache_control: { type: "ephemeral" },
    },
  ];
  const origin = req.nextUrl.origin;
  const cookie = req.headers.get("cookie") ?? "";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AssistantStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

      let assistantText = "";
      let emittedProposal = false;

      try {
        for (let iter = 0; iter < MAX_TOOL_ITERS; iter++) {
          const ms = client.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system,
            tools: TOOLS,
            messages,
          });
          ms.on("text", (delta) => {
            assistantText += delta;
            send({ type: "text", delta });
          });
          const final = await ms.finalMessage();

          if (final.stop_reason === "tool_use") {
            const toolUses = final.content.filter(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
            );

            const proposeCut = toolUses.find((t) => t.name === "propose_cut");
            if (proposeCut) {
              // propose_cut pauses server-side — resolve titles from the
              // live DB and hand the proposal to the client; write nothing.
              const parsed = parseCutInput(proposeCut.input);
              const proposal = parsed
                ? await resolveCutProposal(supabase, tripId, parsed)
                : null;
              if (proposal) {
                emittedProposal = true;
                send({ type: "cut_proposal", proposal });
              } else {
                const note =
                  "\n\nI couldn't find those cards in this journey — let's name them a little more precisely.";
                assistantText += note;
                send({ type: "text", delta: note });
              }
              break;
            }

            const proposeMove = toolUses.find((t) => t.name === "propose_move");
            if (proposeMove) {
              // propose_move pauses server-side — verify the card/day pair
              // and hand a resolved proposal to the client; write nothing.
              // Both edge cases (same-day target, unscheduled card) decline
              // here with a specific note rather than emitting a proposal.
              const parsed = parseMoveInput(proposeMove.input);
              if (!parsed) {
                const note =
                  "\n\nI couldn't read that move — name the card and the day again, more precisely.";
                assistantText += note;
                send({ type: "text", delta: note });
              } else {
                const resolution = await resolveMoveProposal(supabase, tripId, parsed);
                if (resolution.ok) {
                  emittedProposal = true;
                  send({ type: "move_proposal", proposal: resolution.proposal });
                } else {
                  const note = `\n\n${resolution.note}`;
                  assistantText += note;
                  send({ type: "text", delta: note });
                }
              }
              break;
            }

            const propose = toolUses.find((t) => t.name === "propose_add");
            if (propose) {
              // propose_add pauses server-side — resolve candidates and
              // hand the proposal to the client; write nothing.
              const parsed = parseProposeInput(propose.input);
              const proposal = parsed
                ? await resolveProposal(parsed, skeleton.trip, origin, cookie)
                : null;
              if (proposal) {
                emittedProposal = true;
                send({ type: "proposal", proposal });
              } else {
                const note =
                  "\n\nI couldn't confirm those against the map — let's name them a little more precisely.";
                assistantText += note;
                send({ type: "text", delta: note });
              }
              break;
            }

            // Read tools execute silently, then feed back into the loop.
            messages.push({ role: "assistant", content: final.content });
            const results: Anthropic.ToolResultBlockParam[] = [];
            for (const tu of toolUses) {
              if (tu.name === "get_card_detail") {
                const detail = await getCardDetail(
                  supabase,
                  tripId,
                  (tu.input as Record<string, unknown>)?.card_id,
                );
                results.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: JSON.stringify(detail),
                });
              } else {
                results.push({
                  type: "tool_result",
                  tool_use_id: tu.id,
                  content: "That tool is not available.",
                  is_error: true,
                });
              }
            }
            messages.push({ role: "user", content: results });
            continue;
          }

          break; // end_turn, max_tokens, or refusal
        }
      } catch (err) {
        console.error("[assistant] turn error", err);
        send({ type: "error", message: "Something interrupted that — try again in a moment." });
      }

      // A calm fallback if the model produced nothing visible (e.g. a refusal).
      if (!assistantText.trim() && !emittedProposal) {
        const fallback = "Let's stay with the journey — tell me what you'd like to think through.";
        assistantText = fallback;
        send({ type: "text", delta: fallback });
      }

      // Storage keeps the full thread regardless of what was sent.
      if (assistantText.trim()) {
        await supabase.from("companion_messages").insert({
          trip_id: tripId,
          role: "assistant",
          content: assistantText.trim(),
          conversation_id: activeConvId,
        });
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
