-- The To book checklist in Bookings (6 Oct 2026): the owner's own ticks, per row.
-- {"flights": "booked" | "skip", "stays": ..., "car": ...}. Missing = work it out from the days.
-- Row-level policies on trips already cover it (owner or cohost writes).
alter table public.trips add column if not exists booking_checklist jsonb not null default '{}'::jsonb;
