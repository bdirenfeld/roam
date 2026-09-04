"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchPredictions,
  fetchPlaceDetails,
  predMain,
  predSecondary,
} from "@/lib/places/predictions";
import type { Prediction } from "@/lib/places/predictions";
import type { ResolvedIdeaPlace } from "./PromoteToWishlistSheet";
import { useSheetDrag } from "@/hooks/useSheetDrag";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.42)";
const RULE = "rgba(26,26,46,0.12)";
const SIENNA = "#C4622D";
const PARCHMENT = "#FFFFFF";

/**
 * Give an idea a location after the fact.
 *
 * Anything saved before place resolution existed has a name and no
 * coordinates, and so does anything you typed freely — a reel captioned "this
 * beach is unreal" resolves to nothing. Those ideas could be added to a journey
 * (the sheet guesses from the name) but they had no map of their own and no way
 * to correct the guess without going through that flow.
 *
 * This is the small version: name the place, store it, done.
 */
export default function SetLocationSheet({
  ideaId,
  initialQuery,
  onClose,
  onSet,
}: {
  ideaId: string;
  initialQuery: string;
  onClose: () => void;
  onSet: (place: ResolvedIdeaPlace) => void;
}) {
  const drag = useSheetDrag(onClose);
  const [query, setQuery] = useState(initialQuery);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setPreds([]);
      return;
    }
    const t = setTimeout(async () => {
      setPreds(await fetchPredictions(q, token.current));
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const choose = async (p: Prediction) => {
    setBusy(true);
    setError(null);
    const place = await fetchPlaceDetails(p.place_id, token.current);
    if (!place) {
      setError("Couldn't read that place back from Google. Pick another.");
      setBusy(false);
      return;
    }
    const resolved: ResolvedIdeaPlace = {
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      types: place.types,
    };
    const supabase = createClient();
    const { error: err } = await supabase
      .from("ideas")
      .update({ place: resolved })
      .eq("id", ideaId);
    setBusy(false);
    if (err) {
      setError("Couldn't save that. Try again.");
      return;
    }
    onSet(resolved);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        ref={drag.sheetRef}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        className="relative w-full max-w-[560px] rounded-t-2xl px-4 pt-3 pb-6 overflow-y-auto"
        style={{
          background: PARCHMENT,
          borderTop: `1px solid ${RULE}`,
          maxHeight: "82dvh",
          overscrollBehavior: "contain",
        }}
      >
        <div
          className="mx-auto mb-3.5"
          style={{ width: 34, height: 4, borderRadius: 2, background: "rgba(26,26,46,0.16)" }}
        />

        <p className="font-display italic text-[17px] mb-3" style={{ color: INK }}>
          Where is this?
        </p>

        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a place or region"
          className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none"
          style={{ background: "#fff", border: `1px solid ${RULE}`, color: INK }}
        />

        <div className="mt-2">
          {preds.map((p) => (
            <button
              key={p.place_id}
              onClick={() => choose(p)}
              disabled={busy}
              className="w-full text-left py-2.5"
              style={{ borderBottom: `1px solid ${RULE}` }}
            >
              <span className="block text-[14px]" style={{ color: INK }}>
                {predMain(p)}
              </span>
              {predSecondary(p) && (
                <span className="block text-[12px] mt-[1px]" style={{ color: CAPTION }}>
                  {predSecondary(p)}
                </span>
              )}
            </button>
          ))}
          {query.trim().length >= 3 && preds.length === 0 && !busy && (
            <p className="text-[13px] py-2" style={{ color: SOFT }}>
              Nothing found. Try the town or region instead.
            </p>
          )}
        </div>

        {error && (
          <p className="text-[13px] mt-2" style={{ color: SIENNA }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
