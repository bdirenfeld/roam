-- Part 1: Remove test cards
DELETE FROM public.cards
WHERE title ILIKE 'TEST %'
   OR title = 'test'
   OR title = 'Test';

-- Part 2: Null out lat/lng on generic non-place cards
-- These cards have approximate coordinates but are not real pinnable places.
UPDATE public.cards
SET lat = NULL, lng = NULL
WHERE title IN (
  'Afternoon Wandering',
  'Night Walk',
  'Aperitivo',
  'Dinner',
  'Dinner — Arrival Night',
  'Dinner — Historic Center',
  'Run + Morning Coffee'
);
