-- ============================================================
-- WHERE TO STAY — the brief a search ran on, and its candidates
-- ============================================================
-- One brief per journey (the last run), many candidates. A candidate is a
-- place the search proposed, a stay the person saved, or the one they chose.
-- Saving turns it into an ordinary saved place (place_id); choosing writes
-- the check-in/check-out cards, trips.accommodation_* and the Estimate's
-- nightly rate. "rejected" keeps the reason so the next run can learn.

create table if not exists public.stay_briefs (
  trip_id     uuid primary key references public.trips(id) on delete cascade,
  user_id     uuid not null,
  ran_at      timestamptz not null default now(),
  brief       jsonb not null default '{}',   -- StayBrief as computed
  area_text   text,                          -- "South of Lucca, toward Pisa. …"
  split_text  text                           -- "Two nights in Florence would save 2 h 20"
);

alter table public.stay_briefs enable row level security;

create policy "Users can manage stay briefs of own trips"
  on public.stay_briefs for all
  using (
    exists (
      select 1 from public.trips
      where trips.id = stay_briefs.trip_id
        and trips.user_id = auth.uid()
    )
  );

create table if not exists public.stay_candidates (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  user_id       uuid not null,
  place_id      uuid references public.places(id) on delete set null,
  letter        text,                        -- A, B, C … on the map
  name          text not null,
  address       text,
  lat           double precision,
  lng           double precision,
  site          text,                        -- vrbo | airbnb | booking | google | expedia | direct
  url           text,
  total         numeric,                     -- for the journey's dates, in `currency`
  currency      text,
  nightly_cad   numeric,
  beds          integer,
  baths         numeric,
  sleeps        integer,
  pool          boolean,
  ac            boolean,
  score         numeric,
  score_scale   integer,                     -- 5 or 10, from the site
  reviews       integer,
  review_notes  text,                        -- "quiet, steep last 200 m, mosquitoes at dusk"
  fit_text      text,                        -- "4 kings + a twin · 3 baths · one room spare"
  flags         text[] not null default '{}',-- "All bedrooms upstairs", "No AC"
  drive         jsonb not null default '{}', -- { hours, line, minutes: { label: n } }
  status        text not null default 'candidate', -- candidate | saved | chosen | rejected
  reject_reason text,                        -- too_far | too_dear | not_our_look | doesnt_fit
  source        text not null default 'google', -- saved | google | search
  google_place_id text,                    -- when the candidate came from Google, so Save can dedupe
  created_at    timestamptz not null default now()
);

alter table public.stay_candidates enable row level security;

create policy "Users can manage stay candidates of own trips"
  on public.stay_candidates for all
  using (
    exists (
      select 1 from public.trips
      where trips.id = stay_candidates.trip_id
        and trips.user_id = auth.uid()
    )
  );

create index if not exists stay_candidates_trip_id_idx on public.stay_candidates(trip_id);

-- 9 Sept 2026, from his phone: photos took too long to appear (a details call
-- and eight redirects at tap time), so the search resolves the first few photo
-- URLs when it runs; and a thumbs-up/down the next run learns from.
alter table public.stay_candidates
  add column if not exists photos text[] not null default '{}',
  add column if not exists feel text;                 -- up | down
