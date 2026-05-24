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

function buildRestoreAck(names: string[]): string {
  if (names.length === 1) {
    return `Restored ${names[0]} — back where it was.`;
  }
  return `Restored ${names.length} cards — ${names.join(", ")} — back where they were.`;
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
  const { data } = await supabase
    .from("companion_messages")
    .select("id, role, content, created_at")
    .eq("trip_id", tripId)
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
  if (body.restore !== undefined) return handleRestore(supabase, tripId, body.restore);
  if (body.discard === true) return handleDiscard(supabase, tripId);
  if (typeof body.message === "string") {
    return handleTurn(req, supabase, apiKey, tripId, body.message);
  }
  return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
}

// ── Discard — leaves a quiet trace, writes no places ───────────
async function handleDiscard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
) {
  await supabase
    .from("companion_messages")
    .insert({ trip_id: tripId, role: "assistant", content: DISCARD_TRACE });
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
  // Two sequential inserts so the pair gets distinct created_at timestamps
  // and reloads in the right order (companion_messages has no sequence).
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "user",
    content: `Approved — adding ${names.length} ${names.length === 1 ? "place" : "places"}.`,
  });
  await supabase
    .from("companion_messages")
    .insert({ trip_id: tripId, role: "assistant", content: ack });

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
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "user",
    content: `Approved — cutting ${names.length} ${names.length === 1 ? "card" : "cards"}.`,
  });
  await supabase
    .from("companion_messages")
    .insert({ trip_id: tripId, role: "assistant", content: ack });

  return NextResponse.json({
    cut: priors.length,
    names,
    restore_entries: restoreEntries,
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
  await supabase.from("companion_messages").insert({
    trip_id: tripId,
    role: "user",
    content: `Restored ${entries.length} ${entries.length === 1 ? "card" : "cards"}.`,
  });
  await supabase
    .from("companion_messages")
    .insert({ trip_id: tripId, role: "assistant", content: ack });

  return NextResponse.json({ restored: entries.length, names, ack });
}

// ── Turn — the streaming Anthropic tool loop ───────────────────
async function handleTurn(
  req: NextRequest,
  supabase: Awaited<ReturnType<typeof createClient>>,
  apiKey: string,
  tripId: string,
  message: string,
) {
  const trimmed = message.trim();
  if (!trimmed) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  // Persist the user turn first — storage keeps the full thread.
  await supabase
    .from("companion_messages")
    .insert({ trip_id: tripId, role: "user", content: trimmed });

  // Skeleton — assembled once, here, then reused across the loop.
  const skeleton = await buildTripSkeleton(supabase, tripId);
  if (!skeleton) return NextResponse.json({ error: "Journey not found" }, { status: 404 });

  // Last HISTORY_TURNS turns, oldest-first, sent verbatim (no summarization).
  const { data: historyRows } = await supabase
    .from("companion_messages")
    .select("role, content")
    .eq("trip_id", tripId)
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
        await supabase
          .from("companion_messages")
          .insert({ trip_id: tripId, role: "assistant", content: assistantText.trim() });
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
