#!/usr/bin/env node
/**
 * Roam — Local Supabase Seed Script
 *
 * For use with `supabase start` (local development).
 * Uses the @supabase/supabase-js client directly with the service role key.
 *
 * Usage:
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_KEY=<service-role-key> \
 *   SEED_USER_ID=<user-uuid> \
 *   npx ts-node scripts/seed-local.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const userId = process.env.SEED_USER_ID

if (!url || !key) {
  console.error('❌  SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
  process.exit(1)
}

if (!userId) {
  console.error('❌  SEED_USER_ID is required')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('🗺   Roam — Seeding local database')
  console.log('━'.repeat(50))

  // Read and substitute seed SQL
  const seedPath = path.join(__dirname, '..', 'supabase', 'migrations', '002_seed.sql')
  const seedSql = fs
    .readFileSync(seedPath, 'utf8')
    .replaceAll('__USER_ID__', userId!)

  // Execute via Supabase RPC (requires exec_sql function or pg_net)
  // For local dev, we can use supabase CLI's db push instead.
  // This script outputs the substituted SQL for piping into psql.
  const outPath = path.join(__dirname, '..', '.generated-seed.sql')
  fs.writeFileSync(outPath, seedSql)

  console.log(`\n✅  Generated seed SQL at: .generated-seed.sql`)
  console.log('\nRun this to apply:')
  console.log(
    `  psql "$(supabase status | grep 'DB URL' | awk '{print $3}')" -f .generated-seed.sql`
  )
  console.log('\nOr via Supabase CLI:')
  console.log('  supabase db reset  (WARNING: wipes all data)')
}

main().catch(console.error)
