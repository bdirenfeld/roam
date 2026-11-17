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
 * Overnight in port (17 Nov 2026): the ship stays the night and all aboard is
 * the NEXT day. Times alone cannot say so (docks 08:00 Thursday, all aboard
 * 18:00 Friday has an end after its start), so the card carries
 * `details.overnight = true`. One night at most.
 */
export function isOvernight(c: PortLike): boolean {
  return (c.details as { overnight?: unknown } | null | undefined)?.overnight === true && !!c.start_time && !!c.end_time;
}

/** Minutes ashore, a night in port included; null when there is no all-aboard time. */
export function minutesAshore(c: PortLike): number | null {
  if (!c.start_time || !c.end_time) return null;
  const m = toMin(c.end_time) - toMin(c.start_time) + (isOvernight(c) ? 24 * 60 : 0);
  return m > 0 ? m : null;
}

/** "11 h ashore", "9 h 30 ashore", "34 h ashore", or null. */
export function ashoreLabel(c: PortLike): string | null {
  const m = minutesAshore(c);
  return m == null ? null : `${stripDuration(m)} ashore`;
}
