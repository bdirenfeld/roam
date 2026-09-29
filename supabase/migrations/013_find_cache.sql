-- Find (29 Sep 2026): results shared across users for 30 days, keyed by
-- lib/find/ask cacheKey. Public place data only; what is already on a
-- journey is filtered per request. Written and read only by /api/find
-- through the service role. No policies: nobody signed in can read or
-- poison it directly.
create table if not exists public.find_cache (
  key text primary key,
  results jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.find_cache enable row level security;
