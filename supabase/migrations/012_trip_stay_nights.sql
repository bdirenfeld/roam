-- Nights per base, set by the owner, keyed by the base's label: {"Tokyo": 5, "Osaka": 8}.
-- The brief guesses the split from pin counts; this is the correction (15 Sept 2026).
alter table trips add column if not exists stay_nights jsonb;
