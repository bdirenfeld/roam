-- ============================================================
-- Roam — Database Schema
-- Migration 001: Initial schema
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
create table if not exists public.users (
  id              uuid primary key default gen_random_uuid(),
  name            text,
  email           text unique not null,
  home_airport    text,
  home_country    text,
  passport_country text,
  avatar_url      text,
  created_at      timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view own profile"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.users for insert
  with check (auth.uid() = id);

-- ============================================================
-- TRIPS
-- ============================================================
create table if not exists public.trips (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references public.users(id) on delete cascade,
  title                   text not null,
  destination             text not null,
  destination_lat         float,
  destination_lng         float,
  start_date              date not null,
  end_date                date not null,
  trip_purpose            text,
  trip_type               text,
  party_size              integer default 1,
  party_ages              integer[],
  accommodation_name      text,
  accommodation_address   text,
  status                  text not null default 'planning'
                            check (status in ('planning', 'active', 'completed')),
  cover_image_url         text,
  created_at              timestamptz not null default now()
);

alter table public.trips enable row level security;

create policy "Users can manage own trips"
  on public.trips for all
  using (auth.uid() = user_id);

-- ============================================================
-- DAYS
-- ============================================================
create table if not exists public.days (
  id                  uuid primary key default gen_random_uuid(),
  trip_id             uuid not null references public.trips(id) on delete cascade,
  date                date not null,
  day_number          integer not null,
  day_name            text,
  narrative_position  text,
  theme               text,
  created_at          timestamptz not null default now(),
  unique (trip_id, date)
);

alter table public.days enable row level security;

create policy "Users can manage days of own trips"
  on public.days for all
  using (
    exists (
      select 1 from public.trips
      where trips.id = days.trip_id
        and trips.user_id = auth.uid()
    )
  );

-- ============================================================
-- CARDS
-- ============================================================
create table if not exists public.cards (
  id              uuid primary key default gen_random_uuid(),
  day_id          uuid not null references public.days(id) on delete cascade,
  trip_id         uuid not null references public.trips(id) on delete cascade,
  type            text not null check (type in ('logistics', 'activity', 'food')),
  sub_type        text,
  title           text not null,
  start_time      time,
  end_time        time,
  position        integer not null default 0,
  status          text not null default 'in_itinerary'
                    check (status in ('interested', 'on_map', 'in_itinerary', 'cut')),
  source_url      text,
  cover_image_url text,
  lat             float,
  lng             float,
  address         text,
  details         jsonb default '{}',
  ai_generated    boolean default false,
  created_at      timestamptz not null default now()
);

alter table public.cards enable row level security;

create policy "Users can manage cards of own trips"
  on public.cards for all
  using (
    exists (
      select 1 from public.trips
      where trips.id = cards.trip_id
        and trips.user_id = auth.uid()
    )
  );

-- Indexes for common query patterns
create index if not exists cards_day_id_idx     on public.cards(day_id);
create index if not exists cards_trip_id_idx    on public.cards(trip_id);
create index if not exists cards_position_idx   on public.cards(day_id, position);
create index if not exists days_trip_id_idx     on public.days(trip_id);
create index if not exists days_date_idx        on public.days(trip_id, date);
create index if not exists trips_user_id_idx    on public.trips(user_id);
