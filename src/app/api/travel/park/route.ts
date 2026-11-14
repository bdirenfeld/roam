import { NextRequest, NextResponse } from "next/server";
import { requireUser, underQuota, quotaExceeded, QUOTA } from "@/lib/api/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { routeFrom } from "@/lib/plan/gettingThere";
import { parkSpots, type Park } from "@/lib/travel/park";

// ── Drive, park, walk (14 Nov 2026) ───────────────────────────────────────
// Car parks near where you're going (Google Nearby Search, type parking,
// within 1.2 km, the most-reviewed first), each with the drive to it from the start and the walk from
// it to the place (Google Directions). Everything is cached in find_cache for a
// month, so a second trip to the same town costs nothing.

const MONTH = 30 * 86_400_000;
type Pt = { lat: number; lng: number };
const okPt = (p: unknown): p is Pt => {
  const q = p as Pt | null;
  return !!q && Number.isFinite(q.lat) && Number.isFinite(q.lng) && Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180;
};

export async function POST(req: NextRequest) {
  const gate = await requireUser();
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null) as { from?: unknown; to?: unknown } | null;
  if (!okPt(body?.from) || !okPt(body?.to)) return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  const from = body!.from as Pt, to = body!.to as Pt;
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ parks: [] });
  if (!(await underQuota(gate.supabase, "parkNearby", QUOTA.parkNearby))) return quotaExceeded("car park searches");

  let admin: ReturnType<typeof createAdminClient> | null = null;
  try { admin = createAdminClient(); } catch { admin = null; }

  const cached = async <T,>(k: string, get: () => Promise<T>): Promise<T> => {
    if (admin) {
      const { data } = await admin.from("find_cache").select("results, created_at").eq("key", k).maybeSingle();
      if (data && Date.now() - Date.parse(data.created_at as string) < MONTH) return (data.results as { v: T }).v;
    }
    const v = await get();
    if (admin) await admin.from("find_cache").upsert({ key: k, results: { v }, created_at: new Date().toISOString() });
    return v;
  };

  const minutes = (a: Pt, b: Pt, mode: "driving" | "walking") =>
    cached(`route|${mode}|${a.lat.toFixed(3)},${a.lng.toFixed(3)}|${b.lat.toFixed(3)},${b.lng.toFixed(3)}|`, async () => {
      const u = new URL("https://maps.googleapis.com/maps/api/directions/json");
      u.searchParams.set("origin", `${a.lat},${a.lng}`);
      u.searchParams.set("destination", `${b.lat},${b.lng}`);
      u.searchParams.set("mode", mode);
      u.searchParams.set("key", key);
      try {
        const res = await fetch(u, { cache: "no-store" });
        return routeFrom(await res.json())?.minutes ?? null;
      } catch (e) {
        console.error("[travel/park] directions", e);
        return null;
      }
    });

  try {
    // "parking2" (14 Nov 2026): ranked by reviews within 1.2 km. The first
    // version kept the nearest twenty, which in a walled town are the wrong ones.
    const spots = await cached(`parking2|${to.lat.toFixed(4)},${to.lng.toFixed(4)}`, async () => {
      const u = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
      u.searchParams.set("location", `${to.lat},${to.lng}`);
      u.searchParams.set("radius", "1200");
      u.searchParams.set("type", "parking");
      u.searchParams.set("key", key);
      const res = await fetch(u, { cache: "no-store" });
      return parkSpots(await res.json(), to);
    });

    const parks: Park[] = [];
    for (const s of spots) {
      const [drive, walk] = await Promise.all([minutes(from, s, "driving"), minutes(s, to, "walking")]);
      if (drive == null || walk == null) continue;
      parks.push({ ...s, drive: Math.max(1, drive), walk: Math.max(1, walk) });
    }
    return NextResponse.json({ parks });
  } catch (e) {
    console.error("[travel/park]", e);
    return NextResponse.json({ parks: [] });
  }
}
