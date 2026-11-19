-- Home, for the drive to and from the airport (19 Nov 2026, Brennan approved the mock).
-- "Leave home 3:30 PM" and "Home around 5:35 PM" on the flight that leaves from or
-- lands at the home airport. Private: users rows are readable only by their owner
-- (RLS "Users can view their own profile"), so a guest on a shared journey never sees it.
alter table public.users
  add column if not exists home_address text,
  add column if not exists home_lat double precision,
  add column if not exists home_lng double precision;
