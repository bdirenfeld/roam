# RESTORE — Rome and NYC trips, snapshot of 2026-05-13

Defensive backup taken before the two-table places/cards rebuild. If the rebuild loses data or needs to be rolled back, the files in this folder are the source of truth for the two production trips that had real editorial work in them.

## What's in this folder

| File | Contents |
|---|---|
| `rome-backup.json` | Full referential closure for the Rome trip: trip row, 7 days, 71 cards (41 interested + 30 in_itinerary), 0 documents, 9 card_attachments. Pretty-printed JSON, 2-space indent. |
| `rome-backup.sql`  | Same rows as `INSERT … ON CONFLICT (id) DO NOTHING`, wrapped in `BEGIN; … COMMIT;`. All text/JSONB literals dollar-quoted with `$BAK_2026_05_13$`. |
| `nyc-backup.json`  | Full referential closure for the NYC trip: trip row, 4 days, 95 cards (75 interested + 20 in_itinerary), 0 documents, 6 card_attachments. |
| `nyc-backup.sql`   | Same as Rome's SQL, for the NYC trip. |
| `RESTORE.md`       | This file. |

**Trip IDs:**
- Rome: `338bdff4-5581-48b9-9c5b-deff8a54a7d9` — `Rome April 2026`
- NYC:  `d1e7efa9-ef70-490a-ba34-1dc74a3e6055` — `New York (Mia & Daddy)`

## What's NOT in this folder — binary attachments

**The 15 `card_attachments` binary files (9 Rome + 6 NYC, ~3.3 MB total) are NOT included in this backup.** They remain on Supabase Storage in the `card-attachments` bucket. The `card_attachments` table rows ARE included, so file metadata (file_name, file_url, file_size, parsed_data) survives the rebuild even if this backup is the only thing that's restored.

The binaries were intentionally skipped during the backup because:
- The `card-attachments` bucket is private (`public=false`).
- The runtime taking the backup had no egress to the Supabase host.
- Workarounds (deploying a helper edge function, opening a temporary storage policy) were out of scope of the "read-only against Supabase, no project changes" constraint.

**Implication for restore:** A full restore requires both replaying the SQL **and** independently re-syncing the 15 binary files from Supabase Storage. If Storage has been emptied or pruned in the interim, the `file_url` columns will still be valid pointers but the bytes will no longer be there — flag this risk before relying on this backup.

## When to use this backup

You should be running this restore procedure only if:
1. The two-table rebuild lost data for one or both trips, AND
2. You've confirmed the production rows for these trips are missing or corrupted, AND
3. You've stopped writes to the affected rows (no active editing).

If only some rows are missing, prefer a surgical fix over a full restore — the `INSERT … ON CONFLICT (id) DO NOTHING` semantics mean a partial replay is safe, but a partial replay won't *undo* corruption to rows that already exist.

## Restore procedure

### Step 1 — Verify the backup is the right snapshot

```bash
# Both files must parse and contain the expected counts.
python3 -c "import json,sys; d=json.load(open('rome-backup.json')); print('rome:', len(d['days']), 'days,', len(d['cards']), 'cards,', len(d['card_attachments']), 'attachments')"
python3 -c "import json,sys; d=json.load(open('nyc-backup.json')); print('nyc:', len(d['days']), 'days,', len(d['cards']), 'cards,', len(d['card_attachments']), 'attachments')"
```

Expected output:
- `rome: 7 days, 71 cards, 9 attachments`
- `nyc: 4 days, 95 cards, 6 attachments`

### Step 2 — Clear existing rows for these trips (per-trip)

Run these `DELETE` statements first. They are required because the backup SQL uses `ON CONFLICT (id) DO NOTHING`, which is a safety guard against double-inserting on partial restore — it does **not** overwrite rows that already exist. If you want a clean restore, you must remove the existing (possibly corrupted) rows first.

**For Rome (`338bdff4-5581-48b9-9c5b-deff8a54a7d9`):**

```sql
BEGIN;
DELETE FROM card_attachments WHERE card_id IN (SELECT id FROM cards WHERE trip_id = '338bdff4-5581-48b9-9c5b-deff8a54a7d9');
DELETE FROM documents WHERE trip_id = '338bdff4-5581-48b9-9c5b-deff8a54a7d9';
DELETE FROM cards     WHERE trip_id = '338bdff4-5581-48b9-9c5b-deff8a54a7d9';
DELETE FROM days      WHERE trip_id = '338bdff4-5581-48b9-9c5b-deff8a54a7d9';
DELETE FROM trips     WHERE id      = '338bdff4-5581-48b9-9c5b-deff8a54a7d9';
COMMIT;
```

**For NYC (`d1e7efa9-ef70-490a-ba34-1dc74a3e6055`):**

```sql
BEGIN;
DELETE FROM card_attachments WHERE card_id IN (SELECT id FROM cards WHERE trip_id = 'd1e7efa9-ef70-490a-ba34-1dc74a3e6055');
DELETE FROM documents WHERE trip_id = 'd1e7efa9-ef70-490a-ba34-1dc74a3e6055';
DELETE FROM cards     WHERE trip_id = 'd1e7efa9-ef70-490a-ba34-1dc74a3e6055';
DELETE FROM days      WHERE trip_id = 'd1e7efa9-ef70-490a-ba34-1dc74a3e6055';
DELETE FROM trips     WHERE id      = 'd1e7efa9-ef70-490a-ba34-1dc74a3e6055';
COMMIT;
```

Order matters — foreign keys cascade in this direction:
`card_attachments → documents → cards → days → trips`.

### Step 3 — Replay the backup SQL

```bash
# Replace with your DATABASE_URL or psql connection flags.
psql "$DATABASE_URL" -f rome-backup.sql
psql "$DATABASE_URL" -f nyc-backup.sql
```

Each file is wrapped in a single `BEGIN; … COMMIT;`. If any INSERT fails the entire trip's restore is rolled back.

Insert order inside each file respects FKs: `trips → days → cards → documents → card_attachments`.

### Step 4 — Re-sync binary attachments (separate manual step)

Restoring the SQL does **not** restore the 15 binary files. After the SQL is replayed:

1. Confirm the binaries are still present in Supabase Storage under the paths recorded in `card_attachments.file_url`:
   ```sql
   SELECT id, file_name, file_url, file_size
   FROM card_attachments
   WHERE card_id IN (SELECT id FROM cards WHERE trip_id IN (
     '338bdff4-5581-48b9-9c5b-deff8a54a7d9',
     'd1e7efa9-ef70-490a-ba34-1dc74a3e6055'
   ));
   ```
2. For each row, fetch the object from the `card-attachments` bucket and verify the byte size matches `file_size`.
3. If a file is missing from Storage, the corresponding `card_attachments` row will still exist after the SQL restore but the app will show a broken attachment — at that point, only the user-facing card metadata (title, address, parsed_data) is recoverable. The original PDF/screenshot is lost unless it was retained elsewhere (e.g., Gmail).

### Step 5 — Sanity-check the restore

After Steps 3 + 4 complete:

```sql
SELECT
  t.id, t.title,
  (SELECT count(*) FROM days WHERE trip_id = t.id) AS days,
  (SELECT count(*) FROM cards WHERE trip_id = t.id) AS cards,
  (SELECT count(*) FROM cards WHERE trip_id = t.id AND status = 'interested') AS cards_interested,
  (SELECT count(*) FROM cards WHERE trip_id = t.id AND status = 'in_itinerary') AS cards_in_itinerary,
  (SELECT count(*) FROM documents WHERE trip_id = t.id) AS documents,
  (SELECT count(*) FROM card_attachments WHERE card_id IN (SELECT id FROM cards WHERE trip_id = t.id)) AS card_attachments
FROM trips t
WHERE t.id IN ('338bdff4-5581-48b9-9c5b-deff8a54a7d9', 'd1e7efa9-ef70-490a-ba34-1dc74a3e6055');
```

Expected results:

| trip_id | title | days | cards | interested | in_itinerary | documents | card_attachments |
|---|---|---:|---:|---:|---:|---:|---:|
| `338bdff4-…` | Rome April 2026 | 7 | 71 | 41 | 30 | 0 | 9 |
| `d1e7efa9-…` | New York (Mia & Daddy) | 4 | 95 | 75 | 20 | 0 | 6 |

## SQL file conventions

- Dollar-quote tag is `$BAK_2026_05_13$`. The generator raises if any row content contains this tag, so collisions are guaranteed not to silently corrupt the file.
- JSONB columns (`cards.details`, `documents.parsed_data`, `card_attachments.parsed_data`) are dollar-quoted JSON text with an explicit `::jsonb` cast.
- Array columns (`trips.party_ages`, `documents.card_ids`) use `ARRAY[…]::int[]` / `ARRAY[…]::uuid[]`.
- Booleans are emitted as `TRUE` / `FALSE`.
- All identifiers in INSERT column lists are unquoted (no reserved words used).

## Snapshot metadata

- **Snapshot date:** 2026-05-13
- **Backup taken on:** 2026-05-14
- **Source project:** `ejluvgjiqcwvqhzqpkrz` (Supabase, `Roam` org)
- **Postgres version:** 17.6.1.084
- **Verification at time of backup:** all four files parsed; row counts matched live DB exactly; dollar-quote markers balanced; zero single quotes outside dollar-quoted blocks.
