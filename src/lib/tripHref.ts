/**
 * Where a link to a journey should point, so it lands there in one step
 * (29 Sep 2026). On a computer an owner plans on the week; links used to go
 * to the journey's front door (or its day), which then sent the owner on to
 * the week, and for a moment the day-shaped loading screen showed ("it takes
 * me to the old day view for a second, and then to the week view"). A phone,
 * and a guest, open on the day.
 */
export function tripHref(tripId: string, o: { phone: boolean; owner: boolean; openDayId?: string | null }): string {
  if (!o.phone && o.owner) return `/trips/${tripId}/plan`;
  return o.openDayId ? `/trips/${tripId}/days/${o.openDayId}` : `/trips/${tripId}`;
}
