-- Help threads (24 Nov 2026, his ruling after trying it): one conversation per
-- JOURNEY, plus one outside any journey. It was one per person, so a note about
-- Paris showed in every journey's Help. A deleted journey's thread falls back to
-- the general one (set null), so nothing a person wrote is lost.
alter table public.help_messages add column if not exists trip_id uuid references public.trips(id) on delete set null;
update public.help_messages m set trip_id = (m.context->>'trip_id')::uuid
 where m.trip_id is null and (m.context->>'trip_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and exists (select 1 from public.trips t where t.id = (m.context->>'trip_id')::uuid);
create index if not exists help_messages_thread_idx on public.help_messages (user_id, trip_id, created_at);
