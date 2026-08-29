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
import { pinPlaceToJourney } from "@/lib/wishlist/pinToJourney";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.42)";
const RULE = "rgba(26,26,46,0.12)";
const SIENNA = "#C4622D";
const PARCHMENT = "#FAF7F2";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A journey you could pin a place to. */
export interface JourneySummary {
  id: string;
  title: string;
  destination: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  end_date: string | null;
  archived: boolean;
}

export interface ResolvedIdeaPlace {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  types?: string[];
}

export type PromoteOutcome =
  | { kind: "wishlist"; destinationId: string; name: string }
  | { kind: "pins"; tripId: string; tripTitle: string; count: number };

/** Great-circle km — used only to decide which journey to offer first. */
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Close enough that the journey is the obvious answer rather than a guess. */
const NEARBY_KM = 150;

/**
 * The months worth going in, as a plain phrase. Ranked on HCI where the profile
 * carries it and on daily max otherwise, then read back in calendar order so
 * "Jun – Sep" comes out the right way round.
 */
function bestMonths(climate: MonthClimate[]): string | null {
  if (climate.length !== 12) return null;
  const scored = climate.map((c, i) => ({ i, s: c.hci ?? 30 - Math.abs(24 - c.high) }));
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
   *  Sardinia is unreal 😍"), which is why this is editable and why nothing is
   *  geocoded until a real place is picked. */
  initialQuery: string;
  /** The link this idea came from — rides along onto any pin it creates. */
  ideaUrl: string | null;
  /** Resolved when the idea was captured. When present the search step is
   *  skipped: the question it asks has already been answered. */
  resolvedPlace: ResolvedIdeaPlace | null;
  /** Journeys still worth adding to — a finished trip is not somewhere to put
   *  a restaurant. */
  journeys: JourneySummary[];
  onClose: () => void;
  onDone: (outcome: PromoteOutcome) => void;
};

export default function PromoteToWishlistSheet({
  ideaId,
  initialQuery,
  ideaUrl,
  resolvedPlace,
  journeys,
  onClose,
  onDone,
}: Props) {
  const [step, setStep] = useState<"search" | "target" | "wishlist" | "added">(
    resolvedPlace ? "target" : "search"
  );
  const [query, setQuery] = useState(initialQuery);
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [picked, setPicked] = useState<ResolvedPlace | null>(
    resolvedPlace ? { ...resolvedPlace, types: resolvedPlace.types ?? [] } : null
  );
  const [climate, setClimate] = useState<MonthClimate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Everything this one idea has produced in this sitting — a Reddit thread of
  // fifteen restaurants shouldn't mean reopening the idea fifteen times.
  const [addedTo, setAddedTo] = useState<JourneySummary | null>(null);
  const [addedNames, setAddedNames] = useState<string[]>([]);

  const token = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  );

  useEffect(() => {
    if (step !== "search") return;
    const q = query.trim();
    if (q.length < 3) {
      setPreds([]);
      return;
    }
    const t = setTimeout(async () => {
      setPreds(await fetchPredictions(q, token.current));
    }, 220);
    return () => clearTimeout(t);
  }, [query, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Resolve the name on open, rather than asking.
   *
   * An idea captured before place resolution existed has no coordinates, but it
   * does have a name — and asking "which place is this?" when the row already
   * says "castiglioncello" is the app making you answer a question it can
   * answer itself. First prediction wins, exactly as the Year View's own
   * name→coordinates path does, and the chosen place is shown with a Change
   * beside it so a wrong guess costs one tap.
   *
   * Only when there is nothing to go on, or Google returns nothing, does the
   * search box appear.
   */
  const autoTried = useRef(false);
  useEffect(() => {
    if (resolvedPlace || autoTried.current) return;
    const q = initialQuery.trim();
    if (q.length < 3) return;
    autoTried.current = true;
    let cancelled = false;
    (async () => {
      setBusy(true);
      const preds = await fetchPredictions(q, token.current);
      const best = preds[0] ? await fetchPlaceDetails(preds[0].place_id, token.current) : null;
      if (cancelled) return;
      setBusy(false);
      if (!best) return; // stay on search — nothing was found to go on
      setPicked(best);
      setStep("target");
    })();
    return () => { cancelled = true; };
  }, [initialQuery, resolvedPlace]);

  // Journeys, live ones first and nearest first within each group. The
  // coordinates were just resolved, so offering the journey that contains them
  // is a guess the app can actually make — but a shelved or finished journey
  // should never outrank one you are still planning, however close it is.
  const today = new Date().toISOString().slice(0, 10);
  const isShelved = (j: JourneySummary) =>
    j.archived || (j.end_date != null && j.end_date < today);

  const ranked = picked
    ? [...journeys]
        .map((j) => ({
          j,
          shelved: isShelved(j),
          km:
            j.destination_lat != null && j.destination_lng != null
              ? distanceKm(picked.lat, picked.lng, j.destination_lat, j.destination_lng)
              : Number.POSITIVE_INFINITY,
        }))
        .sort((a, b) => (a.shelved === b.shelved ? a.km - b.km : a.shelved ? 1 : -1))
    : [];

  const choose = async (p: Prediction) => {
    setBusy(true);
    setError(null);
    const place = await fetchPlaceDetails(p.place_id, token.current);
    setBusy(false);
    if (!place) {
      setError("Couldn't read that place back from Google. Pick another.");
      return;
    }
    setPicked(place);
    setStep("target");
  };

  const pinTo = async (j: JourneySummary) => {
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
    const res = await pinPlaceToJourney(supabase, user.id, j.id, picked, ideaUrl);
    if (!res.ok) {
      setError(res.message);
      setBusy(false);
      return;
    }
    const names = res.duplicate ? addedNames : [...addedNames, res.placeName];
    if (!res.duplicate) {
      await supabase
        .from("ideas")
        .update({ pins_added: names.length, pinned_trip_id: j.id })
        .eq("id", ideaId);
    }
    setAddedNames(names);
    setAddedTo(j);
    setDuplicate(res.duplicate ? res.placeName : null);
    setBusy(false);
    setStep("added");
  };

  const chooseWishlist = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    setStep("wishlist");

    const supabase = createClient();
    const { data: existing } = await supabase
      .from("wishlist_destinations")
      .select("id, name, lat, lng");
    const hit = (existing ?? []).find(
      (d: { name: string; lat: number | null; lng: number | null }) =>
        d.name.trim().toLowerCase() === picked.name.trim().toLowerCase() ||
        (d.lat != null &&
          d.lng != null &&
          Math.abs(d.lat - picked.lat) < 0.05 &&
          Math.abs(d.lng - picked.lng) < 0.05)
    );
    setDuplicate(hit ? hit.name : null);
    setClimate(await fetchClimate(picked.lat, picked.lng).catch(() => null));
    setBusy(false);
  };

  const commitWishlist = async () => {
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
    onDone({ kind: "wishlist", destinationId: data.id as string, name: data.name as string });
  };

  const startAnother = () => {
    setPicked(null);
    setPreds([]);
    setQuery("");
    setDuplicate(null);
    setError(null);
    setStep("search");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      {/* Capped and scrollable. With ten journeys the sheet simply grew past
          the top of the screen: the list was cut off with nothing to say so,
          and no way to tell whether you were seeing all of it. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[560px] rounded-t-2xl px-4 pt-3 pb-6 overflow-y-auto"
        style={{
          background: PARCHMENT,
          borderTop: `1px solid ${RULE}`,
          maxHeight: "85dvh",
          overscrollBehavior: "contain",
        }}
      >
        <div
          className="mx-auto mb-3.5"
          style={{ width: 34, height: 4, borderRadius: 2, background: "rgba(26,26,46,0.16)" }}
        />

        {step === "search" && (
          <>
            <p className="font-display italic text-[17px] mb-3" style={{ color: INK }}>
              {addedNames.length > 0 ? "What else is in this one?" : "Which place is this?"}
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
            {error && (
              <p className="text-[13px] mt-2" style={{ color: SIENNA }}>
                {error}
              </p>
            )}
          </>
        )}

        {step === "target" && picked && (
          <>
            {/* Stays put while the journey list scrolls under it — otherwise
                you lose sight of which place you are filing. */}
            <div className="sticky -top-3 -mx-4 px-4 pt-1 pb-2 z-10" style={{ background: PARCHMENT }}>
            <p className="font-display italic text-[17px]" style={{ color: INK }}>
              {picked.name}
            </p>
            <p className="text-[11.5px]" style={{ color: SOFT }}>
              {compactAddress(picked.address, picked.name)}
              {" · "}
              <button
                onClick={() => {
                  setPicked(null);
                  setQuery(initialQuery);
                  setPreds([]);
                  setStep("search");
                }}
                className="underline"
                style={{ color: CAPTION }}
              >
                Change
              </button>
            </p>
            </div>

            {ranked.map(({ j, km, shelved }, idx) => (
              <button
                key={j.id}
                onClick={() => pinTo(j)}
                disabled={busy}
                className="w-full text-left flex gap-3 items-start p-3 mb-1.5 rounded-xl"
                style={{
                  background: "#fff",
                  border: `1px solid ${idx === 0 && !shelved && km <= NEARBY_KM ? INK : RULE}`,
                }}
              >
                <span className="flex-1 min-w-0">
                  {/* Full ink, archived or not. Greying the title read as
                      "disabled" — Brennan thought an archived journey was being
                      refused when it was only being de-emphasised. The small
                      label is enough to say it is shelved. */}
                  <span className="block text-[13.5px]" style={{ color: INK }}>
                    {j.title}
                    {idx === 0 && !shelved && km <= NEARBY_KM && (
                      <span
                        className="ml-1.5 text-[9px] uppercase"
                        style={{ letterSpacing: "0.1em", color: SIENNA }}
                      >
                        nearby
                      </span>
                    )}
                    {shelved && (
                      <span
                        className="ml-1.5 text-[9px] uppercase"
                        style={{ letterSpacing: "0.1em", color: SOFT }}
                      >
                        {j.archived ? "archived" : "past"}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] mt-[1px]" style={{ color: SOFT }}>
                    Save as a pin on this journey
                  </span>
                </span>
              </button>
            ))}

            <button
              onClick={chooseWishlist}
              disabled={busy}
              className="w-full text-left flex gap-3 items-start p-3 mb-1.5 rounded-xl"
              style={{ background: "#fff", border: `1px solid ${RULE}` }}
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[13.5px]" style={{ color: INK }}>
                  Wishlist
                </span>
                <span className="block text-[11px] mt-[1px]" style={{ color: SOFT }}>
                  Track its weather through the year
                </span>
              </span>
            </button>

            {error && (
              <p className="text-[13px] mt-1" style={{ color: SIENNA }}>
                {error}
              </p>
            )}

            {/* Closes. It used to reset to the search box — which was a screen
                you had come *through* when the sheet always asked, and is a
                screen you have never seen now that the place resolves itself.
                Going "back" to somewhere you have never been is not back.
                Changing the place is what Change beside the address is for. */}
            <button
              onClick={onClose}
              className="mt-2 text-[13px]"
              style={{ color: CAPTION }}
            >
              Cancel
            </button>
          </>
        )}

        {step === "wishlist" && picked && (
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
                <Row label="Climate" value={busy ? "Fetching…" : climate ? "5 years, monthly" : "Unavailable"} />
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
                  onClick={commitWishlist}
                  disabled={busy}
                  className="flex-1 rounded-lg py-2.5 text-[14px]"
                  style={{ background: INK, color: PARCHMENT, opacity: busy ? 0.6 : 1 }}
                >
                  {busy ? "Saving…" : "Add to wishlist"}
                </button>
              )}
              <button
                onClick={() => { setDuplicate(null); setError(null); setStep("target"); }}
                className="rounded-lg py-2.5 px-4 text-[14px]"
                style={{ border: `1px solid ${RULE}`, color: CAPTION }}
              >
                Back
              </button>
            </div>
          </>
        )}

        {step === "added" && addedTo && (
          <>
            <p className="font-display italic text-[17px]" style={{ color: INK }}>
              Added to {addedTo.title}
            </p>
            <p className="text-[11.5px] mb-3" style={{ color: SOFT }}>
              From this idea
            </p>

            {addedNames.map((n) => (
              <div
                key={n}
                className="flex justify-between gap-3 py-1.5 text-[13px]"
                style={{ borderBottom: `1px solid ${RULE}`, color: INK }}
              >
                <span>{n}</span>
              </div>
            ))}

            {duplicate && (
              <p className="text-[13px] mt-2.5" style={{ color: SOFT }}>
                {duplicate} was already on this journey.
              </p>
            )}

            <button
              onClick={startAnother}
              className="w-full rounded-lg py-2.5 mt-4 text-[14px]"
              style={{ background: INK, color: PARCHMENT }}
            >
              Add another from this idea
            </button>
            <button
              onClick={() =>
                onDone({
                  kind: "pins",
                  tripId: addedTo.id,
                  tripTitle: addedTo.title,
                  count: addedNames.length,
                })
              }
              className="w-full rounded-lg py-2.5 mt-2 text-[14px]"
              style={{ border: `1px solid ${RULE}`, color: CAPTION }}
            >
              Done
            </button>
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
