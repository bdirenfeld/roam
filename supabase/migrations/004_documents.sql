-- ============================================================
-- DOCUMENTS — uploaded travel confirmations & their parsed data
-- ============================================================
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null references public.trips(id) on delete cascade,
  file_name     text not null,
  file_type     text not null,
  document_type text not null,   -- 'flight', 'hotel', 'restaurant', 'activity'
  parsed_data   jsonb not null default '[]',
  card_ids      uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);

alter table public.documents enable row level security;

create policy "Users can manage documents of own trips"
  on public.documents for all
  using (
    exists (
      select 1 from public.trips
      where trips.id = documents.trip_id
        and trips.user_id = auth.uid()
    )
  );

create index if not exists documents_trip_id_idx on public.documents(trip_id);
