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
  /** Called when the user selects a prediction; search bar closes itself. */
  onPlaceSelect: (placeId: string, sessionToken: string) => void;
}

export default function PlaceSearch({ onPlaceSelect }: Props) {
  const [expanded, setExpanded]       = useState(false);
  const [query, setQuery]             = useState("");
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading]         = useState(false);

  const inputRef      = useRef<HTMLInputElement>(null);
  const debounceRef   = useRef<ReturnType<typeof setTimeout>>();
  const sessionToken  = useRef(crypto.randomUUID());

  // ── Close / reset ──────────────────────────────────────────
  const close = useCallback(() => {
    setExpanded(false);
    setQuery("");
    setPredictions([]);
    setLoading(false);
    clearTimeout(debounceRef.current);
    sessionToken.current = crypto.randomUUID(); // fresh token per session
  }, []);

  // ── Escape key ─────────────────────────────────────────────
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [expanded, close]);

  // ── Auto-focus on expand ───────────────────────────────────
  useEffect(() => {
    if (expanded) setTimeout(() => inputRef.current?.focus(), 60);
  }, [expanded]);

  // ── Debounced autocomplete ─────────────────────────────────
  useEffect(() => {
    if (!expanded) return;
    clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setPredictions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(query)}&sessiontoken=${sessionToken.current}`,
        );
        const data = await res.json();
        setPredictions(data.predictions ?? []);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query, expanded]);

  function handleSelect(prediction: Prediction) {
    const token = sessionToken.current;
    close();
    onPlaceSelect(prediction.place_id, token);
  }

  // ── Collapsed: search icon button ─────────────────────────
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="absolute top-4 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center"
        style={{ right: 52, backdropFilter: "blur(8px)", zIndex: 10 }}
        aria-label="Search places"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    );
  }

  // ── Expanded: search bar + dropdown ───────────────────────
  return (
    <>
      {/* Tap-outside backdrop */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 19 }}
        onClick={close}
      />

      {/* Search bar */}
      <div
        className="absolute top-0 left-0 right-0 px-4 pt-3 pb-2 animate-in slide-in-from-top-2 duration-200"
        style={{ zIndex: 20, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-2">
          {/* Input pill */}
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-xl px-3 h-10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search restaurants, cafés, museums…"
              className="flex-1 bg-transparent text-[14px] text-gray-900 placeholder:text-gray-400 outline-none"
            />
            {loading && (
              <svg className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
              </svg>
            )}
            {query && !loading && (
              <button onClick={() => setQuery("")} className="flex-shrink-0 text-gray-400 hover:text-gray-600">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={close}
            className="flex-shrink-0 text-[13px] font-medium text-gray-500 hover:text-gray-800 px-1 transition-colors"
          >
            Cancel
          </button>
        </div>

        {/* Autocomplete dropdown */}
        {predictions.length > 0 && (
          <div className="mt-2 bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.10)" }}>
            {predictions.map((p, i) => (
              <button
                key={p.place_id}
                onClick={() => handleSelect(p)}
                className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${
                  i < predictions.length - 1 ? "border-b border-gray-50" : ""
                }`}
              >
                {/* Pin icon */}
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-900 leading-snug truncate">
                    {p.structured_formatting.main_text}
                  </p>
                  {p.structured_formatting.secondary_text && (
                    <p className="text-[12px] text-gray-400 leading-snug truncate mt-0.5">
                      {p.structured_formatting.secondary_text}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
