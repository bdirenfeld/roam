import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { routeFrom, type Route } from "@/lib/plan/gettingThere";
import { estimateKey, viaOf } from "@/lib/travel/estimate";

// ── A leg's drive and transit times (12 Nov 2026) ─────────────────────────
// The drive card asks once it has a From and a To and no saved answer for that
// pair (lib/travel/estimate). Google Directions, both modes, cached in
// find_cache for a month under the same "route|" keys the getting-there cards
// use, so a route either feature has asked for is free to the other.

const MONTH = 30 * 86_400_000;
type Pt = { lat: number; lng: number };
const okPt = (p: unknown): p is Pt => {
  const q = p as Pt | null;
  return !!q && Number.isFinite(q.lat) && Number.isFinite(q.lng) && Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180;
};

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null) as { from?: unknown; to?: unknown; date?: string; hour?: number } | null;
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

  const route = async (mode: "driving" | "transit"): Promise<Route | null> => {
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
      // Google has timetables for this week, not a trip a year out: ask for
      // the same weekday and hour coming up, on the place's own clock.
      const now = new Date();
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
      console.error("[travel/estimate]", e);
      return null;
    }
  };

  const [drive, transit] = await Promise.all([route("driving"), route("transit")]);
  // A "transit" answer that is all walking is not public transport.
  const rideSteps = transit ? transit.steps.filter((s) => s.kind === "ride") : [];
  const rides = rideSteps.length;
  return NextResponse.json({
    key: estimateKey(from, to),
    drive: drive?.minutes ?? null,
    transit: transit && rides > 0 ? transit.minutes : null,
    rides: transit && rides > 0 ? rides : null,
    via: transit && rides > 0 ? viaOf(rideSteps.map((s) => s.vehicle)) : null,
  });
}
