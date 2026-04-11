"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
}

export default function PlaceSearch({ onPlaceSelect, destination, lat, lng }: Props) {
  const [query, setQuery]             = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading]         = useState(false);

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
        if (lat != null && lng != null) {
          params.set("lat", String(lat));
          params.set("lng", String(lng));
        }
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
        className="absolute top-4 left-14 right-14"
        style={{ zIndex: 20 }}
      >
        {/* Input pill */}
        <div
          className="flex items-center gap-2 bg-white rounded-xl px-3 h-10 border border-gray-100"
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

        {/* Autocomplete dropdown */}
        {predictions.length > 0 && (
          <ul
            role="listbox"
            className="mt-1.5 bg-white rounded-xl border border-gray-100 overflow-hidden"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.10)" }}
          >
            {predictions.map((p, i) => (
              <li key={p.place_id} role="option" aria-selected="false">
                <button
                  onClick={() => handleSelect(p)}
                  className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${
                    i < predictions.length - 1 ? "border-b border-gray-50" : ""
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-gray-900 leading-snug truncate">
                      {p.structured_formatting.main_text}
                    </span>
                    {p.structured_formatting.secondary_text && (
                      <span className="block text-[12px] text-gray-400 leading-snug truncate mt-0.5">
                        {p.structured_formatting.secondary_text}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
