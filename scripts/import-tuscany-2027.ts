#!/usr/bin/env node
/**
 * Roam — itinerary place resolution + enrichment
 *
 * Import helper. NOT imported by app code. Adds no route, no UI. Written for
 * Tuscany 2027 and since generalised: pass any itinerary JSON in the same shape
 * with `--input <file>` (default: tuscany-2027-cards.json). The input's
 * `_meta.region_bias` ({lat, lng, radius_m}) steers Text Search toward the
 * destination; without it the Tuscany bias applies.
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * /api/places/bulk-import is the correct enrichment path, but it authenticates
 * via a cookie-backed Supabase SSR session (`auth.getUser()`), so it cannot be
 * driven headlessly or with a service key. This script reproduces that route's
 * behaviour exactly — same Google Details field list, same inferType rules, same
 * (user_id, google_place_id) reuse check, same imported/failures response shape —
 * against the service-role client instead.
 *
 * It also adds the step the route does not do: resolving a human search string
 * to a google_place_id. bulk-import accepts place IDs only.
 *
 * TWO PASSES, WITH A HUMAN GATE BETWEEN THEM
 * ------------------------------------------
 *   Pass 1 (resolve)  — default, READ-ONLY. Text-searches every `search` string,
 *                       writes scripts/out/tuscany-2027-resolution.json, prints a
 *                       review table. Nothing touches the database.
 *
 *   >>> You review that table and hand-edit the JSON where the top hit is wrong. <<<
 *
 *   Pass 2 (enrich)   — `--live`. Reads the reviewed resolution file, enriches and
 *                       inserts `places` rows, writes scripts/out/tuscany-2027-import.json.
 *
 * USAGE — run from the repo root (paths resolve against cwd)
 * -----
 *   # Pass 1 — resolve only, no writes:
 *   npx ts-node --esm scripts/import-tuscany-2027.ts --input palm-springs-2027-cards.json
 *
 *   # Pass 2 — enrich + insert places (requires the explicit flag):
 *   npx ts-node --esm scripts/import-tuscany-2027.ts --input palm-springs-2027-cards.json --live
 *
 * Output files land in scripts/out/ named after the input file:
 *   <input-basename>-resolution.json  (pass 1)   <input-basename>-import.json  (pass 2)
 *
 * Credentials are read from .env.local in the repo root (never from argv, never
 * printed). Required keys:
 *   GOOGLE_PLACES_API_KEY   — note: not currently in .env.local.example, add it
 *   SUPABASE_SERVICE_KEY    — service role key, bypasses RLS
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *
 * Both passes are idempotent. Pass 1 only reads. Pass 2 reuses any existing
 * (user_id, google_place_id) row instead of inserting a duplicate, exactly as
 * bulk-import does, so re-running is safe.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const OWNER_USER_ID = 'ece938aa-db7b-4436-bb59-442cc0dc5e10'

/**
 * Run this script FROM THE REPO ROOT. cwd is used rather than __dirname because
 * __dirname is not defined under an ESM loader, and these scripts are invoked
 * with `ts-node --esm`.
 */
const REPO_ROOT       = process.cwd()

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const INPUT_JSON      = path.resolve(REPO_ROOT, argValue('--input') ?? 'tuscany-2027-cards.json')
const INPUT_BASE      = path.basename(INPUT_JSON).replace(/-cards\.json$|\.json$/, '')
const OUT_DIR         = path.join(REPO_ROOT, 'scripts', 'out')
const RESOLUTION_JSON = path.join(OUT_DIR, `${INPUT_BASE}-resolution.json`)
const IMPORT_JSON     = path.join(OUT_DIR, `${INPUT_BASE}-import.json`)

/**
 * Bias Text Search toward the destination so bare names don't resolve to
 * another country. Overridden by `_meta.region_bias` in the input JSON;
 * the default is Tuscany, which the original input predates this field.
 */
let REGION_BIAS = { lat: 43.7711, lng: 11.2486, radiusMeters: 100_000 }
/** Trip label for the console banners, from `_meta.trip`. */
let TRIP_LABEL = INPUT_BASE

/** Politeness delay between Google calls, milliseconds. */
const THROTTLE_MS = 150

/**
 * Google `types` that mean "this resolved to a geography, not a venue".
 * The April 2027 Tuscany trip already contains three of these ("Florence",
 * "Metropolitan City of Florence", "Livorno") — that is the exact failure this
 * flag exists to catch before it reaches the database a second time.
 */
const GEOGRAPHY_TYPES = new Set([
  'locality',
  'sublocality',
  'political',
  'country',
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'postal_code',
  'neighborhood',
  'route',
])

// ─────────────────────────────────────────────────────────────────────────────
// inferType — MIRRORS src/lib/places/inferType.ts. Keep in sync.
// Inlined rather than imported: ts-node --esm resolves neither the `@/` alias
// nor extensionless relative TS specifiers.
// ─────────────────────────────────────────────────────────────────────────────

type RoamType = 'food' | 'activity' | 'logistics'
interface InferredType { type: RoamType | null; sub_type: string | null }

const RULES: ReadonlyArray<readonly [string, RoamType, string]> = [
  ['restaurant',              'food',      'restaurant'],
  ['meal_takeaway',           'food',      'restaurant'],
  ['meal_delivery',           'food',      'restaurant'],
  ['cafe',                    'food',      'coffee'],
  ['bakery',                  'food',      'dessert'],
  ['ice_cream_shop',          'food',      'dessert'],
  ['dessert',                 'food',      'dessert'],
  ['bar',                     'food',      'bar'],
  ['night_club',              'food',      'bar'],
  ['lodging',                 'logistics', 'hotel'],
  ['hotel',                   'logistics', 'hotel'],
  ['airport',                 'logistics', 'flight_arrival'],
  ['transit_station',         'logistics', 'transit'],
  ['train_station',           'logistics', 'transit'],
  ['subway_station',          'logistics', 'transit'],
  ['bus_station',             'logistics', 'transit'],
  ['grocery_or_supermarket',  'logistics', 'grocery'],
  ['supermarket',             'logistics', 'grocery'],
  ['hospital',                'logistics', 'medical'],
  ['doctor',                  'logistics', 'medical'],
  ['health',                  'logistics', 'medical'],
  ['pharmacy',                'logistics', 'medical'],
  ['drugstore',               'logistics', 'medical'],
  ['shopping_mall',           'activity',  'shopping'],
  ['clothing_store',          'activity',  'shopping'],
  ['store',                   'activity',  'shopping'],
  ['spa',                     'activity',  'wellness'],
  ['gym',                     'activity',  'wellness'],
  ['beauty_salon',            'activity',  'wellness'],
  ['museum',                  'activity',  'guided'],
  ['art_gallery',             'activity',  'guided'],
  ['tourist_attraction',      'activity',  'self_directed'],
  ['park',                    'activity',  'self_directed'],
  ['zoo',                     'activity',  'self_directed'],
  ['aquarium',                'activity',  'self_directed'],
  ['amusement_park',          'activity',  'self_directed'],
  ['stadium',                 'activity',  'event'],
  ['movie_theater',           'activity',  'event'],
  ['performing_arts_theater', 'activity',  'event'],
]

function inferType(googleTypes: string[] | null | undefined): InferredType {
  if (!googleTypes || googleTypes.length === 0) return { type: null, sub_type: null }
  const set = new Set(googleTypes)
  for (const [googleType, type, sub_type] of RULES) {
    if (set.has(googleType)) return { type, sub_type }
  }
  return { type: null, sub_type: null }
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchPlaceDetails — MIRRORS src/lib/places/fetchDetails.ts. Keep in sync.
// The FIELDS list must stay identical or enrichment diverges from the route.
// ─────────────────────────────────────────────────────────────────────────────

const DETAIL_FIELDS = [
  'name',
  'formatted_address',
  'formatted_phone_number',
  'website',
  'rating',
  'photos',
  'geometry',
  'opening_hours',
  'price_level',
  'types',
].join(',')

type FetchDetailsFailure =
  | 'google_places_404'
  | 'google_places_rate_limit'
  | 'google_places_error'

type FetchDetailsResult =
  | { ok: true; result: Record<string, unknown> }
  | { ok: false; reason: FetchDetailsFailure; detail?: string }

async function fetchPlaceDetails(googlePlaceId: string, apiKey: string): Promise<FetchDetailsResult> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
  url.searchParams.set('place_id', googlePlaceId)
  url.searchParams.set('fields', DETAIL_FIELDS)
  url.searchParams.set('key', apiKey)

  let res: Response
  try {
    res = await fetch(url.toString())
  } catch (err) {
    return { ok: false, reason: 'google_places_error', detail: (err as Error).message }
  }

  if (res.status === 429) return { ok: false, reason: 'google_places_rate_limit' }
  if (!res.ok)            return { ok: false, reason: 'google_places_error', detail: `HTTP ${res.status}` }

  const data = (await res.json()) as {
    status?: string
    result?: Record<string, unknown>
    error_message?: string
  }

  if (data.status === 'OK' && data.result)                           return { ok: true, result: data.result }
  if (data.status === 'NOT_FOUND' || data.status === 'ZERO_RESULTS') return { ok: false, reason: 'google_places_404' }
  if (data.status === 'OVER_QUERY_LIMIT')                            return { ok: false, reason: 'google_places_rate_limit' }
  return { ok: false, reason: 'google_places_error', detail: data.error_message ?? data.status }
}

// ─────────────────────────────────────────────────────────────────────────────
// Env loading — .env.local only. Values are never logged.
// ─────────────────────────────────────────────────────────────────────────────

function loadEnvLocal(): Record<string, string> {
  const file = path.join(REPO_ROOT, '.env.local')
  if (!fs.existsSync(file)) {
    console.error(`❌  ${file} not found.`)
    console.error('    This script reads credentials from .env.local — see the header block.')
    process.exit(1)
  }

  const env: Record<string, string> = {}
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val   = line.slice(eq + 1).trim()
    // Strip one layer of matching quotes if present.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key) env[key] = val
  }
  return env
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─────────────────────────────────────────────────────────────────────────────
// Input shape
// ─────────────────────────────────────────────────────────────────────────────

interface PlaceToEnrich {
  title: string
  /** Human search string. null means "vendor decision pending" — skipped. */
  search: string | null
  /**
   * Per-entry override. bulk-import's `defaults` is batch-wide, so a place
   * needing an explicit sub_type (Esselunga → logistics/grocery) would need its
   * own single-entry call to that route. Here it rides along per entry.
   *
   * The Tuscany input sets these on every entry, which means inferType never
   * decides anything — that is deliberate. Two sub_types in this itinerary
   * ('grocery', 'challenge') either have no inference rule or no rule that
   * would pick them, so relying on inference would silently mislabel them.
   */
  type?: RoamType
  sub_type?: string
  /** Author's own confidence + note, surfaced in the review table. */
  confidence?: string
  note?: string
  /** Which category block it came from, for grouping the table. */
  category: string
}

interface ResolvedEntry {
  title: string
  search: string
  category: string
  /** Author's stated confidence — 'low' means they already expect trouble. */
  confidence: string | null
  note: string | null
  google_place_id: string | null
  resolved_name: string | null
  resolved_address: string | null
  resolved_types: string[]
  lat: number | null
  lng: number | null
  inferred_type: string | null
  inferred_sub_type: string | null
  override_type: string | null
  override_sub_type: string | null
  /** Human-readable warnings. Non-empty means: look at this row before approving. */
  flags: string[]
  /** Runner-up candidates, so a wrong top hit can be corrected by hand. */
  alternatives: { name: string; address: string; google_place_id: string }[]
}

function readInputPlaces(): PlaceToEnrich[] {
  if (!fs.existsSync(INPUT_JSON)) {
    console.error(`❌  ${INPUT_JSON} not found.`)
    console.error('    Save the itinerary JSON to the repo root under that name first.')
    process.exit(1)
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(fs.readFileSync(INPUT_JSON, 'utf8'))
  } catch (err) {
    console.error(`❌  ${INPUT_JSON} is not valid JSON: ${(err as Error).message}`)
    process.exit(1)
  }

  const meta = parsed['_meta'] as Record<string, unknown> | undefined
  if (meta && typeof meta.trip === 'string') TRIP_LABEL = meta.trip
  const bias = meta?.region_bias as { lat?: unknown; lng?: unknown; radius_m?: unknown } | undefined
  if (bias && typeof bias.lat === 'number' && typeof bias.lng === 'number') {
    REGION_BIAS = {
      lat: bias.lat,
      lng: bias.lng,
      radiusMeters: typeof bias.radius_m === 'number' ? bias.radius_m : 100_000,
    }
  }

  const raw = parsed['step_1_places_to_enrich']
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    console.error('❌  Expected a `step_1_places_to_enrich` object at the top level.')
    console.error(`    Top-level keys present: ${Object.keys(parsed).join(', ')}`)
    process.exit(1)
  }

  /**
   * step_1_places_to_enrich is keyed by category (logistics / activities / food)
   * alongside `_`-prefixed metadata keys. Flatten every array value, skip the
   * metadata, and remember which category each entry came from.
   */
  const places: PlaceToEnrich[] = []
  for (const [category, value] of Object.entries(raw as Record<string, unknown>)) {
    if (category.startsWith('_')) continue
    if (!Array.isArray(value)) {
      console.error(`❌  step_1_places_to_enrich.${category} is not an array.`)
      process.exit(1)
    }
    value.forEach((entry, i) => {
      const e   = entry as Record<string, unknown>
      const at  = `step_1_places_to_enrich.${category}[${i}]`
      if (typeof e.title !== 'string' || !e.title.trim()) {
        console.error(`❌  ${at} has no usable \`title\`.`)
        process.exit(1)
      }
      if (e.search !== null && typeof e.search !== 'string') {
        console.error(`❌  ${at} (${e.title}) has a \`search\` that is neither a string nor null.`)
        process.exit(1)
      }
      places.push({
        title:      e.title,
        search:     (e.search as string | null) ?? null,
        type:       typeof e.type === 'string' ? (e.type as RoamType) : undefined,
        sub_type:   typeof e.sub_type === 'string' ? e.sub_type : undefined,
        confidence: typeof e.confidence === 'string' ? e.confidence : undefined,
        note:       typeof e.note === 'string' ? e.note : undefined,
        category,
      })
    })
  }

  const dupes = places.map((p) => p.title).filter((t, i, a) => a.indexOf(t) !== i)
  if (dupes.length) {
    console.error(`❌  Duplicate titles in step_1_places_to_enrich: ${Array.from(new Set(dupes)).join(", ")}`)
    console.error('    Titles are the join key for step_2 `place_ref`, so they must be unique.')
    process.exit(1)
  }

  return places
}

// ─────────────────────────────────────────────────────────────────────────────
// PASS 1 — resolve search strings to google_place_ids. Read-only.
// ─────────────────────────────────────────────────────────────────────────────

interface TextSearchCandidate {
  name?: string
  formatted_address?: string
  place_id?: string
  types?: string[]
  geometry?: { location?: { lat?: number; lng?: number } }
}

async function textSearch(query: string, apiKey: string): Promise<TextSearchCandidate[]> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json')
  url.searchParams.set('query', query)
  url.searchParams.set('location', `${REGION_BIAS.lat},${REGION_BIAS.lng}`)
  url.searchParams.set('radius', String(REGION_BIAS.radiusMeters))
  url.searchParams.set('key', apiKey)

  const res  = await fetch(url.toString())
  const data = (await res.json()) as { status?: string; results?: TextSearchCandidate[]; error_message?: string }

  if (data.status === 'OK' && data.results?.length) return data.results
  if (data.status === 'ZERO_RESULTS')               return []

  console.warn(`  ⚠  Text Search returned ${data.status}${data.error_message ? ` — ${data.error_message}` : ''}`)
  return []
}

async function runResolve(apiKey: string): Promise<void> {
  const places  = readInputPlaces()
  const pending = places.filter((p) => p.search === null)
  const target  = places.filter((p) => p.search !== null)

  console.log(`🔎  Roam — ${TRIP_LABEL} place resolution (PASS 1, read-only)`)
  console.log('━'.repeat(78))
  console.log(`    ${places.length} entries — ${target.length} to resolve, ${pending.length} skipped (search: null)\n`)

  if (pending.length) {
    console.log('    Skipped, awaiting a vendor decision:')
    for (const p of pending) console.log(`      · ${p.title}`)
    console.log('')
  }

  const resolved: ResolvedEntry[] = []

  for (const place of target) {
    const search = place.search as string
    process.stdout.write(`  → ${place.title} … `)

    const candidates = await textSearch(search, apiKey)
    const top        = candidates[0]
    const flags: string[] = []

    if (!top?.place_id) {
      console.log('NO MATCH')
      resolved.push({
        title: place.title, search,
        category: place.category,
        confidence: place.confidence ?? null,
        note: place.note ?? null,
        google_place_id: null, resolved_name: null, resolved_address: null,
        resolved_types: [], lat: null, lng: null,
        inferred_type: null, inferred_sub_type: null,
        override_type: place.type ?? null, override_sub_type: place.sub_type ?? null,
        flags: ['NO_MATCH — Google returned nothing; fill in google_place_id by hand or drop this entry'],
        alternatives: [],
      })
      await sleep(THROTTLE_MS)
      continue
    }

    const types    = top.types ?? []
    const inferred = inferType(types)

    if (types.some((t) => GEOGRAPHY_TYPES.has(t))) {
      flags.push(`GEOGRAPHY — resolved to a place-on-the-map, not a venue (types: ${types.join(', ')})`)
    }
    if (!place.type && !inferred.type) {
      flags.push('NO_INFERENCE — inferType yields null; enrichment would skip this as inference_failed. Set type/sub_type in the input JSON.')
    }
    if (top.geometry?.location?.lat == null || top.geometry?.location?.lng == null) {
      flags.push('NO_COORDS — Text Search returned no geometry')
    }
    // Name drift is a weak signal on its own, but worth eyeballing alongside the rest.
    const topName = (top.name ?? '').toLowerCase()
    if (topName && !search.toLowerCase().split(/[,\s]+/).some((tok) => tok.length > 3 && topName.includes(tok))) {
      flags.push(`NAME_DRIFT — "${top.name}" shares no significant word with the search string`)
    }

    if (place.confidence === 'low') {
      flags.push('AUTHOR_FLAGGED_LOW — the itinerary itself marks this entry as needing a decision; check the match carefully')
    }

    resolved.push({
      title: place.title,
      search,
      category:          place.category,
      confidence:        place.confidence ?? null,
      note:              place.note ?? null,
      google_place_id:   top.place_id,
      resolved_name:     top.name ?? null,
      resolved_address:  top.formatted_address ?? null,
      resolved_types:    types,
      lat:               top.geometry?.location?.lat ?? null,
      lng:               top.geometry?.location?.lng ?? null,
      inferred_type:     inferred.type,
      inferred_sub_type: inferred.sub_type,
      override_type:     place.type ?? null,
      override_sub_type: place.sub_type ?? null,
      flags,
      alternatives: candidates.slice(1, 4).map((c) => ({
        name:            c.name ?? '',
        address:         c.formatted_address ?? '',
        google_place_id: c.place_id ?? '',
      })),
    })

    console.log(flags.length ? `⚠  ${top.name}` : `${top.name}`)
    await sleep(THROTTLE_MS)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(RESOLUTION_JSON, JSON.stringify({ resolved, skipped: pending.map((p) => p.title) }, null, 2))

  // ── Review table ──────────────────────────────────────────────────────────
  console.log('\n' + '━'.repeat(78))
  console.log('RESOLUTION TABLE — review before running with --live')
  console.log('━'.repeat(78))
  for (const r of resolved) {
    console.log(`\n  ${r.flags.length ? '⚠ ' : '  '}${r.title}   [${r.category}${r.confidence ? ` · confidence ${r.confidence}` : ''}]`)
    console.log(`      search   : ${r.search}`)
    console.log(`      resolved : ${r.resolved_name ?? '(no match)'}`)
    console.log(`      address  : ${r.resolved_address ?? '—'}`)
    console.log(`      place_id : ${r.google_place_id ?? '—'}`)
    const t  = r.override_type ?? r.inferred_type
    const st = r.override_sub_type ?? r.inferred_sub_type
    console.log(`      type     : ${t ?? '(none)'} / ${st ?? '(none)'}${r.override_type ? '  [override]' : ''}`)
    if (r.note) console.log(`      note     : ${r.note}`)
    for (const f of r.flags) console.log(`      ⚠  ${f}`)
    if (r.flags.length && r.alternatives.length) {
      console.log('      alternatives:')
      for (const a of r.alternatives) console.log(`        · ${a.name} — ${a.address}  [${a.google_place_id}]`)
    }
  }

  const flagged = resolved.filter((r) => r.flags.length)
  console.log('\n' + '━'.repeat(78))
  console.log(`  ${resolved.length} resolved, ${flagged.length} flagged for review, ${pending.length} skipped`)
  console.log(`  Written to: ${path.relative(REPO_ROOT, RESOLUTION_JSON)}`)
  console.log('\n  Nothing was written to the database. Correct any wrong google_place_id')
  console.log('  in that file by hand, then re-run with --live to enrich.')
}

// ─────────────────────────────────────────────────────────────────────────────
// PASS 2 — enrich and insert `places`. Mirrors bulk-import's loop exactly.
// ─────────────────────────────────────────────────────────────────────────────

interface ImportedEntry {
  place_id: string
  google_place_id: string
  title: string
  /** The title from the input JSON — bulk-import cannot give you this. */
  source_title: string
  created: boolean
}
interface FailureEntry {
  google_place_id: string
  source_title: string
  reason: string
}

async function runEnrich(apiKey: string, supabaseUrl: string, serviceKey: string): Promise<void> {
  if (!fs.existsSync(RESOLUTION_JSON)) {
    console.error(`❌  ${RESOLUTION_JSON} not found — run pass 1 (no --live) first.`)
    process.exit(1)
  }

  const { resolved } = JSON.parse(fs.readFileSync(RESOLUTION_JSON, 'utf8')) as { resolved: ResolvedEntry[] }
  if (fs.existsSync(INPUT_JSON)) readInputPlaces() // sets TRIP_LABEL; validates the input is still coherent
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`🍅  Roam — ${TRIP_LABEL} enrichment (PASS 2, LIVE — writes \`places\`)`)
  console.log('━'.repeat(78))

  const usable  = resolved.filter((r) => r.google_place_id)
  const unusable = resolved.filter((r) => !r.google_place_id)
  console.log(`    ${usable.length} to enrich, ${unusable.length} with no google_place_id (skipped)\n`)

  const imported: ImportedEntry[] = []
  const failures: FailureEntry[]  = []

  for (const entry of unusable) {
    failures.push({ google_place_id: '(unresolved)', source_title: entry.title, reason: 'no_google_place_id' })
  }

  for (const entry of usable) {
    const googlePlaceId = entry.google_place_id as string
    process.stdout.write(`  → ${entry.title} … `)

    // ── Reuse check — must never write ──────────────────────────────────────
    const { data: existing } = await supabase
      .from('places')
      .select('id, title')
      .eq('user_id', OWNER_USER_ID)
      .eq('google_place_id', googlePlaceId)
      .maybeSingle()

    if (existing) {
      imported.push({
        place_id:        existing.id,
        google_place_id: googlePlaceId,
        title:           existing.title,
        source_title:    entry.title,
        created:         false,
      })
      console.log('reused')
      continue
    }

    // ── Google details fetch ────────────────────────────────────────────────
    const detailsRes = await fetchPlaceDetails(googlePlaceId, apiKey)
    if (!detailsRes.ok) {
      failures.push({ google_place_id: googlePlaceId, source_title: entry.title, reason: detailsRes.reason })
      console.log(`FAILED (${detailsRes.reason})`)
      await sleep(THROTTLE_MS)
      continue
    }

    const result = detailsRes.result as {
      name?: string
      formatted_address?: string
      formatted_phone_number?: string
      website?: string
      rating?: number
      geometry?: { location?: { lat?: number; lng?: number } }
      opening_hours?: unknown
      price_level?: number
      types?: string[]
    }

    // ── Resolve type / sub_type: per-entry override wins, else infer ────────
    let resolvedType:    string | null
    let resolvedSubType: string | null
    if (entry.override_type && entry.override_sub_type) {
      resolvedType    = entry.override_type
      resolvedSubType = entry.override_sub_type
    } else {
      const inferred  = inferType(result.types)
      resolvedType    = inferred.type
      resolvedSubType = inferred.sub_type
    }

    if (!resolvedType || !resolvedSubType) {
      failures.push({ google_place_id: googlePlaceId, source_title: entry.title, reason: 'inference_failed' })
      console.log('FAILED (inference_failed)')
      await sleep(THROTTLE_MS)
      continue
    }

    const row = {
      user_id:         OWNER_USER_ID,
      google_place_id: googlePlaceId,
      title:           result.name ?? '',
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
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('places')
      .insert(row)
      .select('id, title')
      .single()

    if (insertErr || !inserted) {
      failures.push({ google_place_id: googlePlaceId, source_title: entry.title, reason: 'insert_failed' })
      console.log(`FAILED (insert_failed: ${insertErr?.message ?? 'unknown'})`)
      await sleep(THROTTLE_MS)
      continue
    }

    imported.push({
      place_id:        inserted.id,
      google_place_id: googlePlaceId,
      title:           inserted.title,
      source_title:    entry.title,
      created:         true,
    })
    console.log(`created → ${inserted.id}`)
    await sleep(THROTTLE_MS)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(IMPORT_JSON, JSON.stringify({ imported, failures }, null, 2))

  // ── Bare-row check: the entire point of the exercise ──────────────────────
  const createdIds = imported.filter((i) => i.created).map((i) => i.place_id)
  let bare: { id: string; title: string; google_place_id: string | null; lat: number | null; lng: number | null }[] = []
  if (createdIds.length) {
    const { data } = await supabase
      .from('places')
      .select('id, title, google_place_id, lat, lng')
      .in('id', createdIds)
    bare = (data ?? []).filter((p) => !p.google_place_id || p.lat === null || p.lng === null)
  }

  console.log('\n' + '━'.repeat(78))
  console.log(`  imported: ${imported.length}  (created ${imported.filter((i) => i.created).length}, reused ${imported.filter((i) => !i.created).length})`)
  console.log(`  failures: ${failures.length}`)
  for (const f of failures) console.log(`    ✗ ${f.source_title} — ${f.reason} [${f.google_place_id}]`)
  if (bare.length) {
    console.log(`\n  ❌  ${bare.length} BARE ROW(S) — missing google_place_id or coordinates:`)
    for (const b of bare) console.log(`    · ${b.title} [${b.id}] gpid=${b.google_place_id ?? 'NULL'} lat=${b.lat ?? 'NULL'} lng=${b.lng ?? 'NULL'}`)
  } else {
    console.log('\n  ✅  Every newly created place has google_place_id, lat and lng.')
  }
  console.log(`\n  Written to: ${path.relative(REPO_ROOT, IMPORT_JSON)}`)
  console.log('  Send that file back to continue with card insertion.')
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const live = process.argv.includes('--live')
  const env  = loadEnvLocal()

  const googleKey   = env.GOOGLE_PLACES_API_KEY
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = env.SUPABASE_SERVICE_KEY

  if (!googleKey) {
    console.error('❌  GOOGLE_PLACES_API_KEY is missing from .env.local.')
    console.error('    (It is not in .env.local.example either — add it.)')
    process.exit(1)
  }
  if (live && !supabaseUrl) { console.error('❌  SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL is missing from .env.local.'); process.exit(1) }
  if (live && !serviceKey)  { console.error('❌  SUPABASE_SERVICE_KEY is missing from .env.local.');                    process.exit(1) }

  if (live) await runEnrich(googleKey, supabaseUrl!, serviceKey!)
  else      await runResolve(googleKey)
}

main().catch((err) => {
  console.error('\n❌  Unhandled error:', err)
  process.exit(1)
})
