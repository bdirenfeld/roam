'use client';
import { X } from '@phosphor-icons/react';
import Overlay from '@/components/ui/Overlay';
import { GROUPS, LIST_ORDER, TOURS, listMark, listProgress, type TourId, type TourRecord } from '@/lib/onboarding/walkthroughs';

const SIENNA = '#B0541F';
const GREEN = '#3B6D11';

/**
 * ⋯ → Walkthrough (14 Oct 2026): every walkthrough in one list, so "which one
 * do I restart?" is answered by looking. The tile stays one tile (13 Oct
 * ruling: no walkthrough rows in the menu grid); the list is its own sheet.
 *
 * Shape from his yes to the Now/Proposed mock the same day: three groups in
 * trip order (Start here, Planning the trip, On the trip); every row keeps its
 * benefit line and wears its state as a mark on the right (✓, "2 of 3", or
 * nothing); "6 of 10 done" under the title; the next one worth doing tinted
 * with "Next up". "Show all again" lives here and only here.
 */
export default function WalkthroughLibrary({ tours, firstJourney, firstStep, computer, onFirstJourney, onPick, onResetAll, onClose }: {
  tours: TourRecord;
  firstJourney: 'new' | 'underway' | 'done';
  /** "1 of 3" while the first journey is under way. */
  firstStep: string;
  computer: boolean;
  onFirstJourney: () => void;
  onPick: (id: TourId) => void;
  onResetAll: () => void;
  onClose: () => void;
}) {
  const ids = LIST_ORDER.filter(id => !TOURS[id].device || TOURS[id].device === (computer ? 'computer' : 'phone'));
  const { done, total, next } = listProgress(ids, tours, firstJourney);
  const mark = (m: string | null) => m === 'done'
    ? <span aria-label="Done" className="flex-none text-[15px] font-bold" style={{ color: GREEN }}>✓</span>
    : m ? <span className="flex-none text-[12.5px]" style={{ color: SIENNA }}>{m}</span> : null;
  const row = (key: string, title: string, benefit: string, m: string | null, isNext: boolean, onClick: () => void) => (
    <button key={key} type="button" onClick={onClick} data-next={isNext || undefined}
      className="flex min-h-[60px] w-full items-center justify-between gap-3 border-t border-activity/10 py-2.5 text-left"
      style={isNext ? { background: '#FBF3EC', marginInline: -20, paddingInline: 20, width: 'calc(100% + 40px)' } : undefined}>
      <span className="min-w-0">
        {isNext && <span className="block text-[11.5px] font-semibold" style={{ color: SIENNA }}>Next up</span>}
        <span className="block text-[14.5px] font-medium">{title}</span>
        <span className="block text-[12.5px] text-activity/60">{benefit}</span>
      </span>
      {mark(m)}
    </button>
  );
  const heading = (text: string) => <p className="mt-4 mb-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-activity/45">{text}</p>;
  return (
    <Overlay label="Walkthroughs" onClose={onClose} widthClassName="md:w-[420px]">
      <div className="flex items-start justify-between px-5 pt-3 pb-1">
        <div>
          <h2 className="font-display text-[23px] font-medium tracking-[-0.01em] text-activity">Walkthroughs</h2>
          <p className="text-[12.5px] text-activity/60" data-testid="walkthrough-progress">{done} of {total} done</p>
        </div>
        <button type="button" aria-label="Close" className="grid h-11 w-11 -mr-2 place-items-center rounded-full hover:bg-activity/5" onClick={onClose}><X size={16} weight="light" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto overflow-x-hidden px-5 pb-6 text-activity" data-testid="walkthrough-library">
        {heading('Start here')}
        {row('first', 'Your first journey', 'Search, save a place, and put it on a day.', firstJourney === 'done' ? 'done' : firstJourney === 'underway' ? firstStep : null, next === 'first', onFirstJourney)}
        {GROUPS.map(g => {
          const here = ids.filter(id => TOURS[id].group === g);
          return here.length > 0 && <div key={g}>{heading(g)}{here.map(id => row(id, TOURS[id].title, TOURS[id].benefit, listMark(id, tours[id]), next === id, () => onPick(id)))}</div>;
        })}
        <div className="border-t border-activity/10 pt-4 text-center">
          <button type="button" onClick={onResetAll} className="min-h-10 text-[13px] text-activity/60 underline underline-offset-4">Show all again</button>
        </div>
      </div>
    </Overlay>
  );
}
