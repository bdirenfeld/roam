/**
 * A cruise's port of call (17 Nov 2026, Don's feedback, mock approved by
 * Brennan): a logistics place of sub_type "port". Its card's start is when the
 * ship docks and its end is all aboard; the hours between are time ashore.
 * The phone day shows "Docked in X · 11 h ashore" … "All aboard"; the week
 * shows the same two moments as small markers, like a hotel's check-in and
 * check-out, so the free time between them stays visibly free.
 */

import { stripDuration } from "@/lib/week/travelStrip";

type PortLike = { start_time: string | null; end_time: string | null; place?: { sub_type?: string | null; title?: string | null } | null; details?: unknown };

export const isPortCard = (c: PortLike): boolean => c.place?.sub_type === "port";

export const portName = (c: PortLike): string => (c.place?.title ?? "").trim() || "Port";

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/**
 * Nights in port (17 Nov 2026 overnight; 18 Nov 2026 any number, Brennan: All
 * aboard gets a date, picked on the hotel calendar). Times alone cannot say
 * the ship stays (docks 08:00 Thursday, all aboard 18:00 Saturday), so the card
 * carries `details.nights`: how many days after docking all aboard falls.
 * The older `details.overnight = true` reads as one night.
 */
export function nightsInPort(c: PortLike): number {
  if (!c.start_time || !c.end_time) return 0;
  const d = c.details as { nights?: unknown; overnight?: unknown } | null | undefined;
  if (typeof d?.nights === "number" && Number.isInteger(d.nights) && d.nights > 0) return d.nights;
  return d?.overnight === true ? 1 : 0;
}

/** All aboard is a later day than docking. */
export const isOvernight = (c: PortLike): boolean => nightsInPort(c) > 0;

/** The details to write for a stay of `nights` (the old flag is cleared so the two never disagree). */
export const nightsPatch = (details: unknown, nights: number): Record<string, unknown> => {
  const next = { ...((details ?? {}) as Record<string, unknown>) };
  delete next.overnight;
  if (nights > 0) next.nights = nights; else delete next.nights;
  return next;
};

/** Minutes ashore, nights in port included; null when there is no all-aboard time. */
export function minutesAshore(c: PortLike): number | null {
  if (!c.start_time || !c.end_time) return null;
  const m = toMin(c.end_time) - toMin(c.start_time) + nightsInPort(c) * 24 * 60;
  return m > 0 ? m : null;
}

const DAY_MS = 86_400_000;
/** YYYY-MM-DD plus n days. */
export const addIsoDays = (iso: string, n: number): string => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const isoDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / DAY_MS);

/**
 * How a port that docked on `docksDate` touches `date`: the docking day,
 * a day spent in port all day, the day it leaves (all aboard), or not at all.
 */
export function portDayRole(c: PortLike, docksDate: string, date: string): "docks" | "in-port" | "leaves" | null {
  const k = isoDiff(docksDate, date), n = nightsInPort(c);
  if (k === 0) return "docks";
  if (k > 0 && k < n) return "in-port";
  if (k > 0 && k === n) return "leaves";
  return null;
}

/** Each date a port covers (docking day through the day it leaves) → its name, for every port but one. */
export function otherPortDays(ports: (PortLike & { id: string; day_id: string | null })[], dateOf: (dayId: string) => string | undefined, exceptId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of ports) {
    if (c.id === exceptId || !isPortCard(c) || !c.day_id) continue;
    const d = dateOf(c.day_id);
    if (!d) continue;
    for (let k = 0; k <= nightsInPort(c); k++) out[addIsoDays(d, k)] = portName(c);
  }
  return out;
}

/** "11 h ashore", "9 h 30 ashore", "34 h ashore", or null. */
export function ashoreLabel(c: PortLike): string | null {
  const m = minutesAshore(c);
  return m == null ? null : `${stripDuration(m)} ashore`;
}
