import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { routeFrom, trafficMinutes, type Route } from "@/lib/plan/gettingThere";
import { estimateKey, viaOf } from "@/lib/travel/estimate";
import { driveWay, transitWay, mixWay, offerWays, type Way, type WayStop } from "@/lib/travel/ways";
import { kmBetween } from "@/lib/travel/leg";

// ── A leg's drive and transit times (12 Nov 2026) ─────────────────────────
// The drive card asks once it has a From and a To and no saved answer for that
// pair (lib/travel/estimate). Google Directions, both modes, cached in
// find_cache for a month under the same "route|" keys the getting-there cards
// use, so a route either feature has asked for is free to the other.

const MONTH = 30 * 86_400_000;
/** Closer than this, nobody drives to a station first. */
const MIX_MIN_KM = 15;
type Pt = { lat: number; lng: number };
const okPt = (p: unknown): p is Pt => {
  const q = p as Pt | null;
  return !!q && Number.isFinite(q.lat) && Number.isFinite(q.lng) && Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180;
};

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null) as { from?: unknown; to?: unknown; date?: string; hour?: number; traffic?: boolean; fromTitle?: unknown; toTitle?: unknown } | null;
  if (!okPt(body?.from) || !okPt(body?.to)) return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  const from = body!.from as Pt, to = body!.to as Pt;
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ key: estimateKey(from, to), drive: null, transit: null, rides: null, via: null });
  if (!(await underQuota(gate.supabase, "legEstimate", QUOTA.legEstimate))) return quotaExceeded("travel times");

  const date = typeof body?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const hour = typeof body?.hour === "number" && body.hour >= 0 && body.hour < 24 ? Math.floor(body.hour) : 9;
  const wd = (date ? new Date(date + "T00:00:00Z") : new Date()).getUTCDay();

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try { admin = createAdminClient(); } catch { admin = null; }

  // v2: transit answers now carry each ride's timetabled time (lib/travel/ways).
  const route = async (mode: "driving" | "transit", a: Pt = from, b: Pt = to): Promise<Route | null> => {
    const k = `route|${mode}|${a.lat.toFixed(3)},${a.lng.toFixed(3)}|${b.lat.toFixed(3)},${b.lng.toFixed(3)}|${mode === "transit" ? `${wd}-${hour}|v2` : ""}`;
    if (admin) {
      const { data } = await admin.from("find_cache").select("results, created_at").eq("key", k).maybeSingle();
      if (data && Date.now() - Date.parse(data.created_at as string) < MONTH) return (data.results as { route: Route | null }).route;
    }
    const u = new URL("https://maps.googleapis.com/maps/api/directions/json");
    u.searchParams.set("origin", `${a.lat},${a.lng}`);
    u.searchParams.set("destination", `${b.lat},${b.lng}`);
    u.searchParams.set("mode", mode);
    if (mode === "transit") {
      // Google has timetables for this week, not a trip a year out: ask for
      // the same weekday and hour coming up, on the place's own clock.
      const now = new Date();
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ((wd - now.getUTCDay() + 7) % 7 || 7), hour - Math.round(b.lng / 15)));
      u.searchParams.set("departure_time", String(Math.floor(d.getTime() / 1000)));
    }
    u.searchParams.set("key", key);
    try {
      const res = await fetch(u, { cache: "no-store" });
      const r = routeFrom(await res.json());
      if (admin) await admin.from("find_cache").upsert({ key: k, results: { route: r }, created_at: new Date().toISOString() });
      return r;
    } catch (e) {
      console.error("[travel/estimate]", e);
      return null;
    }
  };

  // The drive to the airport asks for traffic (19 Nov 2026): the same weekday and hour coming
  // up, on the start's own clock, Google's best guess; cached under its own key.
  if (body?.traffic === true) {
    const k = `route|traffic|${from.lat.toFixed(3)},${from.lng.toFixed(3)}|${to.lat.toFixed(3)},${to.lng.toFixed(3)}|${wd}-${hour}`;
    if (admin) {
      const { data } = await admin.from("find_cache").select("results, created_at").eq("key", k).maybeSingle();
      if (data && Date.now() - Date.parse(data.created_at as string) < MONTH) {
        return NextResponse.json({ key: estimateKey(from, to), drive: (data.results as { drive: number | null }).drive, transit: null, rides: null, via: null, traffic: true });
      }
    }
    const now = new Date();
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + ((wd - now.getUTCDay() + 7) % 7 || 7), hour - Math.round(from.lng / 15)));
    const u = new URL("https://maps.googleapis.com/maps/api/directions/json");
    u.searchParams.set("origin", `${from.lat},${from.lng}`);
    u.searchParams.set("destination", `${to.lat},${to.lng}`);
    u.searchParams.set("mode", "driving");
    u.searchParams.set("departure_time", String(Math.floor(at.getTime() / 1000)));
    u.searchParams.set("traffic_model", "best_guess");
    u.searchParams.set("key", key);
    let driveMin: number | null = null;
    try {
      const json = await (await fetch(u, { cache: "no-store" })).json();
      driveMin = trafficMinutes(json) ?? routeFrom(json)?.minutes ?? null;
      if (admin && driveMin != null) await admin.from("find_cache").upsert({ key: k, results: { drive: driveMin }, created_at: new Date().toISOString() });
    } catch (e) {
      console.error("[travel/estimate traffic]", e);
    }
    return NextResponse.json({ key: estimateKey(from, to), drive: driveMin, transit: null, rides: null, via: null, traffic: true });
  }

  const [drive, transit] = await Promise.all([route("driving"), route("transit")]);
  // A "transit" answer that is all walking is not public transport.
  const rideSteps = transit ? transit.steps.filter((s) => s.kind === "ride") : [];
  const rides = rideSteps.length;

  // The ways to go, with their legs (28 Nov 2026, lib/travel/ways): the drive, transit, and
  // drive-to-a-station-then-train, which no service plans, so it is built here from two answers.
  const title = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : fb);
  const A: WayStop = { title: title(body?.fromTitle, "Start"), lat: from.lat, lng: from.lng };
  const B: WayStop = { title: title(body?.toTitle, "Arrive"), lat: to.lat, lng: to.lng };
  const dWay = drive ? driveWay(drive, A, B) : null;
  const tWay = transit ? transitWay(transit, A, B) : null;
  let mWay: Way | null = null;
  try { mWay = await bestMix(); } catch (e) { console.error("[travel/estimate mix]", e); }

  async function bestMix(): Promise<Way | null> {
    const far = kmBetween(from, to);
    if (far < MIX_MIN_KM) return null;
    const stations = (await nearStations()).filter((st) => {
      const k = kmBetween(from, st);
      return k > 1.5 && k < far * 0.6;
    }).slice(0, 2);
    let best: Way | null = null;
    for (const st of stations) {
      const [d, t] = await Promise.all([route("driving", from, st), route("transit", st, to)]);
      const w = d && t ? mixWay(d, st, t, A, B) : null;
      if (w && (!best || w.mins < best.mins)) best = w;
    }
    return best;
  }

  async function nearStations(): Promise<(WayStop & Pt)[]> {
    const k = `stations|${from.lat.toFixed(3)},${from.lng.toFixed(3)}`;
    if (admin) {
      const { data } = await admin.from("find_cache").select("results, created_at").eq("key", k).maybeSingle();
      if (data && Date.now() - Date.parse(data.created_at as string) < MONTH) return (data.results as { stations: (WayStop & Pt)[] }).stations ?? [];
    }
    const u = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
    u.searchParams.set("location", `${from.lat},${from.lng}`);
    u.searchParams.set("rankby", "distance");
    u.searchParams.set("type", "train_station");
    u.searchParams.set("key", key!);
    const json = await (await fetch(u, { cache: "no-store" })).json() as { results?: { name?: string; geometry?: { location?: { lat?: number; lng?: number } } }[] };
    const stations = (json.results ?? []).slice(0, 5).flatMap((r) => {
      const lat = r.geometry?.location?.lat, lng = r.geometry?.location?.lng;
      return r.name && typeof lat === "number" && typeof lng === "number" ? [{ title: r.name, lat, lng }] : [];
    });
    if (admin) await admin.from("find_cache").upsert({ key: k, results: { stations }, created_at: new Date().toISOString() });
    return stations;
  }

  return NextResponse.json({
    key: estimateKey(from, to),
    drive: drive?.minutes ?? null,
    transit: transit && rides > 0 ? transit.minutes : null,
    rides: transit && rides > 0 ? rides : null,
    via: transit && rides > 0 ? viaOf(rideSteps.map((s) => s.vehicle)) : null,
    ways: offerWays(dWay, tWay, mWay),
  });
}
