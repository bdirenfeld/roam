"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MagnifyingGlass, CircleNotch, X, MapPin } from "@phosphor-icons/react";

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
}

export default function PlaceSearch({ onPlaceSelect, destination }: Props) {
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
          <MagnifyingGlass size={15} weight="light" color="#9CA3AF" className="flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-[13px] text-gray-900 placeholder:text-gray-400 outline-none"
          />
          {loading && (
            <CircleNotch size={16} weight="light" className="text-gray-400 animate-spin flex-shrink-0" />
          )}
          {query && !loading && (
            <button
              onClick={() => { setQuery(""); clearPredictions(); }}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X size={13} weight="light" />
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
                    <MapPin size={13} weight="light" color="#6B7280" />
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
