-- The paywall (24 Nov 2026): the first journey is free, a one-time payment
-- unlocks the rest. Enforced here so a client that skips the app's own check
-- still cannot create a second journey. Mirrors src/lib/paywall/allowance.ts
-- (FREE_JOURNEYS, PAYMENT_REQUIRED, SAMPLE_TITLE) — allowance.test.ts reads
-- this file and fails if the two drift.
--
-- Counted: journeys the person owns (trips.user_id), archived included, the
-- onboarding sample excluded. Joining someone else's journey as a guest never
-- counts. The service role (admin tools, server copies) is not limited.
create or replace function public.enforce_journey_allowance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  paid boolean;
  owned integer;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if new.title = 'Sample trip — look around' then
    return new;
  end if;

  select coalesce(u.has_paid, false) into paid from public.users u where u.id = new.user_id;
  if coalesce(paid, false) then
    return new;
  end if;

  select count(*) into owned
    from public.trips t
   where t.user_id = new.user_id
     and t.title is distinct from 'Sample trip — look around';

  if owned >= 1 then
    raise exception 'PAYMENT_REQUIRED: the first journey is free; unlock more at /checkout'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trips_enforce_journey_allowance on public.trips;
create trigger trips_enforce_journey_allowance
  before insert on public.trips
  for each row execute function public.enforce_journey_allowance();
