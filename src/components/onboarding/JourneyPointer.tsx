'use client';
import { useEffect, useRef, useState } from 'react';
import type { GuidanceScreen } from './JourneyGuidanceContext';
import { mapHint, stepLabel, type Step } from './progress';
type Rect = { x: number; y: number; width: number; height: number };
const visible = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
};
function rectangle(el: Element | null | undefined): Rect | null {
  if (!el || !visible(el)) return null;
  const { x, y, width, height } = el.getBoundingClientRect();
  return { x, y, width, height };
}
export default function JourneyPointer({ screen, step, replay, onSkip, onNext }: {
  screen: GuidanceScreen; step: Step; replay: boolean; onSkip: () => void; onNext: () => void;
}) {
  const [target, setTarget] = useState<Rect | null>(null);
  const [searchRect, setSearchRect] = useState<Rect | null>(null);
  const [copy, setCopy] = useState('');
  const [tipHeight, setTipHeight] = useState(110);
  const tip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const measure = () => {
      const find = (selector: string) => Array.from(document.querySelectorAll(selector)).find(visible);
      const search = find('input[placeholder^="Search places"]');
      const button = (label: string) => Array.from(document.querySelectorAll('button')).find(el => (el.getAttribute('aria-label') ?? el.textContent?.trim()) === label && visible(el));
      if (document.activeElement === search || find('[role=dialog], [role=menu], [data-testid=sheet-close-target], [aria-label="Put it on a day"]')) {
        setTarget(null); setSearchRect(null); return;
      }
      let anchor: Element | undefined;
      let text = '';
      if (step === 'find') {
        anchor = button('Find places') ?? search;
        text = 'Somewhere in mind? Search above. Looking for ideas? Try Find places.';
      } else if (step === 'plan') {
        anchor = button('Plan my trip');
        text = replay ? 'Plan my trip puts your saved places onto days. You can adjust the plan afterwards.' : 'Place saved. Let’s put it on a day.';
      } else {
        const planned = screen.cards.filter(c => !(c as typeof c & { archived?: boolean }).archived && c.day_id && c.status === 'in_itinerary' && ['activity', 'food'].includes(c.place?.type ?? ''));
        anchor = Array.from(document.querySelectorAll('[data-card-id]')).find(el => planned.some(c => c.id === el.getAttribute('data-card-id')) && visible(el));
        text = 'Your day is taking shape. Open this card to see the details.';
        if (!anchor) {
          anchor = Array.from(document.querySelectorAll('.mapboxgl-marker [title]')).find(el => planned.some(c => c.place?.title === el.getAttribute('title')) && visible(el))?.closest('.mapboxgl-marker') ?? undefined;
          text = 'Your place is on the map. Open this pin to see the details.';
        }
        if (!anchor) {
          anchor = search;
          text = 'Open a saved place on the map or in your agenda to see its details.';
        }
      }
      if (!anchor) {
        anchor = find(`a[href="/trips/${screen.trip.id}/map"]`);
        text = mapHint(step);
      }
      if (!anchor) {
        anchor = button('More options');
        text = 'Explore your journey freely. Pick the walkthrough up again from this menu.';
      }
      const rect = rectangle(anchor);
      setTarget(old => JSON.stringify(old) === JSON.stringify(rect) ? old : rect);
      const second = step === 'find' && rect ? rectangle(search) : null;
      setSearchRect(old => JSON.stringify(old) === JSON.stringify(second) ? old : second);
      setCopy(text);
      if (tip.current) setTipHeight(tip.current.getBoundingClientRect().height);
    };
    measure();
    // Mapbox moves pins outside React. Only measure while guidance is active.
    const timer = window.setInterval(measure, 250);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && tip.current) onSkip(); };
    document.addEventListener('keydown', key);
    return () => { clearInterval(timer); document.removeEventListener('keydown', key); };
  }, [screen, step, onSkip, replay]);
  const width = typeof window === 'undefined' ? 248 : Math.min(268, innerWidth - 32);
  const left = target ? Math.max(16, Math.min(target.x + target.width / 2 - width + 32, innerWidth - width - 16)) : 0;
  const below = !!target && target.y < tipHeight + 26;
  const ring = (r: Rect, key: string) => <div key={key} aria-hidden="true" className="pointer-events-none fixed z-[201]" style={{ left: r.x - 3, top: r.y - 3, width: r.width + 6, height: r.height + 6, border: '2px solid #B0541F', borderRadius: step === 'card' ? 10 : 999 }} />;
  return <>
    {target && <>
      <style>{'[data-testid=start-here],[data-guidance-empty-map]{display:none!important}'}</style>
      {ring(target, 'target')}{searchRect && ring(searchRect, 'search')}
      <div ref={tip} role="note" aria-label="Getting started hint" className="fixed z-[202] rounded-xl bg-[#1A1A2E] px-4 pb-2 pt-4 text-white" style={{ width, left, top: Math.max(12, Math.min(innerHeight - tipHeight - 12, below ? target.y + target.height + 14 : target.y - tipHeight - 14)), boxShadow: '0 8px 24px rgba(26,26,46,.16)' }}>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">{stepLabel(step)}</p>
        <p className="text-[15px] leading-[22px]">{copy}</p>
        <div className="mt-1 flex items-center justify-between gap-4">
          {replay && <button onClick={onNext} className="min-h-10 text-xs font-medium">{step === 'card' ? 'Done' : 'Next'}</button>}
          <button onClick={onSkip} className="ml-auto min-h-10 text-xs text-white/70 underline underline-offset-4">Skip guidance</button>
        </div>
        <span aria-hidden="true" className="absolute h-3 w-3 rotate-45 bg-[#1A1A2E]" style={{ ...(below ? { top: -6 } : { bottom: -6 }), left: Math.max(14, Math.min(width - 26, target.x + target.width / 2 - left - 6)) }} />
      </div>
    </>}
  </>;
}
