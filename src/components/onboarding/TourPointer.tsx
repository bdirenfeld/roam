'use client';
import { useEffect, useRef, useState } from 'react';
import { pickAnchor, tourStepLabel, type Tour } from '@/lib/onboarding/walkthroughs';

type Rect = { x: number; y: number; width: number; height: number };
const rendered = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
const onScreen = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
};
// Anything drawn over the page: a sheet, a dialog, a menu. The hint shows only
// when its control is inside the top one (or nothing is open), so it never
// rings a control that a sheet is covering.
const COVERS = '[role=dialog], [aria-modal="true"], [role=menu], [data-testid=sheet-close-target]';

/**
 * The hint for a screen's walkthrough (lib/onboarding/walkthroughs.ts) — the
 * same dark note and ring as the first journey's (JourneyPointer), with Next
 * on every step because these teach a screen rather than wait for an action.
 */
export default function TourPointer({ tour, step, onNext, onSkip }: { tour: Tour; step: number; onNext: () => void; onSkip: () => void }) {
  const [target, setTarget] = useState<Rect | null>(null);
  const [copy, setCopy] = useState<string | null>(null);
  const [tipHeight, setTipHeight] = useState(110);
  const tip = useRef<HTMLDivElement>(null);
  const scrolled = useRef<string | null>(null);
  const last = tour.steps.length - 1;
  useEffect(() => {
    const def = tour.steps[Math.min(step, last)];
    const measure = () => {
      const picked = pickAnchor(def, sel => Array.from(document.querySelectorAll(sel)).find(rendered));
      const covers = Array.from(document.querySelectorAll(COVERS)).filter(rendered).map(el => el.closest('[role=dialog], [aria-modal="true"]') ?? el);
      const top = covers[covers.length - 1];
      if (document.querySelector('[role=menu]') && Array.from(document.querySelectorAll('[role=menu]')).some(rendered)) { setCopy(null); return; }
      if (picked && top && !top.contains(picked.el)) { setCopy(null); return; }
      if (!picked) {
        // A step that waits for its control stays out of the way; any other
        // one still says its line, docked at the bottom, so the walkthrough
        // can always be moved on or skipped.
        setTarget(null); setCopy(def.wait ? null : def.anchors[0].text);
        return;
      }
      const key = `${tour.id}:${step}`;
      if (!onScreen(picked.el) && scrolled.current !== key) {
        scrolled.current = key;
        picked.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      const { x, y, width, height } = picked.el.getBoundingClientRect();
      const rect = onScreen(picked.el) ? { x, y, width, height } : null;
      setTarget(old => JSON.stringify(old) === JSON.stringify(rect) ? old : rect);
      setCopy(picked.text);
      if (tip.current) setTipHeight(tip.current.getBoundingClientRect().height);
    };
    measure();
    const timer = window.setInterval(measure, 250);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && tip.current) onSkip(); };
    document.addEventListener('keydown', key);
    return () => { clearInterval(timer); document.removeEventListener('keydown', key); };
  }, [tour, step, last, onSkip]);
  if (!copy) return null;
  const width = typeof window === 'undefined' ? 248 : Math.min(268, innerWidth - 32);
  const left = target ? Math.max(16, Math.min(target.x + target.width / 2 - width + 32, innerWidth - width - 16)) : Math.max(16, (innerWidth - width) / 2);
  const below = !!target && target.y < tipHeight + 26;
  const top = target ? Math.max(12, Math.min(innerHeight - tipHeight - 12, below ? target.y + target.height + 14 : target.y - tipHeight - 14)) : innerHeight - tipHeight - 24;
  return <>
    {target && <div aria-hidden="true" className="pointer-events-none fixed z-[201]" style={{ left: target.x - 3, top: target.y - 3, width: target.width + 6, height: target.height + 6, border: '2px solid #B0541F', borderRadius: 10 }} />}
    <div ref={tip} role="note" aria-label={`${tour.title} walkthrough`} data-testid="tour-hint" className="fixed z-[202] rounded-xl bg-[#1A1A2E] px-4 pb-2 pt-4 text-white" style={{ width, left, top, boxShadow: '0 8px 24px rgba(26,26,46,.16)' }}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">{tour.title} · {tourStepLabel(step, tour.steps.length)}</p>
      <p className="text-[15px] leading-[22px]">{copy}</p>
      <div className="mt-1 flex items-center justify-between gap-4">
        <button onClick={onNext} className="min-h-10 text-xs font-medium">{step >= last ? 'Done' : 'Next'}</button>
        <button onClick={onSkip} className="ml-auto min-h-10 text-xs text-white/70 underline underline-offset-4">Skip</button>
      </div>
      {target && <span aria-hidden="true" className="absolute h-3 w-3 rotate-45 bg-[#1A1A2E]" style={{ ...(below ? { top: -6 } : { bottom: -6 }), left: Math.max(14, Math.min(width - 26, target.x + target.width / 2 - left - 6)) }} />}
    </div>
  </>;
}
