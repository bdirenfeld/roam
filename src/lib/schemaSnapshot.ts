/**
 * The live database's public schema, table by table.
 *
 * Checked in so `schemaContract.test.ts` can verify every PostgREST `.select()`
 * in the app without a database connection or a secret — the checks workflow
 * has neither, deliberately.
 *
 * WHY THIS EXISTS: PostgREST does not fail loudly on a wrong column name. It
 * returns an error object with `data: null`, and a caller that reads `data`
 * without checking `error` renders an empty screen. That is how the guest
 * itinerary once asked `days` for `title` — a column it does not have — and
 * showed a journey with no days at all. Nothing crashed; the plan was just
 * gone.
 *
 * REFRESHING IT — do this whenever a migration adds, renames or drops a
 * column. Run against the live database and paste the result:
 *
 *   select json_object_agg(table_name, cols order by table_name)
 *   from (
 *     select table_name, json_agg(column_name order by ordinal_position) as cols
 *     from information_schema.columns
 *     where table_schema = 'public'
 *     group by table_name
 *   ) t;
 *
 * Captured 2026-09-07. A stale snapshot makes the test lie in both directions,
 * so refresh it in the same change as the migration, not afterwards.
 */
export const SCHEMA: Record<string, string[]> = {
  api_usage: ["user_id", "route", "day", "count"],
  card_attachments: ["id", "card_id", "trip_id", "file_name", "file_type", "file_url", "file_size", "parsed_data", "parse_status", "created_at", "file_path"],
  cards: ["id", "day_id", "trip_id", "start_time", "end_time", "position", "status", "source_url", "details", "ai_generated", "created_at", "confirmed", "place_id", "archived", "archived_at", "list_id"],
  client_errors: ["id", "user_id", "at", "kind", "message", "path", "stack", "user_agent"],
  companion_messages: ["id", "trip_id", "role", "content", "created_at", "conversation_id", "user_id"],
  days: ["id", "trip_id", "date", "day_number", "day_name", "narrative_position", "theme", "created_at"],
  documents: ["id", "trip_id", "user_id", "file_name", "file_type", "document_type", "parsed_data", "card_ids", "created_at"],
  ideas: ["id", "user_id", "url", "title", "note", "source", "status", "created_at", "tags", "wishlist_destination_id", "pins_added", "pinned_trip_id", "place"],
  lessons: ["id", "user_id", "body", "position", "created_at", "updated_at"],
  people: ["id", "trip_id", "name", "birthdate", "notes", "position", "created_at", "updated_at"],
  places: ["id", "user_id", "google_place_id", "title", "type", "sub_type", "lat", "lng", "address", "cover_image_url", "phone", "website", "hours", "rating", "price_level", "details", "archived", "archived_at", "created_at", "updated_at", "loved", "loved_at", "photo_cache", "photo_count"],
  travel_windows: ["id", "user_id", "label", "start_date", "end_date", "created_at"],
  trip_budgets: ["trip_id", "user_id", "currency", "fx_to_cad", "assumptions", "created_at", "updated_at", "basis"],
  trip_entry: ["trip_id", "passports", "data", "changed", "checked_at", "updated_at", "hidden_headline"],
  trip_lists: ["id", "trip_id", "title", "position", "created_at"],
  trip_members: ["id", "trip_id", "user_id", "role", "created_at"],
  trips: ["id", "user_id", "title", "destination", "destination_lat", "destination_lng", "start_date", "end_date", "trip_purpose", "trip_type", "party_size", "party_ages", "accommodation_name", "accommodation_address", "status", "created_at", "archived", "archived_at", "cover_image_url", "share_token", "notes"],
  users: ["id", "name", "email", "home_airport", "home_country", "passport_country", "avatar_url", "created_at", "has_paid"],
  wishlist_destinations: ["id", "user_id", "name", "location", "lat", "lng", "drive_hours", "budget", "best_time", "why", "source", "created_at", "climate"],
};

/**
 * The storage buckets that actually exist, from storage.buckets on 2026-09-07.
 * A `storage` call names one of these rather than a table, so the contract test
 * accepts them — and rejects anything else, which is how a bucket that was
 * never created gets noticed.
 */
export const BUCKETS = new Set(["card-attachments", "place-photos", "trip-covers"]);
