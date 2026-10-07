"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { pastedSocialLink, shareHref, wantsPasteRow } from "@/lib/share/pasted";

interface Prediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface Props {
  onPlaceSelect: (placeId: string, sessionToken: string) => void;
  destination?: string;
  lat?: number | null;
  lng?: number | null;
  /** Where the pill sits; the week's map passes its own. */
  positionClassName?: string;
  /**
   * Where the map is looking right now, read when a search runs (27 Sep
   * 2026): "day camp" on a Europe summer searched around the continent's
   * centre point. Beats lat/lng when it answers.
   */
  getBias?: () => { lat: number; lng: number } | null;
  /** The journey's countries: their results lead (27 Sep 2026). */
  countries?: string[];
  /** Google ids already pinned on this journey: their rows say "On your map"
   *  (6 Oct 2026, taps audit). The host decides what a tap on one does. */
  savedPlaceIds?: Set<string>;
}

export default function PlaceSearch({ onPlaceSelect, destination, lat, lng, positionClassName, getBias, countries, savedPlaceIds }: Props) {
  const [query, setQuery]             = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading]         = useState(false);
  // iPhone share by paste (5 Oct 2026): a row under the empty, focused search.
  const router = useRouter();
  const [focused, setFocused]         = useState(false);
  const [pasteRow, setPasteRow]       = useState(false);
  const [pasteMiss, setPasteMiss]     = useState(false);
  useEffect(() => { setPasteRow(wantsPasteRow(navigator.userAgent)); }, []);
  const goShare = useCallback((text: string | null | undefined) => {
    const link = pastedSocialLink(text);
    if (!link) return false;
    router.push(shareHref(link.url));
    return true;
  }, [router]);
  const pasteFromClipboard = async () => {
    setPasteMiss(false);
    try {
      // On iPhone this shows the system Paste button first.
      const text = await navigator.clipboard.readText();
      if (!goShare(text)) setPasteMiss(true);
    } catch {
      setPasteMiss(true);
    }
  };
  const showPasteRow = pasteRow && focused && !query;

  const inputRef     = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout>>();
  const sessionToken = useRef(crypto.randomUUID());

  const clearPredictions = useCallback(() => {
    setPredictions([]);
    clearTimeout(debounceRef.current);
    sessionToken.current = crypto.randomUUID();
  }, []);

  // ── Escape key to clear ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setQuery(""); clearPredictions(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [clearPredictions]);

  // ── Debounced autocomplete ─────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setPredictions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          input: query,
          sessiontoken: sessionToken.current,
        });
        const bias = getBias?.() ?? (lat != null && lng != null ? { lat, lng } : null);
        if (bias) {
          params.set("lat", String(bias.lat));
          params.set("lng", String(bias.lng));
        }
        if (countries?.length) params.set("countries", countries.join("|"));
        const res  = await fetch(`/api/places/autocomplete?${params.toString()}`);
        const data = await res.json();
        setPredictions(data.predictions ?? []);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  function handleSelect(prediction: Prediction) {
    const token = sessionToken.current;
    setQuery("");
    clearPredictions();
    onPlaceSelect(prediction.place_id, token);
  }

  const placeholder = destination ? `Search places in ${destination}…` : "Search places…";

  return (
    <>
      {/* Tap-outside backdrop when dropdown is open */}
      {predictions.length > 0 && (
        <div
          className="absolute inset-0"
          style={{ zIndex: 19 }}
          onClick={clearPredictions}
        />
      )}

      {/* Always-visible search bar */}
      <div
        // Phone: between the back and menu discs, on their 36px row. Desktop
        // unchanged.
        className={positionClassName ?? "absolute top-3 left-[60px] right-[60px] md:top-4 md:left-6 md:right-6 md:max-w-md"}
        style={{ zIndex: 20 }}
      >
        {/* Input pill */}
        <div
          className="flex items-center gap-2 bg-white rounded-full md:rounded-xl px-3 h-9 md:h-10 border border-gray-100"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { setFocused(true); setPasteMiss(false); }}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            onPaste={(e) => { if (goShare(e.clipboardData.getData("text"))) e.preventDefault(); }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 outline-none"
          />
          {loading && (
            <svg className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
            </svg>
          )}
          {query && !loading && (
            <button
              onClick={() => { setQuery(""); clearPredictions(); }}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {showPasteRow && (
          <div className="mt-1.5 bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.10)" }}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={pasteFromClipboard}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 text-left"
              data-testid="paste-link-row"
            >
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
              </div>
              <span className="block text-[13px] font-medium text-gray-900 leading-snug">Paste a TikTok or Instagram link</span>
            </button>
            {pasteMiss && (
              <p className="px-4 pb-3 -mt-1 text-[12px] text-gray-500">In TikTok or Instagram, tap Share, then Copy link, and try again.</p>
            )}
          </div>
        )}

        {/* Autocomplete dropdown */}
        {predictions.length > 0 && (
          <ul
            role="listbox"
            className="mt-1.5 bg-white rounded-xl border border-gray-100 overflow-hidden"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.10)" }}
          >
            {predictions.map((p, i) => {
              const onMap = savedPlaceIds?.has(p.place_id) ?? false;
              return (
              <li key={p.place_id} role="option" aria-selected="false">
                <button
                  onClick={() => handleSelect(p)}
                  className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${
                    i < predictions.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  {onMap ? (
                    /* Already pinned (6 Oct 2026, taps audit): a filled teal
                       pin, the same mark the map draws. */
                    <div data-testid="on-map-pin" className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#0D9488" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      </svg>
                    </div>
                  ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-gray-900 leading-snug truncate">
                      {p.structured_formatting.main_text}
                    </span>
                    {p.structured_formatting.secondary_text && (
                      <span className="block text-[12px] text-gray-400 leading-snug truncate mt-0.5">
                        {p.structured_formatting.secondary_text}
                      </span>
                    )}
                    {onMap && (
                      <span className="block text-[12px] font-medium leading-snug mt-0.5" style={{ color: "#0F766E" }}>
                        On your map
                      </span>
                    )}
                  </div>
                </button>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
