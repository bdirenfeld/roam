import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { notesPrompt, parseNotes, dayHoursLine, composeNote, batchesOf, NOTES_BATCH, type NotePlace, type WrittenNote } from "@/lib/plan/notes";

// ── Notes for the cards Plan my trip just placed (29 Sep 2026) ─────────────
//
// Each planned card gets his house note: **Intent** and **Know before you
// go** (lib/plan/notes). Claude writes a place's text once, in one call for
// the whole plan, and it is kept in public.find_cache under "note|" keys for
// everyone (service role only, as Find's answers). The day's hours are added
// from the place's own saved hours. A card that already has notes is never
// touched. If Claude is unavailable the cards simply stay as they were.

// Web searches and Claude writing: 60 s cut Tuscany's event search off (30 Sep 2026).
export const maxDuration = 180;

type Row = {
  id: string; day_id: string | null; details: Record<string, unknown> | null;
  place: { google_place_id: string | null; title: string; sub_type: string | null; address: string | null; hours: { weekday_text?: string[] } | null; details: { types?: string[] } | null } | null;
};

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null) as { tripId?: string; cardIds?: string[]; warm?: boolean } | null;
  // Warm: write the saved places' notes into the shared cache only, never into
  // the saved cards, so a place dropped on a day later gets its note at once
  // (Brennan, 30 Sep 2026: "can it be almost instantaneous").
  const warm = body?.warm === true;
  const tripId = body?.tripId;
  const cardIds = (body?.cardIds ?? []).filter((x) => typeof x === "string").slice(0, 80);
  if (!tripId || cardIds.length === 0) return NextResponse.json({ error: "tripId and cardIds are required" }, { status: 400 });

  // RLS: only the journey's own cards come back.
  const [{ data: trip }, { data: rows }, { data: people }] = await Promise.all([
    gate.supabase.from("trips").select("id, start_date, party_size, party_ages").eq("id", tripId).maybeSingle(),
    gate.supabase.from("cards").select("id, day_id, details, place:places(google_place_id, title, type, sub_type, address, hours, details)").eq("trip_id", tripId).in("id", cardIds),
    gate.supabase.from("people").select("birthdate").eq("trip_id", tripId),
  ]);
  if (!trip) return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  const cards = ((rows ?? []) as unknown as Row[]).filter((c) => c.place?.google_place_id && (c.place as { type?: string }).type !== "logistics" && !(typeof c.details?.notes === "string" && c.details.notes.trim()));
  if (cards.length === 0) return NextResponse.json({ written: 0 });

  const start = Date.parse(trip.start_date + "T12:00:00Z");
  const ages = [
    ...(((trip.party_ages as number[] | null) ?? [])),
    ...((people ?? []).map((p) => (p.birthdate ? Math.floor((start - Date.parse(p.birthdate + "T12:00:00Z")) / (365.25 * 86_400_000)) : null)).filter((a): a is number => a != null)),
  ];
  const kids = ages.filter((a) => a < 13);
  const party = trip.party_size ?? (ages.length || 2);
  const who = kids.length ? `a family of ${party} with children aged ${kids.join(", ")}` : `${party} adult${party === 1 ? "" : "s"}`;
  const keyOf = (gpid: string) => `note|${gpid}|${kids.length ? "kids" : "adults"}`;

  // What is already written, for anyone.
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try { admin = createAdminClient(); } catch { admin = null; }
  const written: Record<string, WrittenNote> = {};
  const gpids = Array.from(new Set(cards.map((c) => c.place!.google_place_id!)));
  if (admin) {
    const { data: hits } = await admin.from("find_cache").select("key, results").in("key", gpids.map(keyOf));
    for (const h of hits ?? []) written[(h.key as string).split("|")[1]] = h.results as WrittenNote;
  }

  const missing = gpids.filter((g) => !written[g]);
  if (missing.length) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ written: 0, error: "Notes are unavailable just now" }, { status: 502 });
    if (!(await underQuota(gate.supabase, "planNotes", QUOTA.planNotes))) return quotaExceeded("trip notes");
    const places: NotePlace[] = missing.map((g) => {
      const p = cards.find((c) => c.place!.google_place_id === g)!.place!;
      return { key: g, title: p.title, subType: p.sub_type, address: p.address, types: p.details?.types ?? [] };
    });
    // Six places a call, all at once: Japan's 23 in one call ran past the
    // 60-second limit and wrote nothing (30 Sep 2026).
    const client = new Anthropic({ apiKey });
    const batches = batchesOf(places, NOTES_BATCH);
    const results = await Promise.allSettled(batches.map(async (batch) => {
      const res = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2500,
        messages: [{ role: "user", content: notesPrompt(batch, who) }],
      });
      const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      return parseNotes(text);
    }));
    const got: Record<string, WrittenNote> = {};
    for (const r of results) {
      if (r.status === "fulfilled") Object.assign(got, r.value);
      else console.error("[plan/notes]", r.reason);
    }
    Object.assign(written, got);
    if (admin) {
      const now = new Date().toISOString();
      const up = Object.entries(got).map(([g, n]) => ({ key: keyOf(g), results: n, created_at: now }));
      if (up.length) await admin.from("find_cache").upsert(up);
    }
    if (!Object.keys(written).length) return NextResponse.json({ written: 0, error: "Notes are unavailable just now" }, { status: 502 });
  }
  if (warm) return NextResponse.json({ warmed: Object.keys(written).length });

  // The day each card is on, for its hours line.
  const dayIds = Array.from(new Set(cards.map((c) => c.day_id).filter((d): d is string => !!d)));
  const { data: days } = dayIds.length ? await gate.supabase.from("days").select("id, date").in("id", dayIds) : { data: [] };
  const dateOf = new Map((days ?? []).map((d) => [d.id as string, d.date as string]));

  let count = 0;
  const out: Record<string, string> = {};
  await Promise.all(cards.map(async (c) => {
    const n = written[c.place!.google_place_id!];
    if (!n) return;
    const notes = composeNote(n, dayHoursLine(c.place!.hours?.weekday_text, c.day_id ? dateOf.get(c.day_id) ?? null : null));
    const { error } = await gate.supabase.from("cards").update({ details: { ...(c.details ?? {}), notes } }).eq("id", c.id);
    if (!error) { count++; out[c.id] = notes; }
  }));
  // The notes themselves, so the screen shows them without a reload.
  return NextResponse.json({ written: count, notes: out });
}
