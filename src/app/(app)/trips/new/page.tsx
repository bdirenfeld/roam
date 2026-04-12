"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

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

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function countDays(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function buildCalendarDays(year: number, month: number): Array<string | null> {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  return cells;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

  // Cover image
  const [coverError, setCoverError] = useState(false);

  // Form fields
  const [tripName,      setTripName]      = useState("");
  const [tripNameDirty, setTripNameDirty] = useState(false);
  const [startDate,     setStartDate]     = useState("");
  const [endDate,       setEndDate]       = useState("");
  const [partySize,     setPartySize]     = useState(1);
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calYear,  setCalYear]  = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [pickStart, setPickStart] = useState<string | null>(null);
  const [pickEnd,   setPickEnd]   = useState<string | null>(null);
  const [pickPhase, setPickPhase] = useState<"start" | "end">("start");

  // Auto-suggest trip name when destination or start date changes
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
    setCoverError(false);
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
        sessionToken.current = crypto.randomUUID();
      }
    } catch { /* ignore */ } finally {
      setLoadingDetails(false);
    }
  }, []);

  // Cover source — Mapbox satellite once a destination with coords is selected
  const coverSrc =
    !coverError && MAPBOX_TOKEN && destination
      ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${destination.lng},${destination.lat},12,0/800x200@2x?access_token=${MAPBOX_TOKEN}`
      : null;

  // Dates display
  const dateRangeDisplay = startDate && endDate
    ? `${fmtDate(startDate)} → ${fmtDate(endDate)}`
    : startDate
    ? `${fmtDate(startDate)} → …`
    : "Select dates";
  const nightCount = startDate && endDate ? Math.max(0, countDays(startDate, endDate) - 1) : null;

  // Calendar picker helpers
  const openDatePicker = () => {
    if (startDate) {
      const d = new Date(startDate + "T00:00:00");
      setCalYear(d.getFullYear());
      setCalMonth(d.getMonth());
    } else {
      setCalYear(new Date().getFullYear());
      setCalMonth(new Date().getMonth());
    }
    setPickStart(startDate || null);
    setPickEnd(endDate || null);
    setPickPhase("start");
    setShowDatePicker(true);
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  };

  const handleDayClick = (dateStr: string) => {
    if (pickPhase === "start") {
      setPickStart(dateStr);
      setPickEnd(null);
      setPickPhase("end");
    } else {
      if (pickStart && dateStr < pickStart) {
        setPickStart(dateStr);
        setPickEnd(null);
      } else {
        setPickEnd(dateStr);
        setPickPhase("start");
      }
    }
  };

  const handleDateDone = () => {
    if (pickStart) setStartDate(pickStart);
    if (pickEnd) setEndDate(pickEnd);
    else if (pickStart) setEndDate(pickStart);
    setShowDatePicker(false);
  };

  const calCells = buildCalendarDays(calYear, calMonth);
  const calNights = pickStart && pickEnd ? Math.max(0, countDays(pickStart, pickEnd) - 1) : null;
  const calSummary = pickStart && pickEnd
    ? `${fmtDate(pickStart)} → ${fmtDate(pickEnd)} · ${calNights} night${calNights !== 1 ? "s" : ""}`
    : pickStart
    ? `${fmtDate(pickStart)} → …`
    : "Select start date";

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
      setSaveError("Couldn't create journey — please try again.");
      return;
    }

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

    fetch("/api/trips/fetch-cover", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ trip_id: tripId }),
    }).catch(() => { /* ignore */ });

    router.push(`/trips/${tripId}/map`);
  }, [isValid, saving, destination, tripName, startDate, endDate, partySize, router]);

  return (
    <div className="flex flex-col min-h-dvh bg-white">

      {/* Sticky header */}
      <div className="flex items-center h-11 border-b border-gray-100 flex-shrink-0 relative bg-white sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="absolute left-0 right-0 text-center text-[16px] font-display italic text-gray-900 pointer-events-none">
          Plan a journey
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto pb-24">

        {/* Cover hero */}
        <div className="relative w-full h-[100px] overflow-hidden flex-shrink-0">
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverSrc}
              alt="Destination"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setCoverError(true)}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-stone-200 to-stone-100" />
          )}
        </div>

        {/* Inline field rows */}
        <div className="mt-2">

          {/* Name */}
          <div className="flex items-center px-5 py-[14px] border-b border-black/5">
            <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0">
              Name
            </span>
            <input
              type="text"
              value={tripName}
              onChange={(e) => { setTripName(e.target.value); setTripNameDirty(true); }}
              placeholder="Journey name"
              className="flex-1 text-[14px] text-[#1A1A2E] bg-transparent outline-none placeholder:text-gray-300"
            />
          </div>

          {/* Destination */}
          <div className="flex items-center px-5 py-[14px] border-b border-black/5 relative">
            <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0">
              Destination
            </span>
            <input
              type="text"
              value={destInput}
              onChange={(e) => {
                setDestInput(e.target.value);
                if (destination && e.target.value !== destination.name) {
                  setDestination(null);
                  setCoverError(false);
                }
              }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              placeholder="City, Country"
              autoComplete="off"
              className="flex-1 text-[14px] text-[#1A1A2E] bg-transparent outline-none placeholder:text-gray-300"
            />
            <div className="ml-2 flex-shrink-0 w-4 flex items-center justify-center">
              {loadingDetails && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" className="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
              {destination && !loadingDetails && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
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

          {/* Dates */}
          <button
            onClick={openDatePicker}
            className="w-full flex items-center px-5 py-[14px] border-b border-black/5 text-left"
          >
            <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0">
              Dates
            </span>
            <span className={`flex-1 text-[14px] ${startDate ? "text-[#1A1A2E]" : "text-gray-300"}`}>
              {dateRangeDisplay}
            </span>
            {nightCount !== null && (
              <span className="text-[11px] text-gray-400 flex-shrink-0">
                {nightCount} night{nightCount !== 1 ? "s" : ""}
              </span>
            )}
          </button>

          {/* Travellers */}
          <div className="flex items-center px-5 py-[14px] border-b border-black/5">
            <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0">
              Travellers
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPartySize((v) => Math.max(1, v - 1))}
                disabled={partySize <= 1}
                className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[14px] leading-none disabled:opacity-30 active:scale-90 transition-transform"
                aria-label="Decrease"
              >
                −
              </button>
              <span className="text-[14px] text-[#1A1A2E] tabular-nums w-4 text-center">
                {partySize}
              </span>
              <button
                onClick={() => setPartySize((v) => v + 1)}
                className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[14px] leading-none active:scale-90 transition-transform"
                aria-label="Increase"
              >
                +
              </button>
            </div>
          </div>

        </div>

        {saveError && (
          <div className="mx-5 mt-3 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-[13px] text-red-600 font-medium">{saveError}</p>
          </div>
        )}

        {/* Create button */}
        <div className="px-5 mt-6">
          <button
            onClick={handleCreate}
            disabled={!isValid || saving}
            className="w-full py-3 bg-[#1A1A2E] text-white text-[14px] font-semibold rounded-full disabled:opacity-40 active:scale-[0.99] transition-all"
          >
            {saving ? "Creating journey…" : "Plan this journey"}
          </button>
        </div>

      </div>

      {/* Date range picker sheet */}
      {showDatePicker && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => setShowDatePicker(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[60] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "90vh" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Sheet title */}
            <p className="text-center font-display italic text-base text-gray-900 pb-3 flex-shrink-0">
              Select dates
            </p>

            <div className="flex-1 overflow-y-auto px-4 pb-2">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="text-[14px] font-semibold text-gray-800">
                  {MONTHS[calMonth]} {calYear}
                </span>
                <button
                  onClick={nextMonth}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 mb-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div
                    key={i}
                    className="h-7 flex items-center justify-center text-[9px] text-gray-400 uppercase"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {calCells.map((dateStr, i) => {
                  if (!dateStr) return <div key={`e-${i}`} className="h-9" />;
                  const dayNum = parseInt(dateStr.split("-")[2]);
                  const isStartSel = dateStr === pickStart;
                  const isEndSel   = dateStr === pickEnd;
                  const isSelected = isStartSel || isEndSel;
                  const inRange    = !!(pickStart && pickEnd && dateStr > pickStart && dateStr < pickEnd);
                  return (
                    <div
                      key={dateStr}
                      className={`relative h-9 flex items-center justify-center ${inRange ? "bg-[#1A1A2E]/10" : ""}`}
                    >
                      <button
                        onClick={() => handleDayClick(dateStr)}
                        className={`w-8 h-8 flex items-center justify-center text-[13px] transition-colors ${
                          isSelected
                            ? "bg-[#1A1A2E] text-white rounded-md"
                            : "text-gray-800 hover:bg-gray-100 rounded-md"
                        }`}
                      >
                        {dayNum}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer — summary + Done */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-t border-gray-50">
              <p className="font-display italic text-[12px] text-gray-400 flex-1 pr-3">
                {calSummary}
              </p>
              <button
                onClick={handleDateDone}
                disabled={!pickStart || !pickEnd}
                className="bg-[#1A1A2E] text-white text-xs font-semibold rounded-full px-5 py-2 disabled:opacity-40 active:scale-95 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
