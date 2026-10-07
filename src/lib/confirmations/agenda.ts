import type { ParsedConfirmation } from "./toCards";

/**
 * A conference's agenda (6 Oct 2026, "conference agenda", mocked and approved).
 * His Negotiation Mastery Summit PDF came in as one card at 7:30 AM with a note
 * that said "includes sessions" — not which, not when, and nothing on the second
 * day. The reader now returns each event day with its start, end and an ordered
 * schedule, and the sheet adds ONE card per day (never one per session, so the
 * day doesn't fill with ten blocks), its schedule in the card's notes.
 */

export interface AgendaItem { time: string | null; title: string }
export interface AgendaDay { date: string | null; start: string | null; end: string | null; items: AgendaItem[] }

/** Most sessions kept per day: bounds the reader's output and the card's note. */
export const MAX_AGENDA_ITEMS = 15;
/** Most event days kept from one booking. */
export const MAX_AGENDA_DAYS = 10;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const hhmm = (v: unknown) => { const s = str(v); const m = s?.match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };

/** The reader's agenda, cleaned: valid days only, at most MAX_AGENDA_DAYS, each with at most MAX_AGENDA_ITEMS. Null when there is none. */
export function cleanAgenda(raw: unknown): AgendaDay[] | null {
  if (!Array.isArray(raw)) return null;
  const days: AgendaDay[] = [];
  for (const d of raw) {
    if (!d || typeof d !== "object") continue;
    const o = d as Record<string, unknown>;
    const date = str(o.date);
    const items = (Array.isArray(o.items) ? o.items : [])
      .map((it): AgendaItem | null => {
        if (!it || typeof it !== "object") return null;
        const title = str((it as Record<string, unknown>).title);
        return title ? { time: hhmm((it as Record<string, unknown>).time), title: title.slice(0, 80) } : null;
      })
      .filter((x): x is AgendaItem => !!x)
      .slice(0, MAX_AGENDA_ITEMS);
    const day: AgendaDay = { date: date && ISO.test(date) ? date : null, start: hhmm(o.start), end: hhmm(o.end), items };
    if (!day.date && !day.items.length) continue;
    days.push(day);
    if (days.length >= MAX_AGENDA_DAYS) break;
  }
  return days.length ? days : null;
}

/** The schedule line's clock, 12-hour without AM/PM as the mock shows: 07:30 -> "7:30", 13:00 -> "1:00". */
function shortClock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
}

/**
 * The card's notes in the house markdown: "**Schedule**" (not "Day 1 schedule":
 * the event's Day 1 is the trip's Day 2, 7 Oct 2026), then one
 * "- 7:30 Breakfast and registration" line per session, then any short note
 * the booking already carried.
 */
export function agendaNotes(dayNumber: number, items: AgendaItem[], note: string | null | undefined): string {
  void dayNumber;
  const lines = ["**Schedule**", ...items.map((it) => `- ${it.time ? `${shortClock(it.time)} ` : ""}${it.title}`)];
  const extra = str(note);
  return extra ? `${lines.join("\n")}\n\n${extra}` : lines.join("\n");
}

/** Marks an item the sheet made from one day of an agenda. */
export interface AgendaDayMark { n: number; of: number; sessions: number }
export type ExpandedConfirmation = ParsedConfirmation & { agenda_day?: AgendaDayMark };

/**
 * One booking per event day when it carries an agenda; anything else as it is.
 * Each day keeps the booking's title, place and address; its date and times are
 * that day's; its notes are that day's schedule. A price stays on day 1.
 */
export function expandAgenda(p: ParsedConfirmation): ExpandedConfirmation[] {
  const days = cleanAgenda(p.agenda);
  const { agenda: _a, ...base } = p;
  void _a;
  if (!days) return [p.agenda === undefined ? p : base];
  return days.map((d, i) => ({
    ...base,
    date: d.date ?? (i === 0 ? p.date : null),
    time: d.start ?? (i === 0 ? p.time : null),
    end_time: d.end ?? (i === 0 ? p.end_time : null),
    notes: agendaNotes(i + 1, d.items, p.notes),
    ...(i > 0 ? { total_paid: null } : {}),
    agenda_day: { n: i + 1, of: days.length, sessions: d.items.length },
  }));
}

/** Every booking expanded, with each new item's file index carried along. */
export function expandAll(items: ParsedConfirmation[], fileOf?: number[]): { items: ExpandedConfirmation[]; fileOf: number[] } {
  const out: ExpandedConfirmation[] = [];
  const files: number[] = [];
  items.forEach((p, i) => { for (const e of expandAgenda(p)) { out.push(e); files.push(fileOf?.[i] ?? 0); } });
  return { items: out, fileOf: files };
}

function clock12(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** The sheet's line for an agenda day: "Mon 15 Mar · 7:30 AM – 5:00 PM · 7 sessions". */
export function agendaLine(date: string | null, start: string, end: string, sessions: number): string {
  const parts: string[] = [];
  if (date) {
    const [y, mo, d] = date.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    parts.push(`${dt.toLocaleDateString("en-GB", { weekday: "short" })} ${d} ${dt.toLocaleDateString("en-GB", { month: "short" })}`);
  }
  const s = hhmm(start), e = hhmm(end);
  if (s) parts.push(e ? `${clock12(s)} – ${clock12(e)}` : clock12(s));
  if (sessions > 0) parts.push(`${sessions} session${sessions === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
