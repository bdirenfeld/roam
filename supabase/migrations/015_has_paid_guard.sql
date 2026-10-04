-- Only the server (service role, i.e. the Stripe webhook) may set has_paid
-- (4 Oct 2026). The users UPDATE/INSERT policies let a signed-in person write
-- their own row, which included has_paid. A person's own writes now keep the
-- old value (or false for a new row); the service role is untouched.
create or replace function public.guard_has_paid()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.has_paid := false;
    else
      new.has_paid := old.has_paid;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_has_paid on public.users;
create trigger users_guard_has_paid
  before insert or update on public.users
  for each row execute function public.guard_has_paid();
