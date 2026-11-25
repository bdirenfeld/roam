/**
 * Help messages (24 Nov 2026): the pure rules. The table is help_messages
 * (migration 022), reached only through src/app/api/help.
 */
export const MAX_BODY = 2000;
export const MAX_PICTURE_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** The words, or null when there is nothing to send. Control characters go; line breaks stay. */
export function cleanBody(v: unknown): string | null {
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim().slice(0, MAX_BODY);
  return t || null;
}

/** What Brennan searches Clarity for: the recording is tagged with it. */
export const messageCode = (id: string): string => "RM-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

/**
 * The screen, safe to keep. A share link's token opens someone's journey, so it
 * never leaves the page; neither does anything after ? or #.
 */
export function safeScreen(path: unknown): string | null {
  if (typeof path !== "string" || path.charAt(0) !== "/") return null;
  const bare = path.split(/[?#]/)[0].slice(0, 200);
  return bare.replace(/^\/journey\/[^/]+/, "/journey/[link]");
}
export function tripFromScreen(screen: string | null): string | null {
  const m = screen ? screen.match(/^\/trips\/([^/]+)/) : null;
  return m && isUuid(m[1]) ? m[1] : null;
}

/** Money, can't get in, lost work, privacy: Brennan's alert says Urgent. A keyword list, so it misses some. */
const URGENT = /\b(pay|paid|paying|payment|charged?|refund|billing|credit card|sign(?:ed)?[ -]?in|log(?:ged)?[ -]?in|locked out|password|lost (?:my|all|everything)|deleted my|disappeared|vanished|(?:is|are|it'?s) gone|privacy|personal data|my data|hacked)\b/i;
export const isUrgent = (body: string): boolean => URGENT.test(body.replace(/\u2019/g, "'"));

/**
 * May this person send another? Three an hour and ten a day; more once Brennan
 * has answered in the last day, so a conversation is never cut off.
 */
export function mayAsk(lastHour: number, lastDay: number, answeredToday: boolean): boolean {
  return answeredToday ? lastHour < 20 && lastDay < 40 : lastHour < 3 && lastDay < 10;
}

/** Alerts are capped so a flood can't fill his inbox; urgent ones have their own room. */
export function mayAlert(urgent: boolean, alertsToday: number): boolean {
  return alertsToday < (urgent ? 25 : 20);
}

/** The kind of picture by its first bytes, never by its name. */
export function pictureType(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  const s = (from: number) => String.fromCharCode(b[from], b[from + 1], b[from + 2], b[from + 3]);
  return s(0) === "RIFF" && s(8) === "WEBP" ? "image/webp" : null;
}

export interface HelpRow { id: string; user_id: string; from_admin: boolean; body: string; picture_path: string | null; context: Record<string, unknown> | null; read_at: string | null; created_at: string; trip_id?: string | null }
export interface Conversation { key: string; userId: string; tripId: string | null; rows: HelpRow[]; waiting: boolean; urgent: boolean; last: string }

/**
 * Which thread a message sits in: its journey's, or null for the one outside
 * any journey. A journey the person can no longer open (left it, or it was
 * deleted) falls back to null, so nothing they wrote goes out of reach.
 */
export const threadOf = (tripId: string | null | undefined, canOpen: (id: string) => boolean): string | null => (tripId && canOpen(tripId) ? tripId : null);

/** Brennan's unread replies sitting in threads other than the one on screen. */
export function unreadElsewhere(rows: { from_admin: boolean; read_at: string | null; trip_id?: string | null }[], here: string | null, canOpen: (id: string) => boolean): { trip: string | null; unread: number }[] {
  const out: { trip: string | null; unread: number }[] = [];
  rows.forEach((r) => {
    if (!r.from_admin || r.read_at) return;
    const trip = threadOf(r.trip_id, canOpen);
    if (trip === here) return;
    const hit = out.find((o) => o.trip === trip);
    if (hit) hit.unread++; else out.push({ trip, unread: 1 });
  });
  return out;
}

/** Rows in any order → one conversation per person AND journey: waiting first (urgent, then longest waiting), then newest. */
export function conversations(rows: HelpRow[]): Conversation[] {
  const by: Record<string, HelpRow[]> = {};
  rows.forEach((r) => { const k = r.user_id + "|" + (r.trip_id ?? ""); (by[k] = by[k] ?? []).push(r); });
  const out = Object.keys(by).map((key) => {
    const list = by[key].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lastRow = list[list.length - 1];
    let i = list.length;
    while (i > 0 && !list[i - 1].from_admin) i--;
    const open = list.slice(i);
    return { key, userId: lastRow.user_id, tripId: lastRow.trip_id ?? null, rows: list, waiting: open.length > 0, urgent: open.some((r) => isUrgent(r.body)), last: (open[0] ?? lastRow).created_at };
  });
  return out.sort((a, b) => {
    if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    return a.waiting ? a.last.localeCompare(b.last) : b.last.localeCompare(a.last);
  });
}
