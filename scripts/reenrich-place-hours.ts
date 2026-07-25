#!/usr/bin/env node
/**
 * Roam — Re-enrich opening hours for summary-shape `places` rows
 *
 * One-off backfill. NOT imported by app code. Adds no route, no UI.
 *
 * Usage:
 *   # Dry run (default — never writes):
 *   GOOGLE_PLACES_API_KEY=<key> \
 *   SUPABASE_URL=https://ejluvgjiqcwvqhzqpkrz.supabase.co \
 *   SUPABASE_ACCESS_TOKEN=<supabase access/PAT with database query rights> \
 *   npx ts-node scripts/reenrich-place-hours.ts
 *
 *   # Live run (writes) — requires the explicit flag:
 *   ... npx ts-node scripts/reenrich-place-hours.ts --live
 *
 * What it does:
 *   1. Re-runs the exact A1 target predicate at runtime (summary-shape rows
 *      with no hours), minus logistics — 102 rows at time of writing. It does
 *      NOT take a hardcoded id list.
 *   2. Fetches Google Place Details (legacy) per row, opening_hours in the mask.
 *   3. Writes `hours` = the whole `opening_hours` object (periods + weekday_text
 *      + open_now) — the exact shape the conflict helper reads.
 *   4. Merges the enrichment into `details` SERVER-SIDE via `details || payload`,
 *      with editorial keys stripped from the incoming payload so the merge is
 *      purely additive. Never a full-column replacement.
 *
 * Safety:
 *   - Dry-run by default; a bare invocation never writes.
 *   - Sequential (plain for-await loop) — no parallelism, Google rate-limits.
 *   - The `details` write is `details = details || $payload::jsonb` in raw SQL,
 *     executed through the Supabase Management API (same mechanism as
 *     scripts/migrate.ts). The merge happens in Postgres; the client never
 *     reads-modifies-writes the JSONB column.
 *   - STRIP_KEYS are removed from the incoming payload before the merge, so
 *     hand-written editorial values (notes, hand-picked website, etc.) survive.
 *   - Rows whose resolved hours look malformed for the shipped helper
 *     (single-entry periods, or a period with no close — e.g. 24h venues) are
 *     HELD OUT and never written; they are reported for a helper fix.
 *   - Live run aborts if failures exceed 10% of attempted rows.
 */

// Editorial keys the incoming Google payload must never overwrite. `rating`,
// `website`, `price_level` collide with Google's response; `notes`/`note` never
// come back from Google but are stripped defensively.
const STRIP_KEYS = ["rating", "website", "price_level", "notes", "note"];

// Exact A1 target predicate, minus logistics, re-run at runtime.
const TARGET_SQL = `
  SELECT id, title, google_place_id, details
  FROM places
  WHERE hours IS NULL
    AND details ? 'place_id'
    AND NOT (details ? 'formatted_address')
    AND NOT (details ? 'geometry')
    AND type <> 'logistics'
  ORDER BY title
`;

const GOOGLE_KEY   = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

const LIVE = process.argv.includes("--live");

const FIELDS = [
  "name", "formatted_address", "formatted_phone_number", "website", "rating",
  "photos", "geometry", "opening_hours", "price_level", "types",
].join(",");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TargetRow = { id: string; title: string; google_place_id: string | null; details: unknown };
type GoogleResult = Record<string, unknown> & { opening_hours?: OpeningHours };
type OpeningHours = { periods?: Period[]; weekday_text?: unknown; open_now?: unknown };
type Period = { open?: { day?: number; time?: string }; close?: unknown };

function requireEnv(): void {
  const missing: string[] = [];
  if (!GOOGLE_KEY)   missing.push("GOOGLE_PLACES_API_KEY");
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!ACCESS_TOKEN) missing.push("SUPABASE_ACCESS_TOKEN");
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(", ")}`);
    process.exit(1);
  }
}

// ── Raw SQL via the Supabase Management API (scripts/migrate.ts pattern) ──────
async function runSQL<T = unknown>(sql: string): Promise<T[]> {
  const ref = SUPABASE_URL!.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) throw new Error("Could not extract project ref from SUPABASE_URL");

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`SQL failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as T[];
}

// Dollar-quoting makes arbitrary JSON injection-safe: everything between the
// tags is a literal, and the tag cannot appear in Google's JSON.
function jsonbLiteral(value: unknown): string {
  return `$roam_reenrich$${JSON.stringify(value)}$roam_reenrich$::jsonb`;
}

// ── Google Place Details (legacy) — opening_hours explicit in the mask ───────
async function fetchDetails(
  gpid: string,
): Promise<{ ok: true; result: GoogleResult } | { ok: false; reason: string }> {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", gpid);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("key", GOOGLE_KEY!);

  let res: Response;
  try {
    res = await fetch(url.toString());
  } catch (err) {
    return { ok: false, reason: `network:${(err as Error).message}` };
  }
  if (res.status === 429) return { ok: false, reason: "rate_limit" };
  if (!res.ok)            return { ok: false, reason: `http_${res.status}` };

  const data = (await res.json()) as { status?: string; result?: GoogleResult; error_message?: string };
  if (data.status === "OK" && data.result)                          return { ok: true, result: data.result };
  if (data.status === "NOT_FOUND" || data.status === "ZERO_RESULTS") return { ok: false, reason: "not_found" };
  if (data.status === "OVER_QUERY_LIMIT")                            return { ok: false, reason: "rate_limit" };
  return { ok: false, reason: `google:${data.error_message ?? data.status ?? "unknown"}` };
}

/** Malformed for the shipped helper: single period, or any period missing a close. */
function isHoursSuspect(hours: OpeningHours): boolean {
  const periods = hours.periods;
  if (!Array.isArray(periods) || periods.length === 0) return false; // handled as "no hours"
  if (periods.length === 1) return true;
  return periods.some((p) => !p || p.close == null);
}

function log(entry: Record<string, unknown>): void {
  console.log("[reenrich]", { dryRun: !LIVE, ...entry });
}

async function main(): Promise<void> {
  requireEnv();
  console.log(`\n[reenrich] mode: ${LIVE ? "LIVE (writes enabled)" : "DRY RUN (no writes)"}`);

  const targets = await runSQL<TargetRow>(TARGET_SQL);
  console.log(`[reenrich] target rows: ${targets.length}\n`);

  const counts = { updated: 0, skipped: 0, failed: 0, no_hours: 0, held: 0 };
  const samples: { title: string; hours: OpeningHours }[] = [];
  const held: { id: string; title: string; hours: OpeningHours }[] = [];
  let attempted = 0;

  for (const row of targets) {
    const { id, title, google_place_id: gpid } = row;

    if (!gpid) {
      counts.skipped++;
      log({ place_id: id, google_place_id: null, outcome: "skipped", reason: "no_google_place_id" });
      continue;
    }

    attempted++;
    const fetched = await fetchDetails(gpid);
    if (!fetched.ok) {
      counts.failed++;
      log({ place_id: id, google_place_id: gpid, outcome: "failed", reason: fetched.reason });
      // Abort if the failure rate runs away (Amendment 3 / B3).
      if (LIVE && counts.failed / attempted > 0.10 && attempted >= 10) {
        console.error(
          `\n[reenrich] ABORT — ${counts.failed}/${attempted} failed (>10%). Stopping mid-run.`,
        );
        break;
      }
      continue;
    }

    const hours = fetched.result.opening_hours;
    if (!hours || !Array.isArray(hours.periods) || hours.periods.length === 0) {
      // Correctly-summary AND legitimately hours-free — leave it alone.
      counts.no_hours++;
      log({ place_id: id, google_place_id: gpid, outcome: "skipped", reason: "google_no_hours" });
      continue;
    }

    if (isHoursSuspect(hours)) {
      counts.held++;
      held.push({ id, title, hours });
      log({ place_id: id, google_place_id: gpid, outcome: "skipped", reason: "hours_needs_review" });
      continue;
    }

    if (samples.length < 3) samples.push({ title, hours });

    // Enrichment payload: full Google result minus editorial keys → additive merge.
    const payload: Record<string, unknown> = { ...fetched.result };
    for (const k of STRIP_KEYS) delete payload[k];

    if (!LIVE) {
      counts.updated++;
      log({ place_id: id, google_place_id: gpid, outcome: "updated" });
      continue;
    }

    if (!UUID_RE.test(id)) {
      counts.failed++;
      log({ place_id: id, google_place_id: gpid, outcome: "failed", reason: "bad_uuid" });
      continue;
    }

    try {
      await runSQL(
        `UPDATE places
         SET details = details || ${jsonbLiteral(payload)},
             hours   = ${jsonbLiteral(hours)}
         WHERE id = '${id}'::uuid AND hours IS NULL`,
      );
      counts.updated++;
      log({ place_id: id, google_place_id: gpid, outcome: "updated" });
    } catch (err) {
      counts.failed++;
      log({ place_id: id, google_place_id: gpid, outcome: "failed", reason: `write:${(err as Error).message}` });
      if (counts.failed / attempted > 0.10 && attempted >= 10) {
        console.error(
          `\n[reenrich] ABORT — ${counts.failed}/${attempted} failed (>10%). Stopping mid-run.`,
        );
        break;
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n[reenrich] summary:", {
    targets: targets.length,
    attempted,
    updated:  counts.updated,
    no_hours: counts.no_hours,
    held:     counts.held,
    failed:   counts.failed,
    skipped_no_gpid: counts.skipped,
  });

  if (samples.length) {
    console.log("\n[reenrich] sample resolved hours payloads (first 3 writable rows):");
    for (const s of samples) console.log(`  — ${s.title}:`, JSON.stringify(s.hours));
  }

  if (held.length) {
    console.log(`\n[reenrich] HELD OUT — ${held.length} row(s) need a helper fix before writing:`);
    for (const h of held) console.log(`  — ${h.title} (${h.id}):`, JSON.stringify(h.hours));
  }
}

main().catch((err) => {
  console.error("\n[reenrich] fatal:", err);
  process.exit(1);
});
