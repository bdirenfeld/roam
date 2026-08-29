"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchPredictions,
  fetchPlaceDetails,
  predMain,
  predSecondary,
} from "@/lib/places/predictions";
import type { Prediction, ResolvedPlace } from "@/lib/places/predictions";
import { fetchClimate, compactAddress } from "@/lib/wishlist/climate";
import type { MonthClimate } from "@/lib/wishlist/climate";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.35)";
const RULE = "rgba(26,26,46,0.10)";
const SIENNA = "#C4622D";
const PARCHMENT = "#FAF7F2";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The months worth going in, as a plain phrase.
 *
 * Ranked on HCI where the profile carries it and on the daily max otherwise,
 * then read back in calendar order so "Jun – Sep" comes out the right way
 * round. Contiguous runs print as a range, scattered months as a list — a
 * Mediterranean summer and a shoulder-season city shouldn't be forced into
 * the same shape.
 */
function bestMonths(climate: MonthClimate[]): string | null {
  if (climate.length !== 12) return null;
  const scored = climate.map((c, i) => ({ i, s: c.hci ?? (30 - Math.abs(24 - c.high)) }));
  const top = [...scored].sort((a, b) => b.s - a.s).slice(0, 4).map((m) => m.i).sort((a, b) => a - b);
  if (top.length === 0) return null;
  const contiguous = top.every((m, k) => k === 0 || m === top[k - 1] + 1);
  return contiguous
    ? `${MONTHS[top[0]]} – ${MONTHS[top[top.length - 1]]}`
    : top.map((m) => MONTHS[m]).join(", ");
}

type Props = {
  ideaId: string;
  /** Seeds the search box. Idea titles are often unsearchable ("this beach in
   *  Sardinia is unreal 😍"), which is exactly why this is editable and why
   *  nothing is geocoded until a real place is picked. */
  initialQuery: string;
  onClose: () => void;
  onPromoted: (destinationId: string, name: string) => void;
};

export default function PromoteToWishlistSheet({
  ideaId,
  initialQuery,
  onClose,
  onPromoted,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [picked, setPicked] = useState<ResolvedPlace | null>(null);
  const [climate, setClimate] = useState<MonthClimate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One Places session token for the whole picker — Google bills autocomplete
  // plus details as a single session when they share it.
  const token = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  );

  // Predictions, debounced. Skipped entirely once a place is picked, so
  // confirming doesn't flicker a fresh list behind the summary.
  useEffect(() => {
    if (picked) return;
    const q = query.trim();
    if (q.length < 3) {
      setPreds([]);
      return;
    }
    const t = setTimeout(async () => {
      setPreds(await fetchPredictions(q, token.current));
    }, 220);
    return () => clearTimeout(t);
  }, [query, picked]);

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
    setPicked(place);

    // Already on the wishlist? Same test the Year View uses — name, or within
    // roughly 5km — so the two screens agree on what counts as the same place.
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("wishlist_destinations")
      .select("id, name, lat, lng");
    const hit = (existing ?? []).find(
      (d: { name: string; lat: number | null; lng: number | null }) =>
        d.name.trim().toLowerCase() === place.name.trim().toLowerCase() ||
        (d.lat != null &&
          d.lng != null &&
          Math.abs(d.lat - place.lat) < 0.05 &&
          Math.abs(d.lng - place.lng) < 0.05)
    );
    setDuplicate(hit ? hit.name : null);

    // Climate up front so the row behaves like one added from the Year View.
    // A failed fetch still saves — the destination is worth more than the graph.
    setClimate(await fetchClimate(place.lat, place.lng).catch(() => null));
    setBusy(false);
  };

  const commit = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You're signed out. Sign in and try again.");
      setBusy(false);
      return;
    }
    const { data, error: insErr } = await supabase
      .from("wishlist_destinations")
      .insert({
        user_id: user.id,
        name: picked.name,
        location: compactAddress(picked.address, picked.name),
        lat: picked.lat,
        lng: picked.lng,
        drive_hours: null,
        budget: null,
        best_time: null,
        why: null,
        source: "idea",
        climate,
      })
      .select("id, name")
      .single();

    if (insErr || !data) {
      setError("Couldn't save it. Your connection may be down — try again.");
      setBusy(false);
      return;
    }
    await supabase.from("ideas").update({ wishlist_destination_id: data.id }).eq("id", ideaId);
    onPromoted(data.id as string, data.name as string);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[560px] rounded-t-2xl px-4 pt-3 pb-6"
        style={{ background: PARCHMENT, borderTop: `1px solid ${RULE}` }}
      >
        <div
          className="mx-auto mb-3.5"
          style={{ width: 34, height: 4, borderRadius: 2, background: "rgba(26,26,46,0.16)" }}
        />

        {!picked ? (
          <>
            <p className="font-display italic text-[17px] mb-3" style={{ color: INK }}>
              Which place is this?
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
          </>
        ) : (
          <>
            <p className="font-display italic text-[17px] mb-2.5" style={{ color: INK }}>
              {picked.name}
            </p>

            {duplicate ? (
              <p className="text-[13.5px] py-2" style={{ color: INK }}>
                {duplicate} is already on your wishlist.
              </p>
            ) : (
              <>
                <Row label="Region" value={compactAddress(picked.address, picked.name)} />
                <Row
                  label="Coordinates"
                  value={`${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)}`}
                />
                <Row label="Climate" value={climate ? "5 years, monthly" : "Unavailable"} />
                {climate && bestMonths(climate) && (
                  <Row label="Best months" value={bestMonths(climate) as string} last />
                )}
              </>
            )}

            {error && (
              <p className="text-[13px] mt-2.5" style={{ color: SIENNA }}>
                {error}
              </p>
            )}

            <div className="flex gap-2.5 mt-4">
              {!duplicate && (
                <button
                  onClick={commit}
                  disabled={busy}
                  className="flex-1 rounded-lg py-2.5 text-[14px]"
                  style={{ background: INK, color: PARCHMENT, opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? "Saving…" : "Add to wishlist"}
                </button>
              )}
              <button
                onClick={() => {
                  setPicked(null);
                  setClimate(null);
                  setDuplicate(null);
                  setError(null);
                }}
                className="rounded-lg py-2.5 px-4 text-[14px]"
                style={{ border: `1px solid ${RULE}`, color: CAPTION }}
              >
                {duplicate ? "Pick another" : "Back"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className="flex justify-between gap-3 py-1.5 text-[13px]"
      style={{ borderBottom: last ? "none" : `1px solid ${RULE}` }}
    >
      <span style={{ color: INK }}>{label}</span>
      <span className="text-right tabular-nums" style={{ color: CAPTION }}>
        {value}
      </span>
    </div>
  );
}
