"use client";

// ── A share from TikTok or Instagram, straight onto the map ──────────────
//
// Brennan, 26 Sep 2026: "cut out all the middle steps". The share used to land
// in Ideas, which then had to be sorted, named, and put on a journey. Now:
// type the place (or tap the one read from the TikTok caption), tap it, and
// you are on that journey's map with the new pin open — its card has Put on
// a day — and an Undo. When no journey is near the place, one list asks
// where it goes.
//
// Mocked and agreed as a tap-through prototype first:
// https://claude.ai/artifact/LbU5wJTRTRyppJimMNbtXh

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import {
  fetchPredictions,
  fetchPlaceDetails,
  predMain,
  predSecondary,
} from "@/lib/places/predictions";
import type { Prediction, ResolvedPlace } from "@/lib/places/predictions";
import { pinPlaceToJourney } from "@/lib/wishlist/pinToJourney";
import { fetchClimate, compactAddress } from "@/lib/wishlist/climate";
import { nearbyJourney, rankJourneys } from "@/lib/share/journeys";
import type { ShareJourney } from "@/lib/share/journeys";
import { isTikTok } from "@/lib/share/caption";

interface Suggestion {
  placeId: string;
  name: string;
  address: string;
}

/** A row in the results — the map search's own dropdown row, so the two read
 *  as one control. */
function PlaceRow({ main, sub, onClick, disabled }: { main: string; sub?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-start gap-3 px-4 py-3 active:bg-gray-100 transition-colors text-left border-b border-gray-50"
    >
      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-gray-900 leading-snug truncate">{main}</span>
        {sub && <span className="block text-[12.5px] text-gray-400 leading-snug truncate mt-0.5">{sub}</span>}
      </div>
    </button>
  );
}

export default function ShareCatchClient({
  link,
  caption,
  journeys,
  wishlist,
  choose,
}: {
  link: string | null;
  caption: string | null;
  journeys: ShareJourney[];
  /** Whether this person has a Wishlist to save to. */
  wishlist: boolean;
  /** Google place id — set when Undo sent you back to choose again. */
  choose: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [preds, setPreds] = useState<Prediction[]>([]);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
  );

  // Back from Undo: the place is known, so go straight to the list.
  useEffect(() => {
    if (!choose) return;
    let cancelled = false;
    setBusy(true);
    fetchPlaceDetails(choose, token.current).then((p) => {
      if (cancelled) return;
      setBusy(false);
      if (p) setPlace(p);
    });
    return () => { cancelled = true; };
  }, [choose]);

  // TikTok only: read the caption for the place it is about. A suggestion,
  // shown as the first row; typing replaces it.
  useEffect(() => {
    if (choose || !isTikTok(link)) return;
    let cancelled = false;
    fetch(`/api/share/suggest?url=${encodeURIComponent(link!)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { suggestion?: Suggestion | null } | null) => {
        if (!cancelled && d?.suggestion) setSuggestion(d.suggestion);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [link, choose]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setPreds([]); return; }
    const t = setTimeout(async () => setPreds(await fetchPredictions(q, token.current)), 220);
    return () => clearTimeout(t);
  }, [query]);

  /** This screen again, for the same share — with a place to choose for when
   *  Undo brings you back, without one to search afresh. */
  const backHere = (placeId?: string) => {
    const p = new URLSearchParams();
    if (link) p.set("url", link);
    if (caption) p.set("title", caption);
    if (placeId) p.set("choose", placeId);
    return `/share?${p}`;
  };

  const pick = async (placeId: string) => {
    setBusy(true);
    setError(null);
    const p = await fetchPlaceDetails(placeId, token.current);
    if (!p) {
      setBusy(false);
      setError("Couldn't load that place. Try again.");
      return;
    }
    const near = nearbyJourney(journeys, p.lat, p.lng);
    if (near) return saveToJourney(p, near);
    setPlace(p);
    setBusy(false);
  };

  const saveToJourney = async (p: ResolvedPlace, j: ShareJourney) => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); setError("You're signed out. Sign in and try again."); return; }
    const res = await pinPlaceToJourney(supabase, user.id, j.id, p, link);
    if (!res.ok) { setBusy(false); setError(res.message); return; }
    router.replace(`/trips/${j.id}/map?pin=${res.cardId}`);
    if (res.duplicate) {
      toast({ message: `Already on ${j.title}` });
      return;
    }
    toast({
      message: `${p.name} · ${j.title}`,
      undo: async () => {
        await supabase.from("cards").delete().eq("id", res.cardId);
        router.push(backHere(p.placeId));
      },
    });
  };

  const saveToWishlist = async (p: ResolvedPlace) => {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); setError("You're signed out. Sign in and try again."); return; }
    const { data: existing } = await supabase.from("wishlist_destinations").select("id, name, lat, lng");
    const hit = (existing ?? []).find(
      (d: { name: string; lat: number | null; lng: number | null }) =>
        d.name.trim().toLowerCase() === p.name.trim().toLowerCase() ||
        (d.lat != null && d.lng != null && Math.abs(d.lat - p.lat) < 0.05 && Math.abs(d.lng - p.lng) < 0.05),
    );
    if (hit) {
      router.replace("/trips?year=1");
      toast({ message: `${hit.name} is already on your Wishlist` });
      return;
    }
    const climate = await fetchClimate(p.lat, p.lng).catch(() => null);
    const { data, error: insErr } = await supabase
      .from("wishlist_destinations")
      .insert({
        user_id: user.id,
        name: p.name,
        location: compactAddress(p.address, p.name),
        lat: p.lat,
        lng: p.lng,
        drive_hours: null,
        budget: null,
        best_time: null,
        why: null,
        source: "share",
        climate,
      })
      .select("id")
      .single();
    if (insErr || !data) { setBusy(false); setError("Couldn't save it. Try again."); return; }
    router.replace("/trips?year=1");
    toast({
      message: `${p.name} · Wishlist`,
      undo: async () => {
        await supabase.from("wishlist_destinations").delete().eq("id", data.id);
        router.push(backHere(p.placeId));
      },
    });
  };

  // ── Where does it go? Only when no journey is near the place, or after Undo.
  if (place) {
    const ranked = rankJourneys(journeys, place.lat, place.lng);
    const rowClass = "block w-full text-left px-4 py-3.5 text-[15px] text-gray-900 border-t border-gray-100 active:bg-gray-50 disabled:opacity-50";
    return (
      <div className="min-h-screen bg-white" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <div className="mx-auto w-full max-w-[520px]">
          <h1 className="font-display text-[22px] text-gray-900 px-4 pt-2 pb-3 leading-tight">{place.name}</h1>
          {ranked.map(({ journey }) => (
            <button key={journey.id} className={rowClass} disabled={busy} onClick={() => saveToJourney(place, journey)}>
              {journey.title}
            </button>
          ))}
          {wishlist && (
            <button className={rowClass} disabled={busy} onClick={() => saveToWishlist(place)}>
              Wishlist
            </button>
          )}
          {ranked.length === 0 && !wishlist && (
            <button className={rowClass} onClick={() => router.push("/trips/new")}>
              Plan a journey
            </button>
          )}
          <button
            className={`${rowClass} text-gray-400`}
            disabled={busy}
            onClick={() => { setPlace(null); setQuery(""); if (choose) router.replace(backHere()); }}
          >
            A different place
          </button>
          {error && <p className="px-4 pt-3 text-[13px]" style={{ color: "#B0541F" }}>{error}</p>}
        </div>
      </div>
    );
  }

  // ── Which place? The map's search, full screen, keyboard up.
  const showSuggestion = suggestion && query.trim().length < 2;
  return (
    <div className="min-h-screen bg-white" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
      <div className="mx-auto w-full max-w-[520px]">
        <div className="px-4 pb-2">
          <div
            className="flex items-center gap-2 bg-white rounded-full px-4 h-11 border border-gray-100"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              enterKeyHint="search"
              placeholder="Search places…"
              aria-label="Which place is this?"
              className="flex-1 bg-transparent text-[16px] text-gray-900 placeholder:text-gray-400 outline-none"
            />
            {busy && (
              <svg className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none" aria-label="Saving">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
              </svg>
            )}
          </div>
        </div>

        <div>
          {showSuggestion && (
            <PlaceRow
              main={suggestion.name}
              sub={compactAddress(suggestion.address, suggestion.name)}
              disabled={busy}
              onClick={() => pick(suggestion.placeId)}
            />
          )}
          {!showSuggestion &&
            preds.map((p) => (
              <PlaceRow key={p.place_id} main={predMain(p)} sub={predSecondary(p) || undefined} disabled={busy} onClick={() => pick(p.place_id)} />
            ))}
        </div>

        {error && <p className="px-4 pt-3 text-[13px]" style={{ color: "#B0541F" }}>{error}</p>}
      </div>
    </div>
  );
}
