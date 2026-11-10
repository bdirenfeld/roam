"use client";

/**
 * The word "Note" on a note card is a dropdown (10 Nov 2026). Picking a kind
 * saves it at once ("type now, place later", mock approved the same day): the
 * place is a separate, optional "Where?" row on the card (NoteWhereRow below).
 * The rules live in lib/cards/noteKinds; the sheet does the saving.
 */

import { useState } from "react";
import PlaceSearch from "@/components/map/PlaceSearch";
import { NOTE_KINDS, type NoteKind, type NoteKindKey } from "@/lib/cards/noteKinds";

const glyphStyle = { fontSize: 16, lineHeight: 1, fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20" } as const;

export default function NoteTypePicker({ current, onPick }: { current: NoteKindKey; onPick: (kind: NoteKind) => void }) {
  return (
    <div data-testid="note-type-picker" className="absolute left-0 top-full mt-1.5 z-40 w-[200px] rounded-xl border border-gray-200 bg-white shadow-lg">
      <ul role="menu" className="py-1">
        {NOTE_KINDS.map((k) => (
          <li key={k.key}>
            <button
              role="menuitem"
              onClick={() => onPick(k)}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#1A1A2E] hover:bg-gray-50"
            >
              <span className="material-symbols-outlined text-gray-500" style={glyphStyle} aria-hidden="true">{k.glyph}</span>
              {k.label}
              {k.key === current && <span className="ml-auto text-[11px] text-gray-400">current</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Where? Add a place", optional, on a typed note with no place yet. A tap
 * opens the Google search; picking a place turns the note into that card.
 */
export function NoteWhereRow({ kind, destination, busy, error, onPick }: {
  kind: NoteKind;
  destination?: string;
  busy: boolean;
  error: string | null;
  onPick: (googlePlaceId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = kind.mode === "drive" ? "Where to?" : kind.mode === "train" ? "Which station?" : "Where?";
  return (
    <div className="mt-3" data-testid="note-where">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-left text-[13px] text-gray-500 hover:border-gray-400"
        >
          <span className="material-symbols-outlined" style={glyphStyle} aria-hidden="true">place</span>
          {label} Add a place
          <span className="ml-auto text-[11px] text-gray-400">optional</span>
        </button>
      ) : (
        <div>
          <p className="text-[12px] text-gray-500 mb-1.5">{label}</p>
          <PlaceSearch onPlaceSelect={(id) => { if (!busy) onPick(id); }} destination={destination} positionClassName="relative" />
          {busy && <p className="mt-2 text-[12px] text-gray-500">Adding…</p>}
          {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
          <button onClick={() => setOpen(false)} className="mt-2 text-[12px] text-gray-500 hover:text-[#1A1A2E]">Not now</button>
        </div>
      )}
    </div>
  );
}
