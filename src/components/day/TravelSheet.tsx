"use client";

/**
 * One travel card for a joined travel run (28 Nov 2026, Brennan: "it should just be one card and
 * it shows the steps of how you need to get from point A to point B"; mock approved:
 * https://claude.ai/artifact/LbFYCDN84q6wCu3xMMHhHL). Opened from the list's travel line and the
 * Day view's travel strip alike. A tap on a leg opens that leg's own card, where it is edited.
 */
import type { Card } from "@/types/database";
import { travelSteps } from "@/lib/travel/travelSteps";
import { iconSubType } from "@/lib/travel/leg";
import { stripDuration } from "@/lib/week/travelStrip";
import { getMaterialIconHTML } from "@/lib/mapPins";
import { formatTimeValue } from "@/lib/formatTime";

const INK = "#1A1A2E";
const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;

const glyph = (sub: string | null, size: number) => (
  <span aria-hidden="true" className="flex items-center justify-center" dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(sub, size) }} />
);

export default function TravelSheet({ cards, startMin, endMin, dest, leave, onOpen, onClose }: {
  cards: Card[]; startMin: number; endMin: number | null; dest: string; leave: boolean;
  onOpen: (c: Card) => void; onClose: () => void;
}) {
  const steps = travelSteps(cards, dest, endMin);
  const len = endMin !== null && endMin > startMin ? stripDuration(endMin - startMin) : null;
  const when = [formatTimeValue(hhmm(startMin)) + (endMin !== null ? ` – ${formatTimeValue(hhmm(endMin))}` : ""), len].filter(Boolean).join(" · ");
  return (
    <div className="fixed inset-0 z-[60]" data-testid="travel-sheet" role="dialog" aria-modal="true" aria-label={`${leave ? "Leave for" : "Back to"} ${dest}`}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-[18px] px-5 pt-2.5 pb-8 max-w-mobile mx-auto" style={{ color: INK }}>
        <div className="w-9 h-1 rounded-full mx-auto mb-3.5" style={{ background: "rgba(26,26,46,0.18)" }} />
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-3.5 top-3 w-8 h-8 rounded-full flex items-center justify-center text-[15px]" style={{ background: "#F2F2F5" }}>✕</button>
        <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold px-2 py-1 rounded-lg" style={{ background: "#F2F2F5" }}>
          {glyph(iconSubType(cards[0]), 14)}Travel
        </span>
        <h2 className="font-display text-[22px] font-bold mt-3 leading-tight">{leave ? `Leave for ${dest}` : `Back to ${dest}`}</h2>
        <p className="text-[13px] mt-0.5" style={{ color: "rgba(26,26,46,0.6)" }}>{when}</p>
        <ol className="mt-4">
          {steps.map((s, i) => {
            const last = i === steps.length - 1;
            if (s.kind === "change") {
              return (
                <li key={`change-${i}`} data-testid="travel-step-change" className="flex items-center gap-3 min-h-[28px]">
                  <span className="w-7 flex justify-center self-stretch"><span style={{ borderLeft: "1.5px dashed rgba(26,26,46,0.22)" }} /></span>
                  <span className="text-[12px]" style={{ color: "rgba(26,26,46,0.5)" }}>{stripDuration(s.mins)} to change</span>
                </li>
              );
            }
            const row = (
              <>
                <span className="w-7 flex flex-col items-center self-stretch">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center flex-none" style={{ background: "#F2F2F5", color: "rgba(26,26,46,0.6)" }}>
                    {glyph(s.kind === "leg" ? iconSubType(s.card) : null, 15)}
                  </span>
                  {!last && <span className="flex-1" style={{ borderLeft: "1.5px dashed rgba(26,26,46,0.22)" }} />}
                </span>
                <span className="w-[62px] flex-none text-[13px] font-semibold pt-[5px] tabular-nums">{s.time ? formatTimeValue(s.time) : ""}</span>
                <span className="flex-1 min-w-0 pt-[4px] pb-3">
                  <span className="block text-[14.5px] font-medium truncate">{s.title}</span>
                  {s.kind === "leg" && s.sub && <span className="block text-[12px] mt-px truncate" style={{ color: "rgba(26,26,46,0.55)" }}>{s.sub}</span>}
                </span>
              </>
            );
            return s.kind === "leg" ? (
              <li key={s.card.id}>
                <button type="button" data-testid="travel-step" onClick={() => { onClose(); onOpen(s.card); }} className="w-full flex items-stretch gap-3 text-left active:opacity-70">
                  {row}
                </button>
              </li>
            ) : (
              <li key="arrive" data-testid="travel-step-arrive" className="flex items-stretch gap-3">{row}</li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
