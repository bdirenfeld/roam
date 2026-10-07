/**
 * What the toast says when a card comes off its day (6 Oct 2026, taps audit).
 * The place stays saved, so "Card deleted" (day view) and "Removed from the
 * map" (Map tab) both said something that had not happened.
 *
 * One way to name a day (7 Oct 2026, re-audit): "Tue 25", with the month only
 * when the journey spans months (lib/dayChip). The day view said "Taken off
 * Tue" and the Map "Taken off Day 3" for the same act.
 */

import { dayChip } from "@/lib/dayChip";

function named(date: string | null | undefined, withMonth: boolean): string | null {
  if (!date || Number.isNaN(new Date(date + "T00:00:00").getTime())) return null;
  return dayChip(date, withMonth);
}

/** Day view: "Taken off Tue 25 · still on your map". */
export function takenOffDayToast(date: string, withMonth = false): string {
  const day = named(date, withMonth);
  return `Taken off ${day ?? "this day"} · still on your map`;
}

/** Map: "Taken off Tue 25" — the same day name as the day view. */
export function takenOffMapToast(date: string | null | undefined, withMonth = false): string {
  const day = named(date, withMonth);
  return day ? `Taken off ${day}` : "Taken off the day";
}
