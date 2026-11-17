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

/** Minutes ashore, or null when there is no all-aboard time (or it is not after docking). */
export function minutesAshore(c: PortLike): number | null {
  if (!c.start_time || !c.end_time) return null;
  const m = toMin(c.end_time) - toMin(c.start_time);
  return m > 0 ? m : null;
}

/** "11 h ashore", "9 h 30 ashore", or null. */
export function ashoreLabel(c: PortLike): string | null {
  const m = minutesAshore(c);
  return m == null ? null : `${stripDuration(m)} ashore`;
}
