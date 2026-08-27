-- Named lists on the Plan board — the traveller's own columns ("Research",
-- "Prep", "Logistics"), replacing the single app-named "Parked" column.
-- Already applied to the live project; recorded here so the file tree and the
-- database agree.

CREATE TABLE IF NOT EXISTS public.trip_lists (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title      text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_lists_trip_id_idx ON public.trip_lists (trip_id, position);

-- Membership. ON DELETE SET NULL: deleting a list must never delete its cards —
-- they stay in the journey as saved places.
ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS list_id uuid REFERENCES public.trip_lists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS cards_list_id_idx ON public.cards (list_id);

-- RLS scoped through the parent trip, owner-only — the Plan board is not shared
-- with guests, so a list is visible to exactly the person whose trip it is.
ALTER TABLE public.trip_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_lists_select_own ON public.trip_lists FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));

CREATE POLICY trip_lists_insert_own ON public.trip_lists FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));

CREATE POLICY trip_lists_update_own ON public.trip_lists FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));

CREATE POLICY trip_lists_delete_own ON public.trip_lists FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));
