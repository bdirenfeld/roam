/**
 * A new journey's two ways to start (1 Oct 2026, the how-to storyboards:
 * uploading a booking was three steps deep and a new journey had no "start
 * here"). Mock: start-here.png, approved with two changes — each button goes
 * on its own (a booking uploaded must not take "Find places" with it), and the
 * upload names cars too.
 *
 * Upload a booking: until a hotel, flight or rental car is on a day, and on
 * the phone's day only on the journey's first day (Brennan, 2 Oct 2026: "it
 * makes sense to have it on the first day if you haven't uploaded anything,
 * but I don't want it on the other ones"). The week shows one over the whole
 * week, so it passes nothing.
 * Find places: until something to do or eat is on the journey, saved or planned.
 */

export interface StartCard {
  day_id: string | null;
  status?: string | null;
  details?: Record<string, unknown> | null;
  place?: { type?: string | null; sub_type?: string | null } | null;
}

const BOOKED = new Set(["hotel", "flight_arrival", "flight_departure"]);
const str = (v: unknown) => (typeof v === "string" ? v : "");

function isBooking(c: StartCard): boolean {
  if (!c.day_id || c.status === "cut" || c.status === "interested") return false;
  if (BOOKED.has(c.place?.sub_type ?? "")) return true;
  // A rental car's pick-up card (lib/confirmations/toCards) carries its drop-off day.
  return !!str(c.details?.drop_off) || /^(pick up|return) (the )?rental car/i.test(str(c.details?.title));
}

function isPlace(c: StartCard): boolean {
  return c.status !== "cut" && (c.place?.type === "activity" || c.place?.type === "food");
}

export function startSteps(cards: StartCard[], opts: { firstDay?: boolean } = {}): { upload: boolean; find: boolean } {
  const firstDay = opts.firstDay ?? true;
  return { upload: firstDay && !cards.some(isBooking), find: !cards.some(isPlace) };
}
