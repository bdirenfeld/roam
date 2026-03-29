/**
 * One-time data cleanup endpoint.
 * DELETE after running.
 *
 * GET /api/admin/cleanup
 *
 * Uses the service-role key if available (SUPABASE_SERVICE_KEY), otherwise
 * falls back to the anon key (runs under RLS — must be authenticated).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase env vars not found" }, { status: 500 });
  }

  const supabase = createClient(url, key);

  // 1. Delete test cards
  const { error: deleteError, count: deletedCount } = await supabase
    .from("cards")
    .delete({ count: "exact" })
    .or("title.ilike.TEST %,title.eq.test,title.eq.Test");

  if (deleteError) {
    return NextResponse.json({ error: "Delete failed", detail: deleteError.message }, { status: 500 });
  }

  // 2. Null out lat/lng on generic non-place cards
  const genericTitles = [
    "Afternoon Wandering",
    "Night Walk",
    "Aperitivo",
    "Dinner",
    "Dinner — Arrival Night",
    "Dinner — Historic Center",
    "Run + Morning Coffee",
  ];

  const { error: updateError, count: updatedCount } = await supabase
    .from("cards")
    .update({ lat: null, lng: null }, { count: "exact" })
    .in("title", genericTitles);

  if (updateError) {
    return NextResponse.json({ error: "Update failed", detail: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deletedTestCards: deletedCount,
    nulledCoordinates: updatedCount,
    message: "Done — you can now delete /src/app/api/admin/cleanup/route.ts",
  });
}
