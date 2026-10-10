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
 *
 * Plan my trip (10 Oct 2026, growth audit): once something is saved and nothing
 * is planned yet — the moment Plan my trip has material. It plans from the
 * journey's SAVED places (lib/plan/draftTrip), so on an empty journey it would
 * only say "Nothing saved to plan yet"; Find places comes first. Shown on every
 * phone day, since it plans the whole journey.
 *
 * And once a stop is planned — something to do or eat on a day, not just
 * saved — the whole card goes, both buttons and its video row (Brennan, 2 Oct
 * 2026: his Japan journey, 46 stops on its days and its ryokans only saved,
 * still showed "Upload a booking" on day 1, wrong for a journey well past its
 * start). Bookings stays in the menu.
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

/** Something to do or eat placed on a day (not only saved there, not cut). */
function isPlannedStop(c: StartCard): boolean {
  return !!c.day_id && c.status === "in_itinerary" && isPlace(c);
}

export function startSteps(cards: StartCard[], opts: { firstDay?: boolean } = {}): { upload: boolean; find: boolean; plan: boolean } {
  const firstDay = opts.firstDay ?? true;
  if (cards.some(isPlannedStop)) return { upload: false, find: false, plan: false };
  const saved = cards.some(isPlace);
  return { upload: firstDay && !cards.some(isBooking), find: !saved, plan: saved };
}
