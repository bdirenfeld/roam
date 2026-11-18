-- Admin edit (18 Nov 2026, beta): Brennan can change a tester's plan to show
-- them how, not only read it. Same double scope as 017: the admin account AND
-- the x-roam-admin-trip header naming the journey (admin_view_trip_id()).
-- Opens the plan only: days and cards (add, change, remove), the journey row
-- (dates, name), the places on its cards, and the entry line. Budgets,
-- documents, attachments, members and invites stay closed.

create policy admin_edit_cards_ins on public.cards for insert to authenticated with check (trip_id = public.admin_view_trip_id());
create policy admin_edit_cards_upd on public.cards for update to authenticated using (trip_id = public.admin_view_trip_id()) with check (trip_id = public.admin_view_trip_id());
create policy admin_edit_cards_del on public.cards for delete to authenticated using (trip_id = public.admin_view_trip_id());
create policy admin_edit_days_ins on public.days for insert to authenticated with check (trip_id = public.admin_view_trip_id());
create policy admin_edit_days_upd on public.days for update to authenticated using (trip_id = public.admin_view_trip_id()) with check (trip_id = public.admin_view_trip_id());
create policy admin_edit_days_del on public.days for delete to authenticated using (trip_id = public.admin_view_trip_id());
create policy admin_edit_trips_upd on public.trips for update to authenticated using (id = public.admin_view_trip_id()) with check (id = public.admin_view_trip_id());
create policy admin_edit_places_upd on public.places for update to authenticated using (id in (select public.admin_view_place_ids())) with check (id in (select public.admin_view_place_ids()));
create policy admin_edit_trip_entry_upd on public.trip_entry for update to authenticated using (trip_id = public.admin_view_trip_id());

-- A place the admin adds is a places row owned by the admin (bulk-import writes
-- user_id = the caller), and places_owner_all would hide it from the journey's
-- owner: their card would show with no place. So a journey's owner reads every
-- place its cards point at, whoever saved it.
create or replace function public.my_trip_place_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.place_id from cards c join trips t on t.id = c.trip_id
  where t.user_id = auth.uid() and c.place_id is not null
$$;
revoke all on function public.my_trip_place_ids() from public, anon;
grant execute on function public.my_trip_place_ids() to authenticated;
create policy owner_view_trip_places on public.places for select to authenticated using (id in (select public.my_trip_place_ids()));
