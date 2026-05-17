# RLS Audit — Pre-Lockdown

Audit of every Supabase client instantiation in the Roam codebase and every caller that reads or writes the 5 tables targeted for RLS lockdown: `users`, `trips`, `cards`, `days`, `documents`. The reference table is `card_attachments`, which already has RLS enabled and working.

`auth.users` (Supabase's managed table) is out of scope — only `public.users` is in scope.

## Summary

- Total Supabase client instantiation helpers: **3** (`lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/middleware.ts`)
- Direct (non-helper) instantiation sites: **0**
- Files touching the 5 target tables: **35**
- Safe under RLS: **35**
- Will break under RLS: **0**
- Needs service role: **0**
- `SUPABASE_SERVICE_ROLE_KEY` references in the codebase: **0**

Every call today rides on `NEXT_PUBLIC_SUPABASE_ANON_KEY` plus a user session (SSR cookies on the server, browser session on the client). There is no admin escape hatch in the code today.

## Client instantiation helpers

| Helper | Library | Key | Auth context |
|---|---|---|---|
| `src/lib/supabase/server.ts` | `@supabase/ssr` `createServerClient` | anon | Server-with-session (Next `cookies()`) |
| `src/lib/supabase/client.ts` | `@supabase/ssr` `createBrowserClient` | anon | Browser session |
| `src/lib/supabase/middleware.ts` | `@supabase/ssr` `createServerClient` | anon | Request middleware — refreshes JWT, no table I/O |

## Findings

Rows grouped by risk level. All paths today classify as **safe** because every one of them runs under the user's session and reads/writes only data the user is entitled to. The "will break" and "needs service role" sections are intentionally empty — see Notes for caveats on the orphan server routes.

### Safe under RLS

| File | Client type | Tables touched | Operation | Auth context | RLS risk |
|---|---|---|---|---|---|
| `src/app/(app)/trips/page.tsx` | SSR | users, trips, days | select | SSR session | safe |
| `src/app/(app)/trips/[tripId]/page.tsx` | SSR | days | select | SSR session | safe |
| `src/app/(app)/trips/[tripId]/plan/page.tsx` | SSR | trips, days, cards | select | SSR session | safe |
| `src/app/(app)/trips/[tripId]/map/page.tsx` | SSR | trips, days, cards, users | select | SSR session | safe |
| `src/app/(app)/trips/[tripId]/days/[dayId]/page.tsx` | SSR | trips, days, cards | select | SSR session | safe |
| `src/app/(app)/trips/[tripId]/settings/page.tsx` | SSR | trips, days | select | SSR session | safe |
| `src/app/(app)/map/page.tsx` | SSR | trips | select | SSR session | safe |
| `src/app/(app)/past-journeys/page.tsx` | SSR | trips | select | SSR session | safe |
| `src/app/(app)/profile/page.tsx` | SSR | users | select | SSR session | safe |
| `src/app/auth/callback/route.ts` | SSR | users | upsert (L39) | SSR session, established L30 by `exchangeCodeForSession` | safe |
| `src/app/api/trips/fetch-cover/route.ts` | SSR | trips | select; (→ `lib/unsplash.ts` trips:update) | SSR session, called from `trips/new/page.tsx` | safe |
| `src/app/api/places/enrich-trip/route.ts` | SSR | cards | select, update | SSR session, called from `MapSidebar.tsx` | safe (see Notes) |
| `src/app/api/trips/backfill-covers/route.ts` | SSR | trips | select, update | SSR session, no UI caller, no auth gate | safe (see Notes) |
| `src/app/api/cards/backfill-titles/route.ts` | SSR | cards | select, update | SSR session, no UI caller, no auth gate | safe (see Notes) |
| `src/app/api/places/backfill-food/route.ts` | SSR | cards | select, update (hard-coded `ROME_TRIP_ID`) | SSR session, no UI caller, no auth gate | safe (see Notes) |
| `src/lib/unsplash.ts` | inherits caller's client | trips | update | inherits caller's session | safe |
| `src/app/(app)/trips/new/page.tsx` | Browser (client page) | trips, days | insert | browser session | safe |
| `src/components/plan/CreateCardSheet.tsx` | Browser | cards | insert | browser session | safe |
| `src/components/plan/NoteCardSheet.tsx` | Browser | cards | insert | browser session | safe |
| `src/components/plan/LinkPlaceSheet.tsx` | Browser | cards | select | browser session | safe |
| `src/components/plan/DocumentsSheet.tsx` | Browser | documents | select, delete | browser session | safe |
| `src/components/plan/ConfirmationPreviewSheet.tsx` | Browser | cards, documents | cards:select/delete/insert, documents:insert | browser session | safe |
| `src/components/plan/TriageView.tsx` | Browser | cards | select, update×2 | browser session | safe |
| `src/components/plan/PlanBoard.tsx` | Browser | cards, trips | cards:update/delete/insert×2, trips:update | browser session | safe |
| `src/components/cards/CardBottomSheet.tsx` | Browser | cards | select×4, update, delete | browser session | safe |
| `src/components/cards/AttachmentsPanel.tsx` | Browser | cards | select | browser session | safe |
| `src/components/map/AddToTripSheet.tsx` | Browser | cards | select, insert | browser session | safe |
| `src/components/map/MapPinPopup.tsx` | Browser | cards | select, update, delete | browser session | safe |
| `src/components/map/MapSidebar.tsx` | Browser | cards | delete | browser session | safe |
| `src/components/profile/ProfileClient.tsx` | Browser | users | update | browser session | safe |
| `src/components/trip/TripSettingsClient.tsx` | Browser | trips, days, cards | trips:update×2/delete, days:update/insert/delete×2, cards:select/delete | browser session | safe |
| `src/components/trip/PastJourneysClient.tsx` | Browser | trips, cards, days | trips:update/delete, cards:delete, days:delete | browser session | safe |
| `src/components/ui/TripCoverEditModal.tsx` | Browser | trips | update | browser session | safe |
| `src/components/day/DayViewClient.tsx` | Browser | cards | update | browser session | safe |

### Will break under RLS

_None._

### Needs service role

_None today._ See Notes for routes that may need to be moved here during lockdown.

### No table I/O (listed for completeness)

| File | Notes |
|---|---|
| `src/app/login/page.tsx` | Auth UI only, no table reads/writes |
| `src/lib/auth-actions.ts` | `signInWithGoogle` / `signOut` — auth only |
| `src/middleware.ts` → `src/lib/supabase/middleware.ts` | Calls `supabase.auth.getUser()` to refresh the JWT. No reads or writes against any of the 5 target tables |
| `src/app/api/attachments/upload/route.ts` | Touches only `card_attachments` (out of scope; already RLS-protected) |
| `src/app/api/confirmations/parse/route.ts` | Calls Anthropic only; returns JSON to the client. Does **not** touch Supabase. The downstream writes happen in `ConfirmationPreviewSheet.tsx` |

## Notes

1. **No service-role key in the codebase.** `SUPABASE_SERVICE_ROLE_KEY` is not referenced anywhere. Every write path today is fully governed by the user's session. After RLS is enabled there will be no admin escape hatch — any cross-user operation introduced later must consciously add service-role.

2. **Orphan server routes — `/api/trips/backfill-covers`, `/api/cards/backfill-titles`, `/api/places/backfill-food`, `/api/places/enrich-trip` (and to a lesser extent `/api/trips/fetch-cover`).** None of these have an auth gate. The three `backfill-*` routes have no UI caller at all and their names (and the hard-coded `ROME_TRIP_ID` in `backfill-food`) suggest they were written as cross-user admin/migration jobs. `enrich-trip` is currently called from `MapSidebar.tsx` but still has no auth check in the handler. Today they rely on whoever happens to be logged in. Under RLS they will not error — they will silently scope every read and write to the caller's own data, which means a cross-user backfill (the apparent original intent) becomes impossible without anyone noticing. The lockdown prompt must make a per-route decision: **(a)** keep self-scoped and add an explicit auth gate, **(b)** move to the service-role key and add admin gating, or **(c)** delete as obsolete dev scaffolding.

3. **`auth/callback`'s `users` upsert sequencing.** The SSR client is created on L29; `exchangeCodeForSession(code)` runs on L30 and establishes the session cookies on the same client instance; the `users` upsert runs on L39 — i.e. **after** the session exists. So at the moment of the upsert, `auth.uid() = data.user.id`. RLS policies on `public.users` must permit both `INSERT` and `UPDATE` where `auth.uid() = id`, since this is the first write a brand-new user ever makes.

4. **`lib/unsplash.ts` is a helper, not a client.** It accepts a `SupabaseClient` parameter and writes via the passed-in client, so it inherits whatever auth context the caller already has. With RLS enabled, its `trips.update` will be permitted iff the caller's session owns the trip.

5. **Middleware does no table I/O.** `src/middleware.ts` → `lib/supabase/middleware.ts` calls only `supabase.auth.getUser()` to refresh the JWT and decide whether to redirect to `/login`. It is not a write path against any of the 5 target tables, so it has no direct RLS exposure.

6. **`confirmations/parse` is not a Supabase route.** The prompt flagged it as a likely "will break" candidate, but it never touches Supabase — it parses with Anthropic and returns the JSON to the client. The actual `cards` + `documents` writes happen in `ConfirmationPreviewSheet.tsx` under the user's browser session, which is safe.

7. **`card_attachments` is the reference.** It is already under RLS and working with the same anon-key + session pattern used everywhere else. Treat its policies as the model when writing policies for the 5 target tables.

## Things to confirm manually

- Whether the three orphan `backfill-*` routes should be kept, moved to service-role, or deleted (see Note 2).
- Whether `enrich-trip` and `fetch-cover` should grow an auth gate now (they're effectively safe today only because middleware blocks unauthenticated requests; the route handlers themselves don't check).
- Whether the `users` table needs `SELECT` policies broad enough to support the `users:select` reads in `trips/page.tsx` and `trips/[tripId]/map/page.tsx` (these likely read collaborator/owner display info — confirm what they need before locking the policy down to `auth.uid() = id`).
