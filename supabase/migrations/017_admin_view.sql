-- Admin view (17 Nov 2026, beta): Brennan can open one tester's journey, read
-- only, to help with a problem. Scoped twice: the signed-in user must be the
-- admin AND the request must name the journey in the x-roam-admin-trip header
-- (set by the app from the roam_admin_trip cookie, which only /admin/view sets).
-- SELECT only: no insert, update or delete policy is added, so nothing can be
-- changed. Attachments, documents, budgets and members are not opened.

create or replace function public.admin_view_trip_id() returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() = 'ece938aa-db7b-4436-bb59-442cc0dc5e10'::uuid
     and (current_setting('request.headers', true)::json ->> 'x-roam-admin-trip')
         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (current_setting('request.headers', true)::json ->> 'x-roam-admin-trip')::uuid
  end
$$;

create or replace function public.admin_view_place_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.place_id from cards c
  where c.trip_id = public.admin_view_trip_id() and c.place_id is not null
$$;

-- The journey list on /admin. Same admin check; returns nothing to anyone else.
create or replace function public.admin_journeys()
returns table (id uuid, title text, destination text, start_date date, end_date date, owner text, created_at timestamptz, planned bigint, saved bigint)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.destination, t.start_date, t.end_date,
         coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)) as owner,
         t.created_at,
         (select count(*) from cards c where c.trip_id = t.id and c.archived is not true and c.status = 'in_itinerary'),
         (select count(*) from cards c where c.trip_id = t.id and c.archived is not true and c.status = 'interested')
  from trips t join auth.users u on u.id = t.user_id
  where auth.uid() = 'ece938aa-db7b-4436-bb59-442cc0dc5e10'::uuid
  order by t.created_at desc
$$;

revoke all on function public.admin_journeys() from public, anon;
grant execute on function public.admin_journeys() to authenticated;
grant execute on function public.admin_view_trip_id() to authenticated;
grant execute on function public.admin_view_place_ids() to authenticated;

create policy admin_view_trips on public.trips for select to authenticated using (id = public.admin_view_trip_id());
create policy admin_view_days on public.days for select to authenticated using (trip_id = public.admin_view_trip_id());
create policy admin_view_cards on public.cards for select to authenticated using (trip_id = public.admin_view_trip_id());
create policy admin_view_places on public.places for select to authenticated using (id in (select public.admin_view_place_ids()));
create policy admin_view_trip_entry on public.trip_entry for select to authenticated using (trip_id = public.admin_view_trip_id());
