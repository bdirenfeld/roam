#!/usr/bin/env node
/**
 * Roam — Backfill lat/lng for cards that have a place_id but missing coordinates
 *
 * Usage:
 *   GOOGLE_PLACES_API_KEY=<key> \
 *   SUPABASE_URL=https://ejluvgjiqcwvqhzqpkrz.supabase.co \
 *   SUPABASE_SERVICE_KEY=<service-role-key> \
 *   npx ts-node scripts/backfill-coords.ts
 *
 * What it does:
 *   1. Calls the Google Places Details API (legacy) for each place_id
 *   2. Extracts geometry.location.lat / .lng
 *   3. Writes lat + lng back to the cards table
 *   4. Runs a verification query to confirm all cards now have coordinates
 *
 * place_ids are cached per-run so duplicate place_ids only hit the API once.
 */

import { createClient } from '@supabase/supabase-js'

const GOOGLE_KEY    = process.env.GOOGLE_PLACES_API_KEY
const SUPABASE_URL  = process.env.SUPABASE_URL
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY

if (!GOOGLE_KEY)   { console.error('❌  GOOGLE_PLACES_API_KEY is required'); process.exit(1) }
if (!SUPABASE_URL) { console.error('❌  SUPABASE_URL is required');            process.exit(1) }
if (!SUPABASE_KEY) { console.error('❌  SUPABASE_SERVICE_KEY is required');    process.exit(1) }

const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Cards confirmed to be missing lat/lng with their place_ids
const CARDS: { id: string; place_id: string }[] = [
  { id: 'f4b16f2a-4b87-473f-8f51-48d3c244d7bd', place_id: 'ChIJExckH1BgLxMR03KWKuc2ru4' },
  { id: 'e53808c6-9eae-48ac-914e-6fd10e6a8573', place_id: 'ChIJs5_SrAFhLxMR1aeEPrll8WE' },
  { id: 'f5943aea-5d92-49f8-a0b5-b102f75708a6', place_id: 'ChIJkdQtwEo5K4gRxQ4DxOldHbQ' },
  { id: '44d5ef57-88b6-402c-b2cb-c9a7018d504c', place_id: 'ChIJa9yIIz-HJRMRLp2Kmg2w7Rs' },
  { id: '6e67900a-1733-416c-8a36-c39e7d8af3d9', place_id: 'ChIJs5_SrAFhLxMR1aeEPrll8WE' },
  { id: '8c1f37c5-3a53-42ec-95e4-ae59bf7615df', place_id: 'ChIJ2wY2OltgLxMRVkQ95RLZO94' },
  { id: '6246b906-3c93-4978-820b-715221fdf8ca', place_id: 'ChIJVTkQgThgLxMRWM0saoiZzkA' },
  { id: '30a7a5de-0b3c-45fd-9f57-0a75aa19fc9b', place_id: 'ChIJU6OZqUVgLxMRW52v7Rh4pvw' },
  { id: 'eded1aa3-4e28-4edd-9afe-b42724b4086b', place_id: 'ChIJqUCGZ09gLxMRLM42IPpl0co' },
  { id: '21f7e75b-11ae-4579-bace-ceca17622f4c', place_id: 'ChIJVTkQgThgLxMRWM0saoiZzkA' },
  { id: '50bfe102-d14d-41b8-b1b8-a8695adedddd', place_id: 'ChIJgxejEzBhLxMRNEOZs_YIecg' },
  { id: '841aeb83-96de-4a0e-8fe2-848693a4fc5f', place_id: 'ChIJccS5_rFhLxMRnbUdl5F0T0c' },
]

async function fetchCoords(placeId: string): Promise<{ lat: number; lng: number } | null> {
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${placeId}&fields=geometry&key=${GOOGLE_KEY}`

  const res  = await fetch(url)
  const data = await res.json() as {
    status: string
    result?: { geometry?: { location?: { lat: number; lng: number } } }
  }

  if (data.result?.geometry?.location) return data.result.geometry.location
  console.warn(`  ⚠  No geometry for ${placeId} (Places status: ${data.status})`)
  return null
}

async function main() {
  console.log('🗺   Roam — Backfill lat/lng from Google Places')
  console.log('━'.repeat(50))
  console.log(`    ${CARDS.length} cards to process\n`)

  // Cache coords per place_id — avoids redundant API calls for shared place_ids
  const cache = new Map<string, { lat: number; lng: number } | null>()

  let ok = 0
  let failed = 0

  for (const card of CARDS) {
    // Resolve coords (from cache or API)
    if (!cache.has(card.place_id)) {
      cache.set(card.place_id, await fetchCoords(card.place_id))
    }
    const coords = cache.get(card.place_id)!

    if (!coords) {
      console.error(`  ✗  ${card.id.slice(0, 8)} — Places API returned no geometry`)
      failed++
      continue
    }

    // Write to database
    const { error } = await supabase
      .from('cards')
      .update({ lat: coords.lat, lng: coords.lng })
      .eq('id', card.id)

    if (error) {
      console.error(`  ✗  ${card.id.slice(0, 8)} — DB error: ${error.message}`)
      failed++
    } else {
      console.log(
        `  ✓  ${card.id.slice(0, 8)}  place_id=${card.place_id}` +
        `  →  lat=${coords.lat}  lng=${coords.lng}`
      )
      ok++
    }
  }

  console.log('\n━'.repeat(50))
  console.log(`    Updated: ${ok}/${CARDS.length}   Failed: ${failed}`)

  // ── Verification query ─────────────────────────────────────────
  console.log('\n🔍  Verification query:')
  const ids = CARDS.map(c => c.id)
  const { data: rows, error: verifyErr } = await supabase
    .from('cards')
    .select('id, lat, lng')
    .in('id', ids)
    .order('id')

  if (verifyErr) {
    console.error('  Verification failed:', verifyErr.message)
    process.exit(1)
  }

  let allGood = true
  for (const row of rows ?? []) {
    const hasCoords = row.lat != null && row.lng != null
    const icon = hasCoords ? '✓' : '✗'
    console.log(`  ${icon}  ${(row.id as string).slice(0, 8)}  lat=${row.lat}  lng=${row.lng}`)
    if (!hasCoords) allGood = false
  }

  if (allGood && ok === CARDS.length) {
    console.log('\n🎉  All 12 cards now have coordinates.')
  } else {
    console.error('\n❌  Some cards are still missing coordinates — re-run to retry.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('\n❌  Backfill failed:', err)
  process.exit(1)
})
