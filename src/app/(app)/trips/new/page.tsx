"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AppHeader from "@/components/ui/AppHeader";
import { createClient } from "@/lib/supabase/client";
import { CaretLeft, CircleNotch, Check, ArrowRight } from "@phosphor-icons/react";

interface DestinationPrediction {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text?: string;
  };
}

interface SelectedDestination {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
}

function suggestTripName(cityName: string, startDate: string): string {
  if (!cityName || !startDate) return "";
  const city = cityName.split(",")[0].trim();
  const [y, m] = startDate.split("-");
  const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-US", { month: "long" });
  return `${city} ${month} ${y}`;
}

export default function NewTripPage() {
  const router = useRouter();

  // Destination autocomplete
  const [destInput,       setDestInput]       = useState("");
  const [suggestions,     setSuggestions]     = useState<DestinationPrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [destination,     setDestination]     = useState<SelectedDestination | null>(null);
  const [loadingDetails,  setLoadingDetails]  = useState(false);
  const sessionToken = useRef(crypto.randomUUID());
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form fields
  const [tripName,      setTripName]      = useState("");
  const [tripNameDirty, setTripNameDirty] = useState(false);
  const [startDate,     setStartDate]     = useState("");
  const [endDate,       setEndDate]       = useState("");
  const [partySize,     setPartySize]     = useState(1);
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);

  // Auto-suggest trip name when destination or start date changes (unless edited)
  useEffect(() => {
    if (!tripNameDirty && destination && startDate) {
      setTripName(suggestTripName(destination.name, startDate));
    }
  }, [destination, startDate, tripNameDirty]);

  // Debounced city autocomplete
  useEffect(() => {
    if (destInput.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(destInput)}&sessiontoken=${sessionToken.current}&types=(cities)`,
        );
        const data = await res.json() as { predictions?: DestinationPrediction[] };
        setSuggestions(data.predictions ?? []);
        setShowSuggestions(true);
      } catch { /* ignore */ }
    }, 300);
  }, [destInput]);

  const handleSelectSuggestion = useCallback(async (p: DestinationPrediction) => {
    setDestInput(p.description);
    setSuggestions([]);
    setShowSuggestions(false);
    setLoadingDetails(true);
    try {
      const res  = await fetch(
        `/api/places/details?place_id=${encodeURIComponent(p.place_id)}&sessiontoken=${sessionToken.current}`,
      );
      const data = await res.json() as { result?: { geometry?: { location?: { lat: number; lng: number } } } };
      if (data.result?.geometry?.location) {
        setDestination({
          name:    p.description,
          placeId: p.place_id,
          lat:     data.result.geometry.location.lat,
          lng:     data.result.geometry.location.lng,
        });
        sessionToken.current = crypto.randomUUID(); // renew after session completes
      }
    } catch { /* ignore */ } finally {
      setLoadingDetails(false);
    }
  }, []);

  const isValid = !!destination && !!tripName.trim() && !!startDate && !!endDate && endDate >= startDate;

  const handleCreate = useCallback(async () => {
    if (!isValid || saving || !destination) return;
    setSaving(true);
    setSaveError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setSaveError("Not signed in");
      return;
    }

    const tripId = crypto.randomUUID();

    const { error: tripErr } = await supabase.from("trips").insert({
      id:              tripId,
      user_id:         user.id,
      title:           tripName.trim(),
      destination:     destination.name,
      destination_lat: destination.lat,
      destination_lng: destination.lng,
      start_date:      startDate,
      end_date:        endDate,
      party_size:      partySize,
      status:          "planning",
    });

    if (tripErr) {
      setSaving(false);
      setSaveError("Couldn't create trip — please try again.");
      return;
    }

    // Generate a Day row for each date in the range
    const days: { id: string; trip_id: string; date: string; day_number: number }[] = [];
    const startMs = new Date(startDate + "T00:00:00").getTime();
    const endMs   = new Date(endDate   + "T00:00:00").getTime();
    const dayMs   = 86400000;
    for (let ms = startMs, n = 1; ms <= endMs; ms += dayMs, n++) {
      days.push({
        id:         crypto.randomUUID(),
        trip_id:    tripId,
        date:       new Date(ms).toISOString().slice(0, 10),
        day_number: n,
      });
    }
    if (days.length > 0) {
      await supabase.from("days").insert(days);
    }

    // Fire-and-forget: fetch Unsplash cover in background (navigates immediately)
    fetch("/api/trips/fetch-cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId }),
    }).catch(() => { /* ignore */ });

    router.push(`/trips/${tripId}/map`);
  }, [isValid, saving, destination, tripName, startDate, endDate, partySize, router]);

  return (
    <div className="min-h-dvh bg-white">
      <AppHeader />

      <div className="max-w-mobile mx-auto px-4 pt-4 pb-24">
        <Link
          href="/trips"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 font-medium mb-6 hover:text-gray-600 transition-colors"
        >
          <CaretLeft size={14} weight="light" />
          Back
        </Link>

        <h1 className="font-display font-light text-[22px] text-gray-900 mb-7">Plan a journey</h1>

        <div className="space-y-6">

          {/* ── Destination ─────────────────────────────────── */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              Where are you going?
            </label>
            <div className="relative">
              <input
                type="text"
                value={destInput}
                onChange={(e) => {
                  setDestInput(e.target.value);
                  if (destination && e.target.value !== destination.name) setDestination(null);
                }}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder="Rome, Italy"
                autoComplete="off"
                className="w-full px-3.5 py-3 text-[15px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:bg-white transition-colors placeholder:text-gray-300"
              />
              {/* Status indicator */}
              <div className="absolute right-3 top-3.5 pointer-events-none">
                {loadingDetails && (
                  <CircleNotch size={14} weight="light" color="#9CA3AF" className="animate-spin" />
                )}
                {destination && !loadingDetails && (
                  <Check size={16} weight="light" color="#0D9488" />
                )}
              </div>

              {/* Suggestions dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <>
                  <div className="fixed inset-0 z-10" onPointerDown={() => setShowSuggestions(false)} />
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-sheet border border-gray-100 overflow-hidden">
                    {suggestions.map((s) => (
                      <button
                        key={s.place_id}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <p className="text-[13px] font-semibold text-gray-900 leading-tight">
                          {s.structured_formatting?.main_text ?? s.description.split(",")[0]}
                        </p>
                        {s.structured_formatting?.secondary_text && (
                          <p className="text-[11px] text-gray-400 mt-0.5">{s.structured_formatting.secondary_text}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Trip name ────────────────────────────────────── */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              Trip name
            </label>
            <input
              type="text"
              value={tripName}
              onChange={(e) => { setTripName(e.target.value); setTripNameDirty(true); }}
              placeholder="e.g. Rome April 2026"
              className="w-full px-3.5 py-3 text-[15px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:bg-white transition-colors placeholder:text-gray-300"
            />
          </div>

          {/* ── Dates ───────────────────────────────────────── */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              When?
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate && e.target.value > endDate) setEndDate("");
                }}
                className="flex-1 px-3 py-3 text-[14px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:bg-white transition-colors"
              />
              <ArrowRight size={14} weight="light" color="#9CA3AF" className="flex-shrink-0" />
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 px-3 py-3 text-[14px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* ── Party size ───────────────────────────────────── */}
          <div>
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">
              Who&apos;s coming?
            </label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setPartySize((v) => Math.max(1, v - 1))}
                disabled={partySize <= 1}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-[20px] font-medium text-gray-600 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-30"
                aria-label="Decrease"
              >
                −
              </button>
              <span className="text-[20px] font-bold text-gray-900 w-8 text-center tabular-nums">
                {partySize}
              </span>
              <button
                onClick={() => setPartySize((v) => v + 1)}
                className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-[20px] font-medium text-gray-600 hover:bg-gray-200 active:scale-95 transition-all"
                aria-label="Increase"
              >
                +
              </button>
              <span className="text-[13px] text-gray-400">
                {partySize === 1 ? "traveller" : "travellers"}
              </span>
            </div>
          </div>

        </div>

        {saveError && (
          <p className="mt-4 text-[13px] font-medium text-red-500">{saveError}</p>
        )}

        {/* Create button */}
        <div className="mt-8">
          <button
            onClick={handleCreate}
            disabled={!isValid || saving}
            className={`w-full py-4 rounded-2xl text-[16px] font-bold transition-all ${
              isValid && !saving
                ? "bg-activity text-white hover:opacity-80 active:scale-[0.99] shadow-sm"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            }`}
          >
            {saving ? "Creating trip…" : "Create Trip"}
          </button>
        </div>
      </div>
    </div>
  );
}
