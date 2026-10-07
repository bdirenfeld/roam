/**
 * What the toast says when a card comes off its day (6 Oct 2026, taps audit).
 * The place stays saved, so "Card deleted" (day view) and "Removed from the
 * map" (Map tab) both said something that had not happened.
 */

/** Day view: "Taken off Tue · still on your map". */
export function takenOffDayToast(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "Taken off this day · still on your map";
  return `Taken off ${d.toLocaleDateString("en-GB", { weekday: "short" })} · still on your map`;
}

/** Map: "Taken off Day 3" (the pin's card says "This place is on Day 3"). */
export function takenOffMapToast(dayNumber: number | null | undefined): string {
  return typeof dayNumber === "number" ? `Taken off Day ${dayNumber}` : "Taken off the day";
}
