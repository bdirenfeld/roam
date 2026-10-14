'use client';
import { useEffect, useState } from 'react';
import type { GuidanceScreen } from './JourneyGuidanceContext';
import { mapHint, type Step } from './progress';
import GuidanceBubble from './GuidanceBubble';

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

    };
    measure();
    // Mapbox moves pins outside React. Only measure while guidance is active.
    const timer = window.setInterval(measure, 250);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && document.querySelector('[aria-label="Getting started hint"]')) onSkip(); };
    document.addEventListener('keydown', key);
    return () => { clearInterval(timer); document.removeEventListener('keydown', key); };
  }, [screen, step, onSkip, replay]);
  return <>{target && <>
    <style>{'[data-testid=start-here],[data-guidance-empty-map]{display:none!important}'}</style>
    {searchRect && <div aria-hidden="true" className="pointer-events-none fixed z-[201] rounded-full border-2 border-[#B0541F]" style={{ left: searchRect.x - 3, top: searchRect.y - 3, width: searchRect.width + 6, height: searchRect.height + 6 }} />}
    <GuidanceBubble target={target} label="Getting started hint" text={copy} step={['find', 'plan', 'card'].indexOf(step)} onNext={replay ? onNext : undefined} onSkip={onSkip} rounded={step !== 'card'} />
  </>}</>;
}
