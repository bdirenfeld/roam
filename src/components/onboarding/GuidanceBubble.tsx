'use client';
import { useLayoutEffect, useRef, useState } from 'react';

export type HintRect = { x: number; y: number; width: number; height: number };

/** Shared by the first-journey hints and the optional feature walkthroughs. */
export default function GuidanceBubble({ target, label, text, step, onNext, onSkip, rounded = false }: {
  target: HintRect; label: string; text: string; step: number;
  onNext?: () => void; onSkip: () => void; rounded?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(150);
  useLayoutEffect(() => {
    if (!ref.current) return;
    if (typeof ResizeObserver === 'undefined') { setHeight(ref.current.getBoundingClientRect().height); return; }
    const observer = new ResizeObserver(() => setHeight(ref.current?.getBoundingClientRect().height ?? 150));
    setHeight(ref.current.getBoundingClientRect().height);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const width = Math.min(268, innerWidth - 32);
  const left = Math.max(16, Math.min(target.x + target.width / 2 - width + 32, innerWidth - width - 16));
  const below = target.y < height + 26;
  const top = Math.max(12, Math.min(innerHeight - height - 12, below ? target.y + target.height + 14 : target.y - height - 14));
  return <>
    <div aria-hidden="true" className="pointer-events-none fixed z-[201]" style={{ left: target.x - 3, top: target.y - 3, width: target.width + 6, height: target.height + 6, border: '2px solid #B0541F', borderRadius: rounded ? 999 : 10 }} />
    <div ref={ref} role="note" aria-label={label} className="fixed z-[202] rounded-xl bg-[#1A1A2E] px-4 pb-2 pt-4 text-white" style={{ width, left, top, boxShadow: '0 8px 24px rgba(26,26,46,.16)' }}>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">Step {step + 1} of 3</p>
      <p className="text-[15px] leading-[22px]">{text}</p>
      <div className="mt-1 flex items-center justify-between gap-4">
        {onNext && <button type="button" onClick={onNext} className="min-h-10 text-xs font-medium">{step === 2 ? 'Done' : 'Next'}</button>}
        <button type="button" onClick={onSkip} className="ml-auto min-h-10 text-xs text-white/70 underline underline-offset-4">Skip guidance</button>
      </div>
      <span aria-hidden="true" className="absolute h-3 w-3 rotate-45 bg-[#1A1A2E]" style={{ ...(below ? { top: -6 } : { bottom: -6 }), left: Math.max(14, Math.min(width - 26, target.x + target.width / 2 - left - 6)) }} />
    </div>
  </>;
}
