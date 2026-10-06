/**
 * What a planned card says (29 Sep 2026, Brennan: "for each card you need an
 * overview and a know before you go written ... otherwise it's hard to tell
 * what's going on"). Written in the house format his own cards already use:
 *
 *   **Intent**
 *   One sentence: what it is and why it is on the day.
 *
 *   **Know before you go**
 *   - practical points (tickets, dress, closures, what to order...)
 *   - the place's hours that day, from Google, when known
 *
 * Claude writes the Intent and the points, once per place (cached for
 * everyone); the day's hours are ours, from the place's saved hours.
 */

export interface NotePlace {
  /** Google place id: the cache key, and how the answer is matched back. */
  key: string;
  title: string;
  subType: string | null;
  address: string | null;
  types: string[];
}

export interface WrittenNote { intent: string; know: string[] }

export function notesPrompt(places: NotePlace[], who: string): string {
  const list = places.map((p) => `- ${p.key} | ${p.title} | ${p.subType ?? "place"} | ${p.address ?? ""}`).join("\n");
  return `You are writing short notes for a travel itinerary, for ${who}.
The traveller has already chosen these places; your job is to help the visit go well, not to judge it.
For each place below write:
- "intent": one warm, plain sentence, under 25 words, saying what it is and what is good about going.
  No verdicts or put-downs ("overpriced", "touristy", "not worth it", "best for older children").
- "know": 2 to 4 short practical points that make the visit easier, each phrased as what to do:
  booking or timed-entry tickets, dress codes, closed days, cash only, when to go to beat queues, what to
  order, how to make it work with children when there are any ("leave the stroller at the door", not
  "difficult with a 3-year-old"). Only what is true of this place; never generic filler like "check the website".
Write plainly and kindly, no marketing words. If you do not know a place, say what it is from its name and kind, and
give no points you cannot stand behind.
Places (id | name | kind | address):
${list}
Reply with JSON only: {"notes":{"<id>":{"intent":string,"know":[string]}}}`;
}

export function parseNotes(text: string): Record<string, WrittenNote> {
  const t = text.trim();
  const candidates = [t, t.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1], t.match(/\{[\s\S]*\}/)?.[0]];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const j = JSON.parse(c.trim()) as { notes?: Record<string, { intent?: unknown; know?: unknown }> };
      if (!j.notes || typeof j.notes !== "object") continue;
      const out: Record<string, WrittenNote> = {};
      for (const [k, v] of Object.entries(j.notes)) {
        const intent = typeof v?.intent === "string" ? v.intent.trim().slice(0, 240) : "";
        const know = Array.isArray(v?.know) ? v.know.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 200)).slice(0, 4) : [];
        if (intent) out[k] = { intent, know };
      }
      return out;
    } catch { /* next */ }
  }
  return {};
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Open 9:00 AM – 6:00 PM that day" (or "Closed that day") from Google's weekday_text; null when unknown. */
export function dayHoursLine(weekdayText: string[] | null | undefined, date: string | null): string | null {
  if (!weekdayText?.length || !date) return null;
  const day = DAYS[new Date(date + "T12:00:00Z").getUTCDay()];
  const line = weekdayText.find((l) => l.startsWith(day + ":"));
  if (!line) return null;
  const hours = line.slice(day.length + 1).trim();
  if (/closed/i.test(hours)) return "Closed that day";
  if (/open 24 hours/i.test(hours)) return "Open 24 hours";
  return `Open ${hours} that day`;
}

export function composeNote(n: WrittenNote, hoursLine: string | null): string {
  const points = [...n.know, ...(hoursLine ? [hoursLine] : [])];
  return `**Intent**\n${n.intent}` + (points.length ? `\n\n**Know before you go**\n${points.map((p) => `- ${p}`).join("\n")}` : "");
}

/**
 * Cards from this moment on get notes when they land on a day, however they
 * got there (his call, 29 Sep 2026: "whenever a place goes onto a day").
 * Older cards are left alone: he builds some journeys by hand (Tuscany) and
 * a note appearing in them unasked would be writing in his notebook.
 */
export const NOTES_FROM = "2026-09-29T22:30:00Z";

type NoteCard = { id: string; status?: string | null; day_id?: string | null; place_id?: string | null; created_at?: string | null; details?: unknown; place?: { type?: string | null } | null };

/** The cards on a day, with a place, created since `since`, with no notes yet. */
export function cardsNeedingNotes(cards: NoteCard[], since = NOTES_FROM): string[] {
  const from = Date.parse(since);
  return cards
    // Hotels, flights and transit are bookings, not places to explain.
    .filter((c) => c.status === "in_itinerary" && c.day_id && c.place_id && c.place?.type !== "logistics")
    // No created_at: made on screen this session, not yet reloaded from the database.
    .filter((c) => !c.created_at || Date.parse(c.created_at) >= from)
    .filter((c) => { const n = (c.details as { notes?: unknown } | null)?.notes; return !(typeof n === "string" && n.trim()); })
    .map((c) => c.id);
}

/** Places per Claude call: a batch finds its words well inside the 60-second limit. */
export const NOTES_BATCH = 6;

/** Split a list into runs of at most `size`. */
export function batchesOf<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
