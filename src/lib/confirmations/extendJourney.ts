import { planDayChanges } from "@/lib/tripDays";

/**
 * Widen a journey's dates from the booking check sheet (3 Oct 2026): "Extend
 * the trip to Mon 23 Aug". The same write Settings does when its dates change
 * (lib/tripDays planDayChanges over the days read fresh, the trip row, then
 * the day rows), limited to growing: it never removes a day, so it refuses any
 * range that would.
 */

export interface ExtendedDay { id: string; date: string; day_number: number; day_name: string | null }

// The narrow slice of the Supabase client this uses, so a test can fake it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any };

export async function extendJourney(db: Db, tripId: string, start: string, end: string): Promise<{ days: ExtendedDay[] } | { error: string }> {
  const fail = { error: "Couldn't change the trip's dates. Try again." };
  try {
    const { data: fresh, error: readErr } = await db.from("days").select("id, date, day_number").eq("trip_id", tripId);
    if (readErr || !fresh) return fail;
    const current = fresh as { id: string; date: string; day_number: number }[];
    const plan = planDayChanges(current, start, end);
    if (plan.remove.length) return fail;

    const { error: tripErr } = await db.from("trips").update({ start_date: start, end_date: end }).eq("id", tripId);
    if (tripErr) return fail;
    for (const u of plan.update) {
      const was = current.find((x) => x.id === u.id);
      if (was && was.date === u.date && was.day_number === u.day_number) continue;
      const { error } = await db.from("days").update({ date: u.date, day_number: u.day_number }).eq("id", u.id);
      if (error) return fail;
    }
    if (plan.insert.length) {
      const { error } = await db.from("days").insert(plan.insert.map((n) => ({
        id: crypto.randomUUID(), trip_id: tripId, date: n.date, day_number: n.day_number, day_name: null, // no placeholder "Day N" name: it showed as a label (7 Oct 2026)
      })));
      if (error) return fail;
    }
    const { data: after, error: againErr } = await db.from("days").select("id, date, day_number, day_name").eq("trip_id", tripId).order("day_number");
    if (againErr || !after) return fail;
    return { days: after as ExtendedDay[] };
  } catch {
    return fail;
  }
}
