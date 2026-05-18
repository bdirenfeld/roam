import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPlaceDetails } from "@/lib/places/fetchDetails";
import { inferType } from "@/lib/places/inferType";

interface Defaults {
  type: string;
  sub_type: string;
}

interface ImportedEntry {
  place_id: string;
  google_place_id: string;
  title: string;
  created: boolean;
}

interface FailureEntry {
  google_place_id: string;
  reason: string;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 });
  }

  const { google_place_ids, defaults } = body as { google_place_ids?: unknown; defaults?: unknown };

  if (!Array.isArray(google_place_ids)) {
    return NextResponse.json({ error: "google_place_ids must be an array" }, { status: 400 });
  }
  if (google_place_ids.length === 0) {
    return NextResponse.json({ error: "google_place_ids cannot be empty" }, { status: 400 });
  }
  if (google_place_ids.length > 50) {
    return NextResponse.json({ error: "google_place_ids cannot exceed 50 entries" }, { status: 400 });
  }
  if (!google_place_ids.every((id) => typeof id === "string" && id.length > 0)) {
    return NextResponse.json({ error: "each google_place_id must be a non-empty string" }, { status: 400 });
  }

  let parsedDefaults: Defaults | null = null;
  if (defaults !== undefined) {
    if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) {
      return NextResponse.json({ error: "defaults must be an object" }, { status: 400 });
    }
    const d = defaults as Record<string, unknown>;
    if (typeof d.type !== "string" || d.type.length === 0 ||
        typeof d.sub_type !== "string" || d.sub_type.length === 0) {
      return NextResponse.json(
        { error: "defaults must include type and sub_type as non-empty strings" },
        { status: 400 },
      );
    }
    parsedDefaults = { type: d.type, sub_type: d.sub_type };
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error("[bulk-import] GOOGLE_PLACES_API_KEY is not configured");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const imported: ImportedEntry[] = [];
  const failures: FailureEntry[] = [];

  for (const googlePlaceId of google_place_ids as string[]) {
    // ── Reuse check — must never write to DB ──────────────────────
    const { data: existing } = await supabase
      .from("places")
      .select("id, title")
      .eq("user_id", user.id)
      .eq("google_place_id", googlePlaceId)
      .maybeSingle();

    if (existing) {
      imported.push({
        place_id:        existing.id,
        google_place_id: googlePlaceId,
        title:           existing.title,
        created:         false,
      });
      console.log("[bulk-import]", {
        user_id:         user.id,
        google_place_id: googlePlaceId,
        outcome:         "reused",
      });
      continue;
    }

    // ── Google place_details fetch ────────────────────────────────
    const detailsRes = await fetchPlaceDetails(googlePlaceId, apiKey);
    if (!detailsRes.ok) {
      failures.push({ google_place_id: googlePlaceId, reason: detailsRes.reason });
      if (detailsRes.reason === "google_places_error") {
        console.error("[bulk-import] google_places_error", googlePlaceId, detailsRes.detail);
      }
      console.log("[bulk-import]", {
        user_id:         user.id,
        google_place_id: googlePlaceId,
        outcome:         "failed",
        reason:          detailsRes.reason,
      });
      continue;
    }

    const result = detailsRes.result as {
      name?: string;
      formatted_address?: string;
      formatted_phone_number?: string;
      website?: string;
      rating?: number;
      photos?: { photo_reference?: string }[];
      geometry?: { location?: { lat?: number; lng?: number } };
      opening_hours?: unknown;
      price_level?: number;
      types?: string[];
    };

    // ── Resolve type / sub_type: defaults win, else infer ─────────
    let resolvedType:    string | null;
    let resolvedSubType: string | null;
    if (parsedDefaults) {
      resolvedType    = parsedDefaults.type;
      resolvedSubType = parsedDefaults.sub_type;
    } else {
      const inferred  = inferType(result.types);
      resolvedType    = inferred.type;
      resolvedSubType = inferred.sub_type;
    }

    if (!resolvedType || !resolvedSubType) {
      failures.push({ google_place_id: googlePlaceId, reason: "inference_failed" });
      console.log("[bulk-import]", {
        user_id:         user.id,
        google_place_id: googlePlaceId,
        outcome:         "failed",
        reason:          "inference_failed",
      });
      continue;
    }

    const row = {
      user_id:         user.id,
      google_place_id: googlePlaceId,
      title:           result.name ?? "",
      type:            resolvedType,
      sub_type:        resolvedSubType,
      lat:             result.geometry?.location?.lat ?? null,
      lng:             result.geometry?.location?.lng ?? null,
      address:         result.formatted_address ?? null,
      phone:           result.formatted_phone_number ?? null,
      website:         result.website ?? null,
      hours:           result.opening_hours ?? null,
      rating:          result.rating ?? null,
      price_level:     result.price_level ?? null,
      details:         detailsRes.result,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("places")
      .insert(row)
      .select("id, title")
      .single();

    if (insertErr || !inserted) {
      failures.push({ google_place_id: googlePlaceId, reason: "insert_failed" });
      console.error("[bulk-import] insert error", googlePlaceId, insertErr);
      console.log("[bulk-import]", {
        user_id:         user.id,
        google_place_id: googlePlaceId,
        outcome:         "failed",
        reason:          "insert_failed",
      });
      continue;
    }

    imported.push({
      place_id:        inserted.id,
      google_place_id: googlePlaceId,
      title:           inserted.title,
      created:         true,
    });
    console.log("[bulk-import]", {
      user_id:         user.id,
      google_place_id: googlePlaceId,
      outcome:         "created",
    });
  }

  return NextResponse.json({ imported, failures });
}
