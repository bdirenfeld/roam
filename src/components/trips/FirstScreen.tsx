import { NewJourneyLink } from "@/components/overlays/AppOverlays";
import TripCard from "@/components/ui/TripCard";
import TripCover from "@/components/ui/TripCover";
import FirstJourneyVideo from "@/components/videos/FirstJourneyVideo";
import { createSampleJourney } from "@/lib/sampleTrip/actions";
import { SAMPLE_COVER, SAMPLE_DAYS, SAMPLE_DESTINATION, SAMPLE_NAME } from "@/lib/sampleTrip/itinerary";
import type { Trip } from "@/types/database";

// What someone sees until they have a journey of their own (24 Nov 2026, mock
// approved): plan one, or look around the example. The example is only built
// when it is tapped, so nobody is given a journey they didn't ask for; once
// built it is a normal card here (open, archive, delete). The Plan a journey
// form used to open itself over this screen and hid the example.
export default function FirstScreen({ sample, sampleHref, free }: { sample: Trip | null; sampleHref?: string; free: boolean }) {
  return (
    <div className="mb-8">
      <div className="grid gap-3.5 md:grid-cols-2 md:gap-7">
        <div className="rounded-2xl bg-white border-[1.5px] border-dashed border-gray-300 px-5 py-6 md:h-[260px] flex flex-col items-center justify-center text-center">
          <h2 className="text-[17px] font-semibold text-activity">Where are you going?</h2>
          {free && <p className="text-[14px] text-gray-600 mt-1">Your first journey is free.</p>}
          <NewJourneyLink className="mt-4 inline-flex items-center gap-2 bg-activity text-white text-[15px] font-semibold px-5 py-3 rounded-xl hover:opacity-90 active:scale-95 transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Plan a journey
          </NewJourneyLink>
        </div>

        {sample ? (
          <TripCard trip={sample} href={sampleHref} owner />
        ) : (
          <form action={createSampleJourney}>
            <button type="submit" className="relative block w-full text-left rounded-2xl overflow-hidden active:scale-[0.99] transition-transform" data-testid="sample-tile">
              <TripCover destination={SAMPLE_DESTINATION.name} coverImageUrl={SAMPLE_COVER} lat={SAMPLE_DESTINATION.lat} lng={SAMPLE_DESTINATION.lng} className="w-full h-[200px] md:h-[260px]" />
              <span aria-hidden className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ height: "62%", background: "linear-gradient(to top, rgba(12,12,20,0.82) 0%, rgba(12,12,20,0) 100%)" }} />
              <span className="absolute top-3 left-3 rounded-full bg-white px-3 py-1 text-[13px] font-semibold text-activity">Example</span>
              <span className="absolute inset-x-0 bottom-0 px-4 pb-3.5">
                <span className="block text-[19px] md:text-xl text-white leading-snug">{SAMPLE_NAME}</span>
                <span className="block text-[11px] tracking-widest uppercase mt-0.5" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {SAMPLE_DAYS.length} days · Look around
                </span>
              </span>
            </button>
          </form>
        )}
      </div>
      <div className="mt-6 flex justify-center">
        <FirstJourneyVideo fallback={false} />
      </div>
      <p className="mt-5 text-[13px] text-gray-600 text-center">Someone sent you a link? Open it to see their journey here.</p>
    </div>
  );
}
