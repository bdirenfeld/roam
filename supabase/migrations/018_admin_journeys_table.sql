-- The admin table (17 Nov 2026): owner, guests, last activity and archived
-- for each journey. Same admin-only check as 017. "Last active" is the newest
-- of the journey's creation and its cards' creation / archiving (cards carry
-- no updated_at, so a move or an edit is not counted).
drop function if exists public.admin_journeys();
create function public.admin_journeys()
returns table (id uuid, title text, destination text, start_date date, end_date date, owner text, created_at timestamptz, planned bigint, saved bigint, guests bigint, last_active timestamptz, archived boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.destination, t.start_date, t.end_date,
         coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)) as owner,
         t.created_at,
         (select count(*) from cards c where c.trip_id = t.id and c.archived is not true and c.status = 'in_itinerary'),
         (select count(*) from cards c where c.trip_id = t.id and c.archived is not true and c.status = 'interested'),
         (select count(*) from trip_members m where m.trip_id = t.id),
         greatest(t.created_at, (select max(greatest(c.created_at, coalesce(c.archived_at, c.created_at))) from cards c where c.trip_id = t.id)),
         coalesce(t.archived, false)
  from trips t join auth.users u on u.id = t.user_id
  where auth.uid() = 'ece938aa-db7b-4436-bb59-442cc0dc5e10'::uuid
$$;
revoke all on function public.admin_journeys() from public, anon;
grant execute on function public.admin_journeys() to authenticated;
