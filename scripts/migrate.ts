#!/usr/bin/env node
/**
 * Roam — Database Migration Runner
 *
 * Usage:
 *   npx ts-node scripts/migrate.ts
 *
 * Requires environment variables:
 *   SUPABASE_URL          — your project URL
 *   SUPABASE_SERVICE_KEY  — service role key (bypasses RLS)
 *   SEED_USER_ID          — (optional) uuid of the user to seed data for
 *
 * What it does:
 *   1. Runs 001_schema.sql  — creates tables and RLS policies
 *   2. Runs 002_seed.sql    — seeds Rome trip data
 *
 * Safe to run multiple times — schema uses IF NOT EXISTS.
 * Seed will insert a new trip each time if not guarded externally.
 */

import * as fs from 'fs'
import * as path from 'path'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const SEED_USER_ID = process.env.SEED_USER_ID || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌  Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

async function runSQL(sql: string, label: string) {
  console.log(`\n▶  Running: ${label}`)

  const url = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`

  // Supabase doesn't expose a raw SQL endpoint via REST — we use the
  // pg REST proxy approach by POSTing to the /sql endpoint (available
  // on self-hosted) or the management API for hosted projects.
  //
  // For Supabase Cloud, use the management API:
  const projectRef = SUPABASE_URL!.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

  if (!projectRef) {
    throw new Error('Could not extract project ref from SUPABASE_URL')
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`SQL execution failed (${response.status}): ${text}`)
  }

  const result = await response.json()
  console.log(`✅  ${label} — done`)
  return result
}

async function main() {
  console.log('🗺   Roam — Database Migration Runner')
  console.log('━'.repeat(50))

  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations')

  // 1. Schema
  const schemaSql = fs.readFileSync(
    path.join(migrationsDir, '001_schema.sql'),
    'utf8'
  )
  await runSQL(schemaSql, '001_schema.sql')

  // 2. Seed — substitute user ID placeholder
  if (SEED_USER_ID) {
    let seedSql = fs.readFileSync(
      path.join(migrationsDir, '002_seed.sql'),
      'utf8'
    )
    seedSql = seedSql.replaceAll('__USER_ID__', SEED_USER_ID)
    await runSQL(seedSql, '002_seed.sql')
  } else {
    console.log('\n⚠️   SEED_USER_ID not set — skipping seed data.')
    console.log(
      '    Set SEED_USER_ID=<your-supabase-user-uuid> to seed the Rome trip.'
    )
  }

  console.log('\n🎉  Migrations complete!')
}

main().catch((err) => {
  console.error('\n❌  Migration failed:', err.message)
  process.exit(1)
})
