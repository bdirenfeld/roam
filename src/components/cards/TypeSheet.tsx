"use client";

// ── What kind of place? ───────────────────────────────────────────────────
// The card's type picker as a sheet (18 Nov 2026, clickable mock approved:
// claude.ai/artifact/UWt1cFdSUWCTaQBZ5jdowm). It opens on the card's own
// group, so most changes (Explore → Park) are one tap; Food / Activity /
// Logistics switch the chips. The dropdown it replaces listed one kind per
// row, and Activity ran thirteen rows once the new kinds landed.
//
// Portalled to <body> like NavigationSheet: the card sheet is transformed, and
// a fixed child of a transformed parent is fixed to the parent, not the screen.

import { useState } from "react";
import { createPortal } from "react-dom";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { MATERIAL_ICONS } from "@/lib/mapPins";

type Group = "food" | "activity" | "logistics";
const GROUPS: { value: Group; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "activity", label: "Activity" },
  { value: "logistics", label: "Logistics" },
];

export function TypeSheet({
  currentType,
  currentSubType,
  options,
  onSelect,
  onClose,
  note,
  travel,
}: {
  currentType: string;
  currentSubType: string | null;
  options: Record<string, { value: string; label: string }[]>;
  onSelect: (type: string, subType: string) => void;
  onClose: () => void;
  /** On a note card (19 Nov 2026): a "Just a note" chip, so notes use this sheet too, on every screen. */
  note?: { on: boolean; onPick: () => void };
  /**
   * On a note (25 Nov 2026): Logistics offers Drive and Train by name where a
   * place's picker says Transit. Brennan could not find how to make a card a
   * drive; the names were lost when the pickers were merged on 19 Nov.
   */
  travel?: { current: "drive" | "train" | null; onPick: (mode: "drive" | "train") => void };
}) {
  const start: Group = GROUPS.some((g) => g.value === currentType) ? (currentType as Group) : "activity";
  const [group, setGroup] = useState<Group>(start);
  useEscapeKey(onClose);
  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/40 z-[70]" onClick={onClose} data-testid="type-sheet-scrim" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="type-sheet-title"
        className="fixed bottom-0 left-0 right-0 z-[70] mx-auto max-w-mobile bg-white rounded-t-2xl shadow-sheet px-4 pt-2 pb-[max(22px,env(safe-area-inset-bottom))]"
      >
        <div className="flex justify-center pb-2.5"><div className="w-9 h-1 bg-gray-200 rounded-full" /></div>
        <div className="flex items-center justify-between">
          <h2 id="type-sheet-title" className="text-base font-bold text-[#1A1A2E]">{note ? "What kind of card?" : "What kind of place?"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 -mr-1 rounded-md text-gray-400 hover:text-gray-600">
            {/* Drawn, not a font glyph: "close" is not in Roam's icon-font subset (lib/mapPins). */}
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {note && (
          <button type="button" data-testid="type-sheet-note" aria-pressed={note.on} onClick={note.onPick}
            className={`mt-2.5 inline-flex items-center gap-1.5 h-10 px-3 rounded-full border text-[13px] font-medium ${note.on ? "bg-[#1A1A2E] border-[#1A1A2E] text-white" : "bg-white border-gray-200 text-gray-600"}`}>
            <span aria-hidden="true" className={`material-symbols-outlined ${note.on ? "text-white" : "text-gray-500"}`} style={{ fontSize: 16, lineHeight: 1 }}>edit_note</span>
            Just a note
          </button>
        )}
        <div role="tablist" className="flex bg-gray-100 rounded-[10px] p-[3px] mt-2.5 mb-3">
          {GROUPS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={group === value}
              onClick={() => setGroup(value)}
              className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                group === value ? "bg-white text-[#1A1A2E] shadow-sm" : "text-gray-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* All three groups share one grid cell, the hidden two kept in the
            layout: the sheet is always as tall as the longest group, so
            switching never makes it jump (mock note, 18 Nov 2026). */}
        <div className="grid">
          {GROUPS.map(({ value }) => (
            <div
              key={value}
              role="radiogroup"
              aria-label={GROUPS.find((g) => g.value === value)!.label}
              aria-hidden={group !== value}
              className={`[grid-area:1/1] flex flex-wrap content-start gap-1.5 ${group === value ? "" : "invisible"}`}
            >
              {(options[value] ?? []).flatMap<{ value: string; label: string; mode: "drive" | "train" | null }>((o) => (travel && value === "logistics" && o.value === "transit"
                ? [{ value: "transit", label: "Drive", mode: "drive" }, { value: "transit", label: "Train", mode: "train" }]
                : [{ ...o, mode: null }])).map(({ value: sub, label, mode }) => {
                const on = mode ? travel?.current === mode : currentType === value && currentSubType === sub;
                const glyph = mode === "drive" ? "directions_car" : mode === "train" ? "train" : MATERIAL_ICONS[sub] ?? null;
                return (
                  <button
                    key={mode ?? sub}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={group === value ? 0 : -1}
                    onClick={() => (mode && travel ? travel.onPick(mode) : onSelect(value, sub))}
                    className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-full border text-[13px] font-medium whitespace-nowrap transition-colors ${
                      on ? "bg-[#1A1A2E] border-[#1A1A2E] text-white" : "bg-white border-gray-200 text-gray-600 active:bg-gray-50"
                    }`}
                  >
                    {glyph && (
                      <span aria-hidden="true" className={`material-symbols-outlined ${on ? "text-white" : "text-gray-500"}`}
                        style={{ fontSize: 16, lineHeight: 1, fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 20" }}>
                        {glyph}
                      </span>
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
