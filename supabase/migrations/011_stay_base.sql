-- Which base a candidate belongs to on a multi-base journey.
-- Japan needs two places to sleep (Tokyo 8 nights, Osaka 5), so the five rows
-- are per base and the sheet switches between them. 0 is the first base, and
-- every existing row is a single-base journey, so 0 is the right default.
alter table public.stay_candidates
  add column if not exists base smallint not null default 0;

comment on column public.stay_candidates.base is
  'Index into stay_briefs.brief.bases: which home base these five belong to.';

create index if not exists stay_candidates_trip_base_idx
  on public.stay_candidates (trip_id, base);
