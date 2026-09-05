"use client";

// ── Plan a journey ────────────────────────────────────────────────────────
// The whole "Plan a journey" screen, with no opinion about where it is being
// rendered. /trips/new mounts it as a page (so a bookmark or a shared link
// still works); the New-journey overlay mounts the very same component over
// whatever the traveller was already looking at. There is exactly one copy of
// this form logic.
//
// Host contract (see components/ui/Overlay.tsx): a flex column — a
// flex-shrink-0 header, then a `flex-1 min-h-0 overflow-y-auto` body holding
// every text input, with deep bottom padding so a phone keyboard can never
// bottom out a field behind itself.

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { NESTED_SHEET_ATTR } from "@/components/ui/Overlay";
import type { NewJourneySeed } from "@/lib/newJourneySeed";
import {
  computeOpenWindows,
  isoOf,
  addDays,
} from "@/lib/yearView/openWindows";
import type { OpenWindow, TravelWindowRow } from "@/lib/yearView/openWindows";

const UNSPLASH_KEY = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;

// The user's journeys, read once when the picker opens so the verdict line
// can say "you're already going somewhere then".
interface PickerTrip {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  archived: boolean;
}

// Verdict tones — the same four-tone palette the year strip's heat row uses
const VERDICT_STYLE = {
  good: { bg: "#DCE8D4", fg: "#3F5D33" },
  mid:  { bg: "#EDE9D8", fg: "#6B6538" },
  bad:  { bg: "#F5DAD2", fg: "#93402A" },
} as const;

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

// ── Formatting helpers ────────────────────────────────────────────────────

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

// "Aug 18–29" inside one month, "Aug 28 – Sep 2" across two
function fmtRange(startIso: string, endIso: string): string {
  const a = new Date(startIso + "T00:00:00");
  const b = new Date(endIso + "T00:00:00");
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.toLocaleDateString("en-US", { month: "short" })} ${a.getDate()}–${b.getDate()}`
    : `${fmtDate(startIso)} – ${fmtDate(endIso)}`;
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

interface Props {
  /** Dates and/or destination handed over by a deep link or an in-app trigger. */
  seed?: NewJourneySeed | null;
  /**
   * Chrome only. "page" draws the standalone screen — full height, and the
   * desktop card measure around the form. "overlay" leaves both to the host,
   * which is already a card.
   */
  variant?: "page" | "overlay";
  /** Back / close. Defaults to router.back(). */
  onDismiss?: () => void;
  /** Called with the new journey's id and where to land (Day 1 of its
   *  Agenda). Defaults to navigating there. */
  onCreated?: (tripId: string, landing: string) => void;
}

export default function NewJourneyForm({
  seed = null,
  variant = "page",
  onDismiss,
  onCreated,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const overlay = variant === "overlay";

  const seededDates = seed?.start && seed?.end ? { start: seed.start, end: seed.end } : null;
  const seededDest =
    seed?.destDisplay && seed.destLat != null && seed.destLng != null
      ? { display: seed.destDisplay, lat: seed.destLat, lng: seed.destLng }
      : null;

  const dismiss = useCallback(() => {
    if (onDismiss) onDismiss();
    else router.back();
  }, [onDismiss, router]);

  // Destination autocomplete — pre-seeded from a deep link exactly as an
  // autocomplete pick would set it (display value + coords; no placeId, which
  // only feeds the details lookup). Still fully editable.
  const [destInput,       setDestInput]       = useState(seededDest?.display ?? "");
  const [suggestions,     setSuggestions]     = useState<DestinationPrediction[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  // The description just picked: the fetch below must not re-open the list
  // for it while the details call is still in flight.
  const lastPicked = useRef<string | null>(null);
  const [destination,     setDestination]     = useState<SelectedDestination | null>(
    seededDest
      ? { name: seededDest.display, placeId: "", lat: seededDest.lat, lng: seededDest.lng }
      : null
  );
  const [loadingDetails,  setLoadingDetails]  = useState(false);
  const sessionToken = useRef(crypto.randomUUID());
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cover state
  const [coverUrl,         setCoverUrl]         = useState<string | null>(null);
  const [coverError,       setCoverError]       = useState(false);
  const [fetchingCover,    setFetchingCover]    = useState(false);
  const [showCoverSheet,   setShowCoverSheet]   = useState(false);
  const [coverUrlInput,    setCoverUrlInput]    = useState("");
  const [coverPreviewError, setCoverPreviewError] = useState(false);

  // Form fields
  const [tripName,      setTripName]      = useState("");
  const [tripNameDirty, setTripNameDirty] = useState(false);
  const [startDate,     setStartDate]     = useState(seededDates?.start ?? "");
  const [endDate,       setEndDate]       = useState(seededDates?.end ?? "");
  const [partySize,     setPartySize]     = useState(1);
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState<string | null>(null);

  // Date picker state — the calendar opens on the seeded start month when
  // dates were handed over, otherwise on the current month
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calYear,  setCalYear]  = useState(() =>
    seededDates ? Number(seededDates.start.slice(0, 4)) : new Date().getFullYear()
  );
  const [calMonth, setCalMonth] = useState(() =>
    seededDates ? Number(seededDates.start.slice(5, 7)) - 1 : new Date().getMonth()
  );
  const [pickStart, setPickStart] = useState<string | null>(null);
  const [pickEnd,   setPickEnd]   = useState<string | null>(null);
  const [pickPhase, setPickPhase] = useState<"start" | "end">("start");

  // Planning context for the picker — the user's journeys (for the overlap
  // warning) and their saved ideal windows (which feed the quick chips
  // alongside the school/stat calendar). Fetched once, the first time the
  // picker opens; this is already a client component.
  const [pickerTrips,   setPickerTrips]   = useState<PickerTrip[]>([]);
  const [pickerWindows, setPickerWindows] = useState<TravelWindowRow[]>([]);
  const [pickerReady,   setPickerReady]   = useState(false);
  const pickerFetched = useRef(false);

  useEffect(() => {
    if (!showDatePicker || pickerFetched.current) return;
    pickerFetched.current = true;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      // RLS scopes both reads to the signed-in user
      const { data: tripRows } = await supabase
        .from("trips")
        .select("id, title, start_date, end_date, archived");
      // Undated journeys can't overlap anything — drop them at the door
      if (!cancelled && tripRows) {
        setPickerTrips(
          tripRows.filter((t): t is PickerTrip => !!t.start_date && !!t.end_date)
        );
      }
      try {
        const { data: winRows } = await supabase
          .from("travel_windows")
          .select("id, label, start_date, end_date")
          .order("start_date", { ascending: true });
        if (!cancelled && winRows) setPickerWindows(winRows as TravelWindowRow[]);
      } catch {
        // No saved windows is not an error — the school/stat chips stand alone
      }
      if (!cancelled) setPickerReady(true);
    })();
    return () => { cancelled = true; };
  }, [showDatePicker]);

  // Same rolling 12-month horizon the "Your year" strip plans against
  const todayStr = useMemo(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }, []);
  const { todayD, winEnd } = useMemo(() => {
    const now = new Date();
    return {
      todayD: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      winEnd: addDays(new Date(now.getFullYear(), now.getMonth() + 12, 1), -1),
    };
  }, []);

  const openWindows = useMemo(
    () => computeOpenWindows({ trips: pickerTrips, travelWindows: pickerWindows, todayD, winEnd }),
    [pickerTrips, pickerWindows, todayD, winEnd]
  );

  // Chips: EVERY open window in the rolling year, soonest first, in a
  // horizontal scroller. Capping at four hid most of the year — from late
  // August that left exactly one PA day and no March break, which reads as
  // missing data rather than a cap. Held back until the journeys read lands,
  // so a window a journey already covers never flashes up as free.
  const quickWindows = useMemo(
    () => (pickerReady ? openWindows : []),
    [pickerReady, openWindows]
  );

  // The chip strip scrolls by thumb on a phone; on desktop a mouse has no
  // horizontal gesture, so a vertical wheel over the strip scrolls it and the
  // arrows nudge it a chip-width at a time.
  const chipScrollerRef = useRef<HTMLDivElement>(null);
  const handleChipWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = chipScrollerRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; // already horizontal
    el.scrollLeft += e.deltaY;
  }, []);
  const nudgeChips = useCallback((dir: 1 | -1) => {
    chipScrollerRef.current?.scrollBy({ left: dir * 160, behavior: "smooth" });
  }, []);

  // Year row — this year and the next two
  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y + 1, y + 2];
  }, []);

  // Verdict on the picked range: a booked journey outranks everything, then
  // a clean fit inside an open window, then a near miss. Nothing notable
  // gets no line rather than a shrug.
  const verdict = useMemo(() => {
    if (!pickStart || !pickEnd || !pickerReady) return null;
    const days = countDays(pickStart, pickEnd);
    const dayLabel = `${days} day${days !== 1 ? "s" : ""}`;

    const clash = pickerTrips.find(
      (t) => !t.archived && t.start_date <= pickEnd && t.end_date >= pickStart
    );
    if (clash) {
      return {
        tone: "bad" as const,
        text: `Overlaps ${clash.title} · ${fmtRange(clash.start_date, clash.end_date)}`,
      };
    }

    const inside = openWindows.find(
      (w) => isoOf(w.start) <= pickStart && isoOf(w.end) >= pickEnd
    );
    if (inside) {
      return {
        tone: "good" as const,
        text: `${inside.name} · ${dayLabel} · no journey booked`,
      };
    }

    // Partly overlapping, or butted right up against, an open window
    const near = openWindows.find(
      (w) =>
        isoOf(addDays(w.start, -1)) <= pickEnd && isoOf(addDays(w.end, 1)) >= pickStart
    );
    if (near) {
      const overlapping = isoOf(near.start) <= pickEnd && isoOf(near.end) >= pickStart;
      return {
        tone: "mid" as const,
        text: `${dayLabel} · ${overlapping ? "partly in" : "just outside"} ${near.name} (${fmtRange(isoOf(near.start), isoOf(near.end))})`,
      };
    }
    return null;
  }, [pickStart, pickEnd, pickerReady, pickerTrips, openWindows]);

  // Auto-suggest trip name when destination or start date changes
  useEffect(() => {
    if (!tripNameDirty && destination && startDate) {
      setTripName(suggestTripName(destination.name, startDate));
    }
  }, [destination, startDate, tripNameDirty]);

  // Debounced city autocomplete. The second guard keeps the dropdown from
  // popping open when the input merely reflects an already-confirmed
  // destination (e.g. seeded from a wishlist link on mount).
  useEffect(() => {
    if (destInput.length < 2 || destInput === lastPicked.current || (destination && destInput === destination.name)) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res  = await fetch(
          `/api/places/autocomplete?input=${encodeURIComponent(destInput)}&sessiontoken=${sessionToken.current}&types=(regions)`,
        );
        const data = await res.json() as { predictions?: DestinationPrediction[] };
        setSuggestions(data.predictions ?? []);
        setShowSuggestions(true);
      } catch { /* ignore */ }
    }, 300);
  }, [destInput, destination]);

  const handleSelectSuggestion = useCallback(async (p: DestinationPrediction) => {
    lastPicked.current = p.description;
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

        // Auto-fetch Unsplash cover for the destination
        if (UNSPLASH_KEY) {
          setFetchingCover(true);
          fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(p.description + " travel landmark")}&per_page=1&orientation=landscape`,
            { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } },
          )
            .then((r) => r.json())
            .then((d: { results?: { urls?: { regular?: string } }[] }) => {
              const url = d.results?.[0]?.urls?.regular ?? null;
              if (url) setCoverUrl(url);
            })
            .catch(() => { /* ignore */ })
            .finally(() => setFetchingCover(false));
        }
      }
    } catch { /* ignore */ } finally {
      setLoadingDetails(false);
    }
  }, []);

  // Cover source — Unsplash auto-fetch or manually pasted URL only; no satellite fallback
  const coverSrc = coverUrl && !coverError ? coverUrl : null;

  const hasCover = !!coverSrc;

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

  // One tap fills the range and moves the calendar to it
  const handleQuickWindow = (w: OpenWindow) => {
    setPickStart(isoOf(w.start));
    setPickEnd(isoOf(w.end));
    setPickPhase("start");
    setCalYear(w.start.getFullYear());
    setCalMonth(w.start.getMonth());
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
        // The second tap finishes the range, so it also closes the picker.
        // "Done" confirmed what the traveller had just done (click audit,
        // Sep 2026); it stays for the single-day case and for re-opening.
        if (pickStart) {
          setStartDate(pickStart);
          setEndDate(dateStr);
          setShowDatePicker(false);
        }
      }
    }
  };

  const handleDateDone = () => {
    if (pickStart) setStartDate(pickStart);
    if (pickEnd) setEndDate(pickEnd);
    else if (pickStart) setEndDate(pickStart);
    setShowDatePicker(false);
  };

  // Escape closes the innermost thing first. Inside an overlay this listener
  // runs alongside the shell's, which skips Escape while a nested sheet is
  // marked open — so one keypress closes the picker, not the whole screen.
  useEffect(() => {
    if (!showDatePicker && !showCoverSheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShowDatePicker(false);
      setShowCoverSheet(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDatePicker, showCoverSheet]);

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
      // Persist manually chosen cover immediately so it's visible on the trip
      ...(coverUrl ? { cover_image_url: coverUrl } : {}),
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
      // Unchecked, this left a journey with no days and a screen that said
      // "No days in this trip yet." with nothing to do (UX audit, Sep 2026).
      const { error: daysErr } = await supabase.from("days").insert(days);
      if (daysErr) {
        toast({
          message: "The journey was created but its days weren't. Open Journey settings and save the dates to add them.",
          duration: 8000,
        });
      }
    }

    // Only fire the background cover fetch if we don't already have one
    if (!coverUrl) {
      fetch("/api/trips/fetch-cover", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ trip_id: tripId }),
      }).catch(() => { /* ignore */ });
    }

    // The journey exists — open it. The overlay host closes itself first, so
    // the traveller lands on the new map, not on the map behind a sheet.
    // A new journey lands on Day 1 of the Agenda, where "Add a place" writes
    // straight onto the day; the Map, with its intro card and its dropdown,
    // was 13 taps to the same result (UX audit, Sep 2026, finding 11).
    const landing = days[0] ? `/trips/${tripId}/days/${days[0].id}` : `/trips/${tripId}`;
    if (onCreated) onCreated(tripId, landing);
    else router.push(landing);
  }, [isValid, saving, destination, tripName, startDate, endDate, partySize, coverUrl, router, onCreated, toast]);

  return (
    <div className={overlay ? "flex flex-col h-full min-h-0 bg-white" : "flex flex-col min-h-dvh bg-white"}>

      {/* Header. Same row in both hosts; only the dismiss glyph changes —
          a back chevron on the page, a close cross in the overlay. */}
      <div className="flex items-center h-11 border-b border-gray-100 flex-shrink-0 relative bg-white sticky top-0 z-10">
        <button
          onClick={dismiss}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label={overlay ? "Close" : "Back"}
        >
          {overlay ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          )}
        </button>
        <span className="absolute left-0 right-0 text-center text-[16px] font-display italic text-gray-900 pointer-events-none">
          Plan a journey
        </span>
      </div>

      {/* Scrollable body. The form is a phone-shaped column by design — as a
          page on desktop it centres in a card-width measure instead of
          stretching form rows across a 1900px screen; in an overlay the host
          is already that card, so the measure is dropped. pb-24 is the phone
          keyboard's room to scroll the last field clear. */}
      <div
        className={[
          "flex-1 min-h-0 overflow-y-auto pb-24 w-full scroll-pb-24",
          overlay
            ? ""
            : "md:max-w-[620px] md:mx-auto md:my-8 md:rounded-2xl md:border md:border-black/[0.07] md:shadow-[0_1px_2px_rgba(26,26,46,0.04)] md:overflow-hidden",
        ].join(" ")}
      >

        {/* Cover hero */}
        <button
          onClick={() => { setCoverUrlInput(coverUrl ?? ""); setCoverPreviewError(false); setShowCoverSheet(true); }}
          className="relative w-full h-[100px] block overflow-hidden flex-shrink-0"
          aria-label={hasCover ? "Change cover photo" : "Add cover photo"}
        >
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

          {/* Scrim + label — dark scrim when there's a cover, transparent otherwise */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1"
            style={{ background: hasCover ? "rgba(0,0,0,0.25)" : "transparent" }}
          >
            <Camera size={14} weight="light" color={hasCover ? "white" : "#9CA3AF"} />
            <span className={`text-[11px] font-medium tracking-wide ${hasCover ? "text-white" : "text-gray-400"}`}>
              {hasCover ? "Change cover" : "Add cover"}
            </span>
          </div>

          {/* Fetching indicator */}
          {fetchingCover && (
            <div className="absolute top-2 right-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" className="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </div>
          )}
        </button>

        {/* Inline field rows */}
        <div className="mt-2">

          {/* Name */}
          <div className="flex items-center px-5 py-[14px] border-b border-black/5">
            <span className="text-[10px] uppercase tracking-widest text-[#1A1A2E] w-20 flex-shrink-0">
              Name
            </span>
            <input
              type="text"
              value={tripName}
              onChange={(e) => { setTripName(e.target.value); setTripNameDirty(true); }}
              placeholder="Journey name"
              className="flex-1 text-[14px] text-[#1A1A2E] bg-transparent outline-none placeholder:text-[rgba(26,26,46,0.4)]"
            />
          </div>

          {/* Destination */}
          <div className="flex items-center px-5 py-[14px] border-b border-black/5 relative">
            <span className="text-[10px] uppercase tracking-widest text-[#1A1A2E] w-20 flex-shrink-0">
              Destination
            </span>
            <input
              type="text"
              value={destInput}
              onChange={(e) => {
                setDestInput(e.target.value);
                if (destination && e.target.value !== destination.name) {
                  setDestination(null);
                  setCoverUrl(null);
                  setCoverError(false);
                }
              }}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              placeholder="City, Country"
              autoComplete="off"
              className="flex-1 text-[14px] text-[#1A1A2E] bg-transparent outline-none placeholder:text-[rgba(26,26,46,0.4)]"
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
            <span className="text-[10px] uppercase tracking-widest text-[#1A1A2E] w-20 flex-shrink-0">
              Dates
            </span>
            <span className={`flex-1 text-[14px] ${startDate ? "text-[#1A1A2E]" : "text-[rgba(26,26,46,0.4)]"}`}>
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
            <span className="text-[10px] uppercase tracking-widest text-[#1A1A2E] w-20 flex-shrink-0">
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
        <div className={`px-5 mt-6 ${overlay ? "" : "md:mb-6"}`}>
          <button
            onClick={handleCreate}
            disabled={!isValid || saving}
            className="w-full py-3 bg-[#1A1A2E] text-white text-[14px] font-semibold rounded-full disabled:opacity-40 active:scale-[0.99] transition-all"
          >
            {saving ? "Creating journey…" : "Plan this journey"}
          </button>
        </div>

      </div>

      {/* Cover photo URL sheet. z-[90] clears the overlay shell at z-[80]; on
          the page route nothing sits above it either way. */}
      {showCoverSheet && (
        <div {...NESTED_SHEET_ATTR}>
          <div
            className="fixed inset-0 bg-black/40 z-[90]"
            onClick={() => setShowCoverSheet(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[90] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "85%" }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-3 pb-2">
              <p className="text-center font-display italic text-base text-gray-900 mb-5">
                Change cover
              </p>
              <input
                type="url"
                value={coverUrlInput}
                onChange={(e) => { setCoverUrlInput(e.target.value); setCoverPreviewError(false); }}
                placeholder="Paste an image URL…"
                autoFocus
                className="w-full text-[14px] border-b border-black/10 py-3 outline-none bg-transparent placeholder:text-gray-300 text-[#1A1A2E]"
              />
              {/* Live preview */}
              <div
                className="mt-4 w-full h-[100px] rounded-xl overflow-hidden"
                style={{ background: "#E8E3DA" }}
              >
                {coverUrlInput.trim() && !coverPreviewError && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrlInput.trim()}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={() => setCoverPreviewError(true)}
                  />
                )}
              </div>
            </div>
            <div className="flex-shrink-0 px-5 pt-4 pb-10 space-y-3">
              <button
                onClick={() => {
                  const url = coverUrlInput.trim() || null;
                  setCoverUrl(url);
                  setCoverError(false);
                  setShowCoverSheet(false);
                }}
                disabled={!coverUrlInput.trim()}
                className="w-full py-3 bg-[#1A1A2E] text-white text-[14px] font-semibold rounded-full disabled:opacity-40 active:scale-[0.99] transition-all"
              >
                Save
              </button>
              <button
                onClick={() => setShowCoverSheet(false)}
                className="w-full text-center text-[13px] text-gray-400 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Date range picker sheet */}
      {showDatePicker && (
        <div {...NESTED_SHEET_ATTR}>
          <div
            className="fixed inset-0 bg-black/40 z-[90]"
            onClick={() => setShowDatePicker(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[90] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "90%" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Sheet title */}
            <p className="text-center font-display italic text-base text-gray-900 pb-3 flex-shrink-0">
              Select dates
            </p>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
              {/* Quick windows — every school break, long weekend and saved
                  ideal window in the rolling year with no journey on it. */}
              {quickWindows.length > 0 && (
                <div className="relative mb-3">
                  <div
                    ref={chipScrollerRef}
                    onWheel={handleChipWheel}
                    className="flex gap-1.5 overflow-x-auto scrollbar-none pr-6"
                  >
                    {quickWindows.map((w) => {
                      const wStart = isoOf(w.start);
                      const wEnd   = isoOf(w.end);
                      const active = pickStart === wStart && pickEnd === wEnd;
                      // Month prefix so a row of "PA day" chips is tellable apart
                      const mon = w.start.toLocaleDateString("en-US", { month: "short" });
                      return (
                        <button
                          key={w.key}
                          onClick={() => handleQuickWindow(w)}
                          title={`${fmtRange(wStart, wEnd)} · ${w.days} days`}
                          className={`flex-shrink-0 text-[11px] font-semibold rounded-full px-2.5 py-1.5 border whitespace-nowrap transition-colors ${
                            active
                              ? "bg-[#1A1A2E] text-[#FAF7F2] border-[#1A1A2E]"
                              : "bg-[#F2EDE3] text-[#1A1A2E] border-black/10"
                          }`}
                        >
                          <span className={active ? "opacity-60" : "opacity-40"}>{mon}</span>
                          {" "}{w.name}
                        </button>
                      );
                    })}
                  </div>
                  {/* Right-edge fade — signals there are more windows to scroll */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-6 pointer-events-none"
                    style={{ background: "linear-gradient(to left, #fff, transparent)" }}
                  />
                  {/* A mouse can't swipe a strip: arrows do on desktop what a
                      thumb does on a phone. Hidden on touch, where they'd just
                      cover chips. */}
                  <button
                    type="button"
                    onClick={() => nudgeChips(-1)}
                    aria-label="Earlier windows"
                    className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-black/10 shadow-sm items-center justify-center text-[#1A1A2E]"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => nudgeChips(1)}
                    aria-label="Later windows"
                    className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-black/10 shadow-sm items-center justify-center text-[#1A1A2E]"
                  >
                    ›
                  </button>
                </div>
              )}

              {/* Year row — three taps' reach instead of twelve "next month" */}
              <div className="flex gap-1 mb-2">
                {yearOptions.map((y) => (
                  <button
                    key={y}
                    onClick={() => setCalYear(y)}
                    aria-pressed={y === calYear}
                    className={`text-[10px] font-semibold rounded-md px-2.5 py-1 transition-colors ${
                      y === calYear
                        ? "bg-[#1A1A2E] text-[#FAF7F2]"
                        : "bg-[#1A1A2E]/[0.05] text-[rgba(26,26,46,0.5)]"
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>

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
                  // A new journey can't start on a day already gone: those
                  // days show but don't take a tap, and today wears a ring.
                  const isPast  = dateStr < todayStr;
                  const isToday = dateStr === todayStr;
                  return (
                    <div
                      key={dateStr}
                      className={`relative h-9 flex items-center justify-center ${inRange ? "bg-[#1A1A2E]/10" : ""}`}
                    >
                      <button
                        onClick={() => handleDayClick(dateStr)}
                        disabled={isPast}
                        aria-disabled={isPast}
                        className={`w-8 h-8 flex items-center justify-center text-[13px] transition-colors rounded-md ${
                          isSelected
                            ? "bg-[#1A1A2E] text-white"
                            : isPast
                              ? "text-gray-300 cursor-default"
                              : "text-gray-800 hover:bg-gray-100"
                        }`}
                        style={isToday && !isSelected ? { boxShadow: "inset 0 0 0 1.5px #B0541F", color: "#B0541F" } : undefined}
                      >
                        {dayNum}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Verdict — is this range any good? */}
              {verdict && (
                <div
                  className="mt-3 rounded-lg px-2.5 py-2 text-[11px] leading-[1.5]"
                  style={{
                    background: VERDICT_STYLE[verdict.tone].bg,
                    color:      VERDICT_STYLE[verdict.tone].fg,
                  }}
                >
                  {verdict.text}
                </div>
              )}
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
        </div>
      )}

    </div>
  );
}
