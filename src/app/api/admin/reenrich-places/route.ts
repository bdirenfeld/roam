// ⚠️ ONE-OFF DATA-CLEANUP ROUTE — owner-only, remove after the backfill runs.
//
// Heals `places` rows that were created bare (website NULL) before the
// save-from-search path persisted world facts onto the place (commit 85e2184).
// For each target it re-fetches Google Place Details with the SAME helper +
// field mask the save/bulk-import path uses, then writes website/phone/hours/
// details onto the row (and refreshes rating/price_level when Google returns
// them). Idempotent: only ever targets `website IS NULL`, so re-running skips
// already-healed rows.
//
// Auth: the caller is verified as the owner via the RLS-bound server client;
// only then is the service-role admin client used for the cross-user writes.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPlaceDetails } from "@/lib/places/fetchDetails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Owner-only. Matches the Plan-guard / settings owner everywhere else.
const OWNER_ID = "ece938aa-db7b-4436-bb59-442cc0dc5e10";

const DELAY_MS = 150;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ErrorEntry {
  placeId: string;
  reason: string;
}

export async function GET(req: NextRequest) {
  // ── Auth gate: RLS-bound server client; must be the owner ──────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== OWNER_ID) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("[reenrich-places] GOOGLE_PLACES_API_KEY is not configured");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

  // ── Service-role admin client: heals bare places across ALL users ──
  const admin = createAdminClient();

  const { data: targets, error: selErr } = await admin
    .from("places")
    .select("id, google_place_id, title, user_id")
    .is("website", null)
    .not("google_place_id", "is", null);

  if (selErr) {
    console.error("[reenrich-places] select failed:", selErr);
    return NextResponse.json({ error: "select_failed", detail: selErr.message }, { status: 500 });
  }

  const places = (targets ?? []) as {
    id: string;
    google_place_id: string;
    title: string | null;
    user_id: string;
  }[];

  // ── Dry-run: report what WOULD be enriched; no writes ──────────────
  if (dryRun) {
    const byUser: Record<string, number> = {};
    for (const p of places) {
      byUser[p.user_id] = (byUser[p.user_id] ?? 0) + 1;
    }
    const sample = places.slice(0, 5).map((p) => ({
      title:           p.title,
      google_place_id: p.google_place_id,
    }));
    return NextResponse.json({
      dryRun:      true,
      wouldEnrich: places.length,
      byUser,
      sample,
    });
  }

  // ── Real run: sequential, throttled, idempotent ────────────────────
  let attempted = 0;
  let enriched = 0;
  let skipped = 0;
  const errors: ErrorEntry[] = [];

  for (const p of places) {
    attempted++;

    const detailsRes = await fetchPlaceDetails(p.google_place_id, apiKey);
    if (!detailsRes.ok) {
      skipped++;
      errors.push({ placeId: p.id, reason: detailsRes.reason });
      await sleep(DELAY_MS);
      continue;
    }

    const result = detailsRes.result as {
      formatted_phone_number?: string;
      website?: string;
      rating?: number;
      opening_hours?: unknown;
      price_level?: number;
    };

    // Mirror the save path's persisted shape: website/phone/hours/details are
    // always written from the raw result (targets are bare, so this can't blank
    // real data). rating/price_level are only refreshed when Google returns
    // them — never blank a value the bare insert may already hold.
    const update: Record<string, unknown> = {
      website: result.website ?? null,
      phone:   result.formatted_phone_number ?? null,
      hours:   result.opening_hours ?? null,
      details: result,
    };
    if (result.rating != null)      update.rating = result.rating;
    if (result.price_level != null) update.price_level = result.price_level;

    const { error: updErr } = await admin
      .from("places")
      .update(update)
      .eq("id", p.id);

    if (updErr) {
      skipped++;
      errors.push({ placeId: p.id, reason: updErr.message });
    } else {
      enriched++;
    }

    await sleep(DELAY_MS);
  }

  return NextResponse.json({ attempted, enriched, skipped, errors });
}
