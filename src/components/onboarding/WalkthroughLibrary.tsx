'use client';
import { CaretRight, X } from '@phosphor-icons/react';
import Overlay from '@/components/ui/Overlay';
import { GROUPS, TOURS, TOUR_IDS, statusLine, type TourId, type TourRecord } from '@/lib/onboarding/walkthroughs';

/**
 * ⋯ → Walkthrough (14 Oct 2026): every walkthrough in one list, grouped, each
 * saying where it stands, so "which one do I restart?" is answered by looking.
 * The tile stays one tile (13 Oct ruling: no walkthrough rows in the menu
 * grid); the list is its own sheet. Groups and benefit lines from ChatGPT's
 * review build. "Show all again" lives here and only here.
 */
export default function WalkthroughLibrary({ tours, firstJourney, computer, onFirstJourney, onPick, onResetAll, onClose }: {
  tours: TourRecord;
  /** The first journey's line: its benefit, or Continue / Done. */
  firstJourney: string;
  computer: boolean;
  onFirstJourney: () => void;
  onPick: (id: TourId) => void;
  onResetAll: () => void;
  onClose: () => void;
}) {
  const row = (key: string, title: string, line: string, onClick: () => void) => (
    <button key={key} type="button" onClick={onClick} className="flex min-h-[60px] w-full items-center justify-between gap-3 border-t border-activity/10 py-2.5 text-left">
      <span className="min-w-0"><span className="block text-[14.5px] font-medium">{title}</span><span className="block text-[12.5px] text-activity/60">{line}</span></span>
      <CaretRight size={16} weight="light" className="flex-none" />
    </button>
  );
  const heading = (text: string) => <p className="mt-4 mb-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-activity/45">{text}</p>;
  return (
    <Overlay label="Walkthroughs" onClose={onClose} widthClassName="md:w-[420px]">
      <div className="flex items-center justify-between px-5 pt-3 pb-1">
        <h2 className="font-display text-[23px] font-medium tracking-[-0.01em] text-activity">Walkthroughs</h2>
        <button type="button" aria-label="Close" className="grid h-11 w-11 -mr-2 place-items-center rounded-full hover:bg-activity/5" onClick={onClose}><X size={16} weight="light" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto px-5 pb-6 text-activity" data-testid="walkthrough-library">
        {heading('Start here')}
        {row('first', 'Your first journey', firstJourney, onFirstJourney)}
        {GROUPS.map(g => {
          const ids = TOUR_IDS.filter(id => TOURS[id].group === g && (!TOURS[id].device || TOURS[id].device === (computer ? "computer" : "phone")));
          return ids.length > 0 && <div key={g}>{heading(g)}{ids.map(id => row(id, TOURS[id].title, statusLine(id, tours[id]), () => onPick(id)))}</div>;
        })}
        <div className="border-t border-activity/10 pt-4 text-center">
          <button type="button" onClick={onResetAll} className="min-h-10 text-[13px] text-activity/60 underline underline-offset-4">Show all again</button>
        </div>
      </div>
    </Overlay>
  );
}
