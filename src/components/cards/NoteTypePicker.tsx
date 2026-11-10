"use client";

/**
 * The word "Note" on a note card is a dropdown (10 Nov 2026, prototype
 * approved): pick Activity, Food, Hotel, Drive, Train or Flight, then any
 * place from the Google search, and the note becomes that card. The rules live
 * in lib/cards/noteKinds; the sheet does the saving. This is only the inputs.
 */

import { useState } from "react";
import PlaceSearch from "@/components/map/PlaceSearch";
import { NOTE_KINDS, type NoteKind } from "@/lib/cards/noteKinds";

interface Props {
  destination?: string;
  lat?: number | null;
  lng?: number | null;
  busy: boolean;
  error: string | null;
  onPick: (kind: NoteKind, googlePlaceId: string) => void;
  onClose: () => void;
}

const glyphStyle = { fontSize: 16, lineHeight: 1, fontVariationSettings: "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20" } as const;

export default function NoteTypePicker({ destination, lat, lng, busy, error, onPick, onClose }: Props) {
  const [kind, setKind] = useState<NoteKind | null>(null);

  return (
    <div data-testid="note-type-picker" className="absolute left-0 top-full mt-1.5 z-40 w-[min(320px,calc(100vw-40px))] rounded-xl border border-gray-200 bg-white shadow-lg">
      {!kind ? (
        <ul role="menu" className="py-1">
          {NOTE_KINDS.map((k) => (
            <li key={k.key}>
              <button
                role="menuitem"
                onClick={() => (k.key === "note" ? onClose() : setKind(k))}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-[#1A1A2E] hover:bg-gray-50"
              >
                <span className="material-symbols-outlined text-gray-500" style={glyphStyle} aria-hidden="true">{k.glyph}</span>
                {k.label}
                {k.key === "note" && <span className="ml-auto text-[11px] text-gray-400">current</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setKind(null)} className="text-[12px] text-gray-500 hover:text-[#1A1A2E]" aria-label="Back to the list">‹ Back</button>
            <span className="material-symbols-outlined text-gray-500" style={glyphStyle} aria-hidden="true">{kind.glyph}</span>
            <span className="text-[13px] font-medium text-[#1A1A2E]">{kind.label}</span>
          </div>
          <p className="text-[12px] text-gray-500 mb-1.5">{kind.prompt}</p>
          <PlaceSearch
            onPlaceSelect={(placeId) => { if (!busy) onPick(kind, placeId); }}
            destination={destination}
            lat={lat}
            lng={lng}
            positionClassName="relative"
          />
          {busy && <p className="mt-2 text-[12px] text-gray-500">Adding…</p>}
          {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
