import { NextRequest, NextResponse } from "next/server";
import { underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { EntryAdvisory, EntryData, EntryLine } from "@/lib/entry/types";

// ── What do these passports need to enter this country? ───────────────────
//
// One lookup per journey: Claude, with web search, reads the Government of
// Canada travel advice page for the destination (the page border agents and
// airlines work from) and returns the requirement as lines — visa, anything
// to do before you go, onward travel, passport validity — each with the
// source and the date. Runs on the app's key, so every traveller gets it.
// Rechecked 30 days before departure; a change is flagged for the owner.
// It never applies for anything: it says what to do and links to the page.

export const maxDuration = 60;

function extractJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  const candidates = [t, t.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], t.match(/\{[\s\S]*\}/)?.[0]];
  for (const c of candidates) {
    if (!c) continue;
    try { return JSON.parse(c.trim()) as Record<string, unknown>; } catch { /* next */ }
  }
  return null;
}

function countryOf(destination: string): string {
  const parts = destination.split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || destination;
}

const s = (v: unknown, max = 400): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!(await underQuota(supabase, "entryCheck", QUOTA.entryCheck))) return quotaExceeded("entry checks");

  let body: { tripId?: string; passports?: string[] } = {};
  try { body = (await req.json()) as typeof body; } catch { /* below */ }
  const tripId = body.tripId;
  if (!tripId) return NextResponse.json({ error: "tripId is required" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Entry lookup isn't configured" }, { status: 500 });

  const [{ data: trip }, { data: existing, error: tableError }, { data: people }] = await Promise.all([
    supabase.from("trips").select("id, user_id, destination, start_date, end_date, party_size, party_ages").eq("id", tripId).single(),
    supabase.from("trip_entry").select("passports, data").eq("trip_id", tripId).maybeSingle(),
    supabase.from("people").select("birthdate").eq("trip_id", tripId),
  ]);
  if (!trip) return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  // The table is created by migration 009; until it exists, say so before
  // paying for a lookup that could not be saved.
  if (tableError) return NextResponse.json({ error: "Entry requirements aren't set up yet" }, { status: 503 });
  if (trip.user_id !== user.id) return NextResponse.json({ error: "Only the owner can check entry requirements" }, { status: 403 });

  const passports = (body.passports?.length ? body.passports : (existing?.passports as string[] | undefined)) ?? ["Canadian"];
  const previous = (existing?.data ?? null) as EntryData | null;
  const country = countryOf((trip.destination as string) ?? "");
  const nights = trip.start_date && trip.end_date
    ? Math.round((new Date(trip.end_date as string).getTime() - new Date(trip.start_date as string).getTime()) / 86400000)
    : null;

  const system = `You check what a family needs to enter a country, so a trip is not stopped at the airport. Use web search and read the Government of Canada travel advice page for the destination (travel.gc.ca/destinations/...), the "Entry and exit requirements" section, plus the destination's own official entry page if one is named there. Answer for the passports listed. If two passports are listed, give the stricter rule and say which passport it applies to.
Also read the page's risk level at the top ("Take normal security precautions" = 1, "Exercise a high degree of caution" = 2, "Avoid non-essential travel" = 3, "Avoid all travel" = 4) and give it as "advisory" with the page's own label and its one-sentence reason (null at level 1).
Return exactly one JSON object and nothing after it:
{
 "country": string,
 "advisory": {"level": 1|2|3|4, "label": string, "reason": string|null},
 "lines": [
   {"key": "visa", "label": "Visa", "text": string, "why": string|null, "action": boolean, "deadline": "YYYY-MM-DD"|null},
   {"key": "before", "label": "Before you go", "text": string, "why": string|null, "action": true, "deadline": "YYYY-MM-DD"|null},
   {"key": "onward", "label": "Onward travel", "text": string, "why": string|null, "action": boolean, "deadline": null},
   {"key": "passport", "label": "Passport", "text": string, "why": string|null, "action": false, "deadline": null}
 ],
 "source_url": string,
 "source_name": "Government of Canada travel advice"
}
Rules: "text" is ONE plain sentence, at most 20 words, stating the requirement — not advice. "why" is at most 12 words, or null. "action" is true only when the traveller is REQUIRED to do something before departure (apply, register, fill a form, buy a return ticket, get a vaccination certificate): a visa that is not required is action false; an online authorization or entry form that is required is action true with the deadline it must be done by, given the travel dates. Anything merely recommended or advised (a consent letter, extra passport validity, travel insurance) is action false and its text starts with "Recommended:". Omit the "before" line entirely if there is nothing to do before departure. Add at most two more lines with key "other-1"/"other-2" for anything else that can stop entry (a vaccination certificate, a minor travelling with one parent needing a consent letter, a fee paid on arrival). Do not invent requirements; if the page does not say, do not add a line.`;

  const userMsg = `Destination: ${trip.destination}
Country: ${country}
Passports: ${passports.join(", ")}
Party: ${trip.party_size ?? "unknown"} people, including children
Travel dates: ${trip.start_date} to ${trip.end_date}${nights != null ? ` (${nights} nights)` : ""}
Today: ${new Date().toISOString().slice(0, 10)}`;

  let parsed: Record<string, unknown> | null = null;
  try {
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userMsg }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    });
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
    parsed = extractJson(text);
  } catch {
    return NextResponse.json({ error: "Couldn't reach the lookup just now" }, { status: 502 });
  }
  if (!parsed || !Array.isArray(parsed.lines)) {
    return NextResponse.json({ error: "The lookup didn't return a usable answer" }, { status: 502 });
  }

  // Ticks survive a recheck: a line with the same key keeps its "done".
  const prevDone = new Map((previous?.lines ?? []).map((l) => [l.key, l.done]));
  const lines: EntryLine[] = (parsed.lines as Record<string, unknown>[])
    .map((l, i): EntryLine | null => {
      const key = s(l.key, 40) ?? `other-${i}`;
      const text = s(l.text);
      if (!text) return null;
      return {
        key,
        label: s(l.label, 40) ?? "Entry",
        text,
        why: s(l.why, 200),
        // A recommendation is a fact to know, not a box to tick.
        action: Boolean(l.action) && !(/\b(recommend|advis)/i.test(text) && !/\b(required|must|mandatory)\b/i.test(text)),
        done: prevDone.get(key) ?? false,
        deadline: typeof l.deadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.deadline) ? l.deadline : null,
      };
    })
    .filter((l): l is EntryLine => l !== null)
    .filter((l) => !/consent letter/i.test(l.text));

  // The consent letter never depends on the lookup. A child travelling
  // without both parents needs one; it is easy to do and easy to forget
  // (Brennan, Sep 2026: "don't want to get screwed on something so easy").
  // Standing on any journey with a child; only omitted when every age is
  // known and every traveller is an adult.
  const startMs = trip.start_date ? new Date(trip.start_date + "T12:00:00").getTime() : Date.now();
  const ages: number[] = [
    ...(((trip.party_ages as number[] | null) ?? []).filter((a) => typeof a === "number")),
    ...((people ?? [])
      .map((x) => (x.birthdate ? (startMs - new Date(x.birthdate + "T12:00:00").getTime()) / (365.25 * 86400000) : null))
      .filter((a): a is number => a != null)),
  ];
  const hasChild = ages.length === 0 || ages.some((a) => a < 18);
  if (hasChild && !lines.some((l) => l.key === "consent")) {
    // A week before departure, unless that day has already gone — then the
    // departure date itself (the block reads it as "before you fly").
    const today = new Date().toISOString().slice(0, 10);
    const week = new Date(startMs - 7 * 86400000).toISOString().slice(0, 10);
    const weekBefore = week < today ? new Date(startMs).toISOString().slice(0, 10) : week;
    lines.push({
      key: "consent",
      label: "Consent letter",
      text: "Needed for any child travelling without both parents; notarized.",
      why: "Tick when sorted or not needed.",
      action: true,
      done: prevDone.get("consent") ?? false,
      deadline: weekBefore,
    });
  }

  // The advisory: only a level the page states; the reason as one sentence.
  const adv = parsed.advisory as { level?: unknown; label?: unknown; reason?: unknown } | null | undefined;
  const advLevel = typeof adv?.level === "number" && adv.level >= 1 && adv.level <= 4 ? (Math.round(adv.level) as 1 | 2 | 3 | 4) : null;
  const advisory: EntryAdvisory | null = advLevel
    ? { level: advLevel, label: s(adv?.label, 80) ?? ["", "Take normal security precautions", "Exercise a high degree of caution", "Avoid non-essential travel", "Avoid all travel"][advLevel], reason: advLevel === 1 ? null : (s(adv?.reason, 200) ?? null) }
    : null;

  const sourceUrl = s(parsed.source_url, 500);
  const start = trip.start_date ? new Date(trip.start_date + "T12:00:00") : null;
  const nextCheck = start ? new Date(start.getTime() - 30 * 86400000).toISOString().slice(0, 10) : null;

  // What changed since last time, in one line, for the toast.
  let changeNote: string | null = null;
  if (previous) {
    const before = new Map(previous.lines.map((l) => [l.key, l.text]));
    const diff = lines.filter((l) => before.get(l.key) !== l.text);
    const gone = previous.lines.filter((l) => !lines.some((n) => n.key === l.key));
    if (diff.length || gone.length) {
      const first = diff[0] ?? gone[0];
      changeNote = `${first.label}: ${diff[0] ? diff[0].text : "no longer listed"}`;
    }
    // A moved advisory level counts as a change, and leads.
    const prevLevel = previous.advisory?.level ?? null;
    if (advisory && prevLevel != null && advisory.level !== prevLevel) changeNote = `Advisory: ${advisory.label}`;
  }

  const data: EntryData = {
    country: s(parsed.country, 80) ?? country,
    advisory,
    status: lines.some((l) => l.action && !l.done) ? "action" : "clear",
    lines,
    source_url: sourceUrl && /^https?:\/\//.test(sourceUrl) ? sourceUrl : null,
    source_name: s(parsed.source_name, 80) ?? "Government of Canada travel advice",
    checked_at: new Date().toISOString(),
    next_check: nextCheck,
    change_note: changeNote,
  };

  const { error } = await supabase.from("trip_entry").upsert(
    { trip_id: tripId, passports, data, changed: Boolean(changeNote), checked_at: data.checked_at, updated_at: data.checked_at },
    { onConflict: "trip_id" },
  );
  if (error) return NextResponse.json({ error: "Couldn't save the answer", detail: error.message }, { status: 500 });

  return NextResponse.json({ passports, data, changed: Boolean(changeNote) });
}
