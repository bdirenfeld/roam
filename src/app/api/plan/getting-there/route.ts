import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { km } from "@/lib/plan/dayGroups";
import { NEAR_KM } from "@/lib/plan/pace";
import { hasChildren } from "@/lib/plan/draftRows";
import { dayTrips, routeFrom, travelCard, leaveBy, bestWay, hasCar, directionsUrl, type Route, type TripCard } from "@/lib/plan/gettingThere";

// ── Getting there: a travel card before each day trip (30 Sep 2026) ────────
//
// After Plan my trip writes its cards, the sheet sends their ids here. For
// each day trip (lib/plan/gettingThere dayTrips) Google Directions gives the
// drive and the public transport route from that night's stay; the better
// one becomes a note card before the place, with the steps, the other way,
// the time back and a Directions link. When leaving in time would mean going
// before 8 am, that day's planned cards move later instead. Routes are kept
// in find_cache for a month ("route|" keys).

// Web searches and Claude writing: 60 s cut Tuscany's event search off (30 Sep 2026).
export const maxDuration = 180;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
const pt = (p: { lat: number | null; lng: number | null }) => ({ lat: p.lat!, lng: p.lng! });
const MONTH = 30 * 86_400_000;

type Row = TripCard & { details: Record<string, unknown> | null; end_time: string | null };

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null) as { tripId?: string; cardIds?: string[] } | null;
  const tripId = body?.tripId;
  const planned = new Set((body?.cardIds ?? []).filter((x) => typeof x === "string").slice(0, 200));
  if (!tripId || planned.size === 0) return NextResponse.json({ error: "tripId and cardIds are required" }, { status: 400 });
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ created: [] });

  // RLS: only the journey's own rows come back.
  const [{ data: trip }, { data: days }, { data: rows }, { data: people }] = await Promise.all([
    gate.supabase.from("trips").select("id, start_date, party_size, party_ages").eq("id", tripId).maybeSingle(),
    gate.supabase.from("days").select("id, date, day_number").eq("trip_id", tripId).order("day_number"),
    gate.supabase.from("cards").select("id, day_id, start_time, end_time, position, details, place:places(title, type, sub_type, lat, lng, details)").eq("trip_id", tripId).in("status", ["in_itinerary", "interested"]),
    gate.supabase.from("people").select("birthdate").eq("trip_id", tripId),
  ]);
  if (!trip || !days) return NextResponse.json({ error: "Journey not found" }, { status: 404 });
  const all = (rows ?? []) as unknown as (Row & { status?: string })[];
  // A saved rental anywhere on the journey means a car (lib/plan/gettingThere hasCar).
  const car = hasCar(all);
  const cards = all.filter((c) => c.day_id);
  const dayIds = days.map((d) => d.id as string);
  const trips = dayTrips(dayIds, cards, planned, NEAR_KM, km);
  if (!trips.length) return NextResponse.json({ created: [] });
  if (!(await underQuota(gate.supabase, "gettingThere", QUOTA.gettingThere))) return quotaExceeded("getting there");
  const kids = hasChildren(trip.party_ages as number[] | null, (people ?? []).map((p) => p.birthdate as string | null), trip.party_size ?? 2, trip.start_date as string);

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try { admin = createAdminClient(); } catch { admin = null; }

  // One route, cached. Transit asks for the same weekday and hour this coming
  // week: Google has timetables for now, not for a trip two years out.
  const route = async (mode: "driving" | "transit", from: { lat: number; lng: number }, to: { lat: number; lng: number }, date: string, hour: number): Promise<Route | null> => {
    const wd = new Date(date + "T00:00:00Z").getUTCDay();
    const k = `route|${mode}|${from.lat.toFixed(3)},${from.lng.toFixed(3)}|${to.lat.toFixed(3)},${to.lng.toFixed(3)}|${mode === "transit" ? `${wd}-${hour}` : ""}`;
    if (admin) {
      const { data } = await admin.from("find_cache").select("results, created_at").eq("key", k).maybeSingle();
      if (data && Date.now() - Date.parse(data.created_at as string) < MONTH) return (data.results as { route: Route | null }).route;
    }
    const u = new URL("https://maps.googleapis.com/maps/api/directions/json");
    u.searchParams.set("origin", `${from.lat},${from.lng}`);
    u.searchParams.set("destination", `${to.lat},${to.lng}`);
    u.searchParams.set("mode", mode);
    if (mode === "transit") {
      const now = new Date();
      // The place's own clock, near enough: an hour per 15° of longitude.
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ((wd - now.getUTCDay() + 7) % 7 || 7), hour - Math.round(to.lng / 15)));
      u.searchParams.set("departure_time", String(Math.floor(d.getTime() / 1000)));
    }
    u.searchParams.set("key", key);
    try {
      const res = await fetch(u, { cache: "no-store" });
      const r = routeFrom(await res.json());
      if (admin) await admin.from("find_cache").upsert({ key: k, results: { route: r }, created_at: new Date().toISOString() });
      return r;
    } catch (e) {
      console.error("[plan/getting-there]", e);
      return null;
    }
  };

  const created: string[] = [];
  const moved: { id: string; start_time: string; end_time: string | null }[] = [];
  for (const t of trips) {
    const date = days.find((d) => d.id === t.dayId)!.date as string;
    const start = toMin(t.target.start_time!);
    const from = pt(t.home.place!), to = pt(t.target.place!);
    const [drive, transit] = await Promise.all([
      route("driving", from, to, date, Math.max(8, Math.floor(start / 60) - 1)),
      route("transit", from, to, date, Math.max(8, Math.floor(start / 60) - 1)),
    ]);
    const best = bestWay(drive, transit, kids, car);
    if (!best) continue;
    const minutes = (best === "drive" ? drive : transit)!.minutes;
    const { leave, shift } = leaveBy(start, minutes);
    const card = travelCard({ to: t.target.place!.title, home: t.home.place!.title, drive, transit, kids, car, leave });
    if (!card) continue;

    // Leaving before 8 am: the day's planned cards from the day trip on move later.
    if (shift > 0) {
      for (const c of cards.filter((x) => x.day_id === t.dayId && planned.has(x.id) && x.start_time && toMin(x.start_time) >= start)) {
        const s = toTime(toMin(c.start_time!) + shift), e = c.end_time ? toTime(toMin(c.end_time) + shift) : null;
        const plan = (c.details as { plan?: Record<string, unknown> } | null)?.plan;
        const details = plan ? { ...(c.details ?? {}), plan: { ...plan, start: s } } : c.details;
        const { error } = await gate.supabase.from("cards").update({ start_time: s, end_time: e, details }).eq("id", c.id);
        if (!error) moved.push({ id: c.id, start_time: s, end_time: e });
      }
    }
    const id = crypto.randomUUID();
    const position = Math.max(0, ...cards.filter((c) => c.day_id === t.dayId).map((c) => c.position ?? 0)) + 1;
    const leaveAt = toTime(leave);
    const { error } = await gate.supabase.from("cards").insert({
      id, trip_id: tripId, day_id: t.dayId, place_id: null, status: "in_itinerary", position,
      start_time: leaveAt, end_time: toTime(leave + minutes), source_url: directionsUrl(from, to, card.mode),
      details: { title: card.title, notes: card.notes, getting_there: { to: t.target.id, mode: card.mode }, plan: { day: t.dayId, start: leaveAt } },
      ai_generated: true, confirmed: false,
    });
    if (error) console.error("[plan/getting-there] insert", error.message);
    else created.push(id);
  }
  return NextResponse.json({ created, moved });
}
