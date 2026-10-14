'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pickAnchor, type Tour } from '@/lib/onboarding/walkthroughs';
import GuidanceBubble, { type HintRect } from './GuidanceBubble';

const rendered = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const onScreen = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
};
const find = (sel: string) => Array.from(document.querySelectorAll(sel)).find(el => rendered(el) && !el.closest('[role=note]'));
// Anything drawn over the page: a sheet, a dialog, a menu. The hint shows only
// when its control is inside the top one (or nothing is open), so it never
// rings a control that a sheet is covering. A sheet without a dialog role is
// known by its close target; the sheet is that target's fixed panel.
const COVERS = '[role=dialog], [aria-modal="true"], [data-testid=sheet-close-target]';
const coverOf = (el: Element) => el.closest('[role=dialog], [aria-modal="true"]') ?? el.closest('.fixed') ?? el;

/**
 * The hint for a screen's walkthrough (lib/onboarding/walkthroughs.ts) — the
 * first journey's note and ring (GuidanceBubble), with Next on every step
 * because these teach a screen rather than wait for an action.
 */
export default function TourPointer({ tour, step, onNext, onSkip }: { tour: Tour; step: number; onNext: () => void; onSkip: () => void }) {
  const [hint, setHint] = useState<{ el: Element | null; rect: HintRect | null; text: string } | null>(null);
  const scrolled = useRef<string | null>(null);
  const last = tour.steps.length - 1;
  const def = tour.steps[Math.min(step, last)];
  useEffect(() => {
    const measure = () => {
      if (Array.from(document.querySelectorAll('[role=menu]')).some(rendered)) { setHint(null); return; }
      const picked = pickAnchor(def, find);
      const covers = Array.from(document.querySelectorAll(COVERS)).filter(rendered).map(coverOf);
      const top = covers[covers.length - 1];
      if (picked && top && !top.contains(picked.el)) { setHint(null); return; }
      if (!picked) {
        // A step that waits for its control stays out of the way; any other
        // one still says its line, docked at the bottom, so the walkthrough
        // can always be moved on or skipped.
        setHint(def.wait ? null : { el: null, rect: null, text: def.anchors[0].text });
        return;
      }
      const key = `${tour.id}:${step}`;
      if (!onScreen(picked.el) && scrolled.current !== key) {
        scrolled.current = key;
        picked.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      const { x, y, width, height } = picked.el.getBoundingClientRect();
      const rect = onScreen(picked.el) ? { x, y, width, height } : null;
      setHint(old => old && old.el === picked.el && old.text === picked.text && JSON.stringify(old.rect) === JSON.stringify(rect) ? old : { el: picked.el, rect, text: picked.text });
    };
    measure();
    const timer = window.setInterval(measure, 250);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && document.querySelector('[data-testid="tour-hint"]')) onSkip(); };
    document.addEventListener('keydown', key);
    return () => { clearInterval(timer); document.removeEventListener('keydown', key); };
  }, [tour, step, def, onSkip]);
  const next = () => {
    // Next may open a fold the coming step points into (Budget's Standard);
    // it never saves or changes the journey.
    const coming = tour.steps[step + 1];
    if (coming?.reveal && !find(coming.anchors[0].selector)) (find(coming.reveal) as HTMLElement | undefined)?.click();
    onNext();
  };
  if (!hint) return null;
  // Inside a sheet the note joins the sheet, so tapping it is not a tap
  // outside that closes the sheet. A sheet that slides (a transform) would
  // shift fixed coordinates, so those keep the note on the body.
  const dialog = hint.el?.closest('[role=dialog], [aria-modal="true"]');
  const host = dialog && getComputedStyle(dialog).transform === 'none' ? dialog : document.body;
  return createPortal(<div data-testid="tour-hint">
    <GuidanceBubble target={hint.rect} label={`${tour.title} walkthrough`} heading={tour.title} text={hint.text} step={step} total={tour.steps.length} onNext={next} onSkip={onSkip} />
  </div>, host);
}
