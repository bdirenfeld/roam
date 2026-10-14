'use client';
import { CaretRight, X } from '@phosphor-icons/react';
import Overlay from '@/components/ui/Overlay';
import { GROUPS, LIST_ORDER, TOURS, listMark, type TourId, type TourRecord } from '@/lib/onboarding/walkthroughs';

/** Section bands separate group labels from tappable walkthroughs on both devices. */
export default function WalkthroughLibrary({ tours, firstJourney, firstStep, computer, onFirstJourney, onPick, onResetAll, onClose }: {
  tours: TourRecord;
  firstJourney: 'new' | 'underway' | 'done';
  firstStep: string;
  computer: boolean;
  onFirstJourney: () => void;
  onPick: (id: TourId) => void;
  onResetAll: () => void;
  onClose: () => void;
}) {
  const ids = LIST_ORDER.filter(id => !TOURS[id].device || TOURS[id].device === (computer ? 'computer' : 'phone'));
  const row = (key: string, title: string, benefit: string, mark: string | null, onClick: () => void) => (
    <button key={key} type="button" onClick={onClick}
      className="flex min-h-[68px] w-full items-center justify-between gap-3 border-b border-activity/10 py-3 text-left transition-colors hover:bg-activity/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-activity">
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-5">{title}</span>
        <span className="mt-1 block text-[13px] leading-[1.4] text-activity/75">{benefit}</span>
      </span>
      <span className="flex flex-none items-center gap-2 text-activity/75">
        {mark === 'done' ? <span aria-label="Done" className="text-[13px]">✓</span> : mark ? <span className="text-[12px]" aria-label={`In progress: ${mark}`}>{mark}</span> : null}
        <CaretRight size={16} weight="light" aria-hidden="true" />
      </span>
    </button>
  );
  const heading = (text: string) => <h3 className="-mx-5 bg-[#E7E6E2] px-5 py-2 text-[11px] font-semibold uppercase leading-4 tracking-[0.1em] text-activity/80">{text}</h3>;
  return (
    <Overlay label="Walkthroughs" onClose={onClose} widthClassName="md:w-[420px]">
      <div className="flex flex-shrink-0 items-center justify-between bg-parchment px-5 pt-3 pb-3">
        <h2 className="font-display text-[23px] font-medium tracking-[-0.01em] text-activity">Walkthroughs</h2>
        <button type="button" aria-label="Close" className="-mr-2 grid h-11 w-11 place-items-center rounded-full hover:bg-activity/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-activity" onClick={onClose}><X size={16} weight="light" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto overflow-x-hidden bg-parchment px-5 pb-6 text-activity" data-testid="walkthrough-library">
        <section aria-label="Start here">
          {heading('Start here')}
          {row('first', 'Your first journey', 'Search, save a place, and put it on a day.', firstJourney === 'done' ? 'done' : firstJourney === 'underway' ? firstStep : null, onFirstJourney)}
        </section>
        {GROUPS.map(g => {
          const here = ids.filter(id => TOURS[id].group === g);
          return here.length > 0 && <section key={g} aria-label={g} className="mt-4">{heading(g)}{here.map(id => row(id, id === 'card' ? 'Place details' : id === 'notes' ? 'Notes & checklists' : TOURS[id].title, TOURS[id].benefit, listMark(id, tours[id]), () => onPick(id)))}</section>;
        })}
        <div className="pt-4 text-center">
          <button type="button" onClick={onResetAll} className="min-h-11 text-[13px] text-activity/75 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-activity">Show all again</button>
        </div>
      </div>
    </Overlay>
  );
}
