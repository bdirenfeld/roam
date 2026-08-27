"use client";

// The real route. Every in-app "+" now opens the same form in an overlay
// instead (see components/overlays/AppOverlays.tsx), but this page must keep
// working on its own: a bookmark, a shared link, and a ctrl/cmd-click on any
// of those triggers all land here, deep-link params and all.

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import NewJourneyForm from "@/components/trip/NewJourneyForm";
import { parseNewJourneySeed } from "@/lib/newJourneySeed";

function NewJourneyPageBody() {
  const searchParams = useSearchParams();
  // ?start=&end=&destName=&destLat=&destLng=(&destLoc=) — parsed and validated
  // in one place, shared with the overlay.
  const seed = useMemo(() => parseNewJourneySeed(searchParams), [searchParams]);
  return <NewJourneyForm seed={seed} variant="page" />;
}

// useSearchParams requires a Suspense boundary on a statically prerendered
// page (Next 14).
export default function NewTripPage() {
  return (
    <Suspense fallback={null}>
      <NewJourneyPageBody />
    </Suspense>
  );
}
