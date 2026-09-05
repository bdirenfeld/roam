-- Entry requirements per journey: what the travellers' passports need to get
-- into the destination country, looked up from the Government of Canada
-- travel advice page and kept with its source and check date. One row per
-- journey. Brennan, Sep 2026: "I thought I didn't need one going to Costa
-- Rica from Toronto, but I did and it almost screwed us."

CREATE TABLE IF NOT EXISTS public.trip_entry (
  trip_id     uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,
  -- Passports held by the party, as nationalities ("Canadian", "Indian").
  passports   text[] NOT NULL DEFAULT '{Canadian}',
  -- The lookup's answer: { country, status, lines[], source_url, source_name,
  -- checked_at, next_check }. Shape in src/lib/entry/types.ts.
  data        jsonb,
  -- Set when a recheck found the answer changed; cleared when the owner reads it.
  changed     boolean NOT NULL DEFAULT false,
  checked_at  timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_entry ENABLE ROW LEVEL SECURITY;

-- Owner reads and writes. Guests read: the requirement applies to them too.
CREATE POLICY trip_entry_select ON public.trip_entry FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.trip_members m WHERE m.trip_id = trip_entry.trip_id AND m.user_id = auth.uid())
  );

CREATE POLICY trip_entry_insert_own ON public.trip_entry FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));

CREATE POLICY trip_entry_update_own ON public.trip_entry FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));

CREATE POLICY trip_entry_delete_own ON public.trip_entry FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.user_id = auth.uid()));
