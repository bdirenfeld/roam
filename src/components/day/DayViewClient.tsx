"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import DayStrip from "@/components/day/DayStrip";
import DayPicker from "@/components/day/DayPicker";
import DayMap from "@/components/day/DayMap";
import CardTimeline from "@/components/day/CardTimeline";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import AppMenu from "@/components/ui/AppMenu";
import { useToast } from "@/components/ui/Toast";
import ConfirmationPreviewSheet, { type ParsedConfirmation } from "@/components/plan/ConfirmationPreviewSheet";
import DocumentsSheet from "@/components/plan/DocumentsSheet";
import { Files, MagnifyingGlass } from "@phosphor-icons/react";
import { useGlobalSearch } from "@/components/search/GlobalSearch";
import CreateCardSheet from "@/components/plan/CreateCardSheet";
import Companion from "@/components/companion/Companion";
import { JourneyNotesSheet } from "@/components/trip/JourneyNotes";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { createClient } from "@/lib/supabase/client";
import { queuedUpdate } from "@/lib/offline/queuedWrite";
import { applyOverlayAll } from "@/lib/offline/writeQueue";
import { COMPANION_ENABLED } from "@/lib/featureFlags";
import type { Trip, Day, DayWithCards, Card } from "@/types/database";

// Weather types, fetch, cache and icons live in the shared module so the
// Plan board can render per-day forecasts too.
import {
  type DayWeather,
  fetchTripWeather,
  dayStopsAnchor,
  getWeatherCategory,
  WeatherIcon,
  HourlyStrip,
} from "@/lib/weather";

// The agenda's single ordering rule: chronological, untimed cards last,
// position as the tiebreak so untimed cards hold a stable order.
function agendaOrder(a: Card, b: Card): number {
  if (a.start_time && b.start_time) {
    const t = a.start_time.localeCompare(b.start_time);
    if (t !== 0) return t;
  } else if (a.start_time) return -1;
  else if (b.start_time) return 1;
  return a.position - b.position;
}

// ── Condition advisory text ────────────────────────────────────────────────
function getConditionText(w: DayWeather): string | null {
  const { high_c, low_c, precip_probability_max, wind_speed_max, snow, hourly_precip, hourly_temp } = w;

  // Precipitation and snow have highest priority
  if (snow || precip_probability_max > 30) {
    const morningPrecip = hourly_precip.slice(6, 10).some(p => p > 30);
    const middayPrecip  = hourly_precip.slice(10, 14).some(p => p > 30);
    const pmPrecip      = hourly_precip.slice(14, 20).some(p => p > 30);

    if (snow) {
      if (morningPrecip && pmPrecip) return "snow all day";
      if (morningPrecip || middayPrecip) return "snow AM";
      if (pmPrecip) return "snow PM";
      return "snow all day";
    }

    if (morningPrecip && pmPrecip) return "rain all day";
    if (middayPrecip && !morningPrecip && !pmPrecip) return "showers midday";
    if (morningPrecip || (middayPrecip && !pmPrecip)) return "light rain AM";
    if (pmPrecip) return "rain PM";
    return "light rain AM";
  }

  // Temp extremes — hot midday
  const middayTemps = hourly_temp.slice(10, 15);
  if (middayTemps.length > 0 && Math.max(...middayTemps) >= 30) return "hot midday";

  // Cold morning (low before 9am)
  const morningTemps = hourly_temp.slice(0, 9);
  if (morningTemps.length > 0 && Math.min(...morningTemps) <= 5) return "cold morning";

  // Chilly evening (low ≤ 5°C overall)
  if (low_c <= 5) return "chilly evening";

  // Big swing — announce when the chill kicks in
  if (high_c - low_c >= 12 && hourly_temp.length > 0) {
    const peakIdx = hourly_temp.indexOf(Math.max(...hourly_temp));
    const hour12 = peakIdx % 12 || 12;
    const ampm = peakIdx < 12 ? "AM" : "PM";
    return `cool after ${hour12} ${ampm}`;
  }

  // Wind
  if (wind_speed_max > 30) return "windy all day";

  return null;
}

// ── Weather expansion (hourly + 7-day) ────────────────────────────────────
function WeatherExpansion({
  id,
  expanded,
  weather,
  weatherByDate,
  days,
  activeDayId,
  onDaySelect,
}: {
  id: string;
  expanded: boolean;
  weather: DayWeather | null;
  weatherByDate: Record<string, DayWeather> | null;
  days: Day[];
  activeDayId: string;
  onDaySelect: (day: Day) => void;
}) {
  return (
    <div
      id={id}
      className="overflow-hidden transition-[max-height] duration-300 ease-out bg-white"
      style={{ maxHeight: expanded ? "280px" : "0px" }}
    >
      {weather && (
        <div className="mx-4 my-[14px] rounded-[10px] p-[14px]" style={{ background: "rgba(26,26,46,0.025)" }}>
          <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-activity/50 mb-3">Hourly</div>
          <HourlyStrip weather={weather} />
          <div className="mt-[14px] mb-3" style={{ borderTop: "0.5px solid rgba(26,26,46,0.10)" }} />
          <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-activity/50 mb-3">Outlook</div>
          <div className="flex overflow-x-auto scrollbar-none">
            {days.map((d) => {
              const w = weatherByDate?.[d.date];
              const isActive = d.id === activeDayId;
              const dt = new Date(d.date + "T00:00:00");
              const dow = dt.toLocaleDateString("en-GB", { weekday: "short" });
              return (
                <button
                  key={d.id}
                  onClick={() => onDaySelect(d)}
                  className="min-w-[44px] flex flex-col items-center py-1 rounded-md transition-colors"
                  style={{
                    background: isActive ? "rgba(196,98,45,0.10)" : undefined,
                    opacity: isActive ? 1 : 0.45,
                  }}
                >
                  <div className="text-[8px] uppercase tracking-[0.1em]" style={{ color: isActive ? "#B0541F" : "#1A1A2E" }}>{dow}</div>
                  <div className="font-display italic text-[12px] mt-[2px]" style={{ color: isActive ? "#B0541F" : "#1A1A2E" }}>{dt.getDate()}</div>
                  {w && (
                    <>
                      <div className="mt-[4px]"><WeatherIcon category={getWeatherCategory(w.condition_code)} size={11} /></div>
                      <div className="text-[9px] mt-[2px] text-activity">{w.high_c}°/{w.low_c}°</div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Weather subtitle row ──────────────────────────────────────────────────
function WeatherSubtitle({
  weather,
  expanded,
  onToggle,
  controlsId,
}: {
  weather: DayWeather | null;
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
}) {
  if (!weather) {
    // Reserve height so the header never resizes on data arrival
    return <div className="h-[13px]" />;
  }

  const category = getWeatherCategory(weather.condition_code);
  const conditionText = getConditionText(weather);

  return (
    <button
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label="Toggle weather forecast"
      className="pointer-events-auto flex items-center gap-1 rounded-[4px] transition-colors"
      style={{
        padding: "2px 6px",
        background: expanded ? "rgba(196,98,45,0.08)" : "transparent",
      }}
    >
      <WeatherIcon category={category} />
      <span className="text-[11px] font-medium leading-none text-activity/50 tabular-nums">
        {weather.high_c}° / {weather.low_c}°
      </span>
      {conditionText && (
        <>
          <div className="w-[2px] h-[2px] rounded-full bg-activity/30 flex-shrink-0" />
          <span className="text-[11px] font-medium leading-none text-activity/50 truncate max-w-[110px]">
            {conditionText}
          </span>
        </>
      )}
      <span
        aria-hidden
        className="text-[8px] text-activity/40 ml-px transition-transform duration-200"
        style={{ transform: expanded ? "rotate(180deg)" : "none" }}
      >
        ▾
      </span>
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
interface Props {
  trip: Trip;
  days: Day[];
  dayWithCards: DayWithCards;
  hotelCards: Card[];
  /** trips.notes — arrives with the page payload so notes work offline. */
  initialNotes: string | null;
  /** Guest view — every plan-edit affordance is suppressed; the companion stays. */
  readOnly?: boolean;
}

// ── ··· menu ──────────────────────────────────────────────────────────────
// Journey notes open here rather than on a settings page, so the facts that
// belong to no single day are reachable ON the day. A guest gets the menu too
// (notes are shared) — with the owner-only settings row removed.
function formatDayTitle(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = d.toLocaleDateString("en-GB", { weekday: "long" });
  const dayNum = d.getDate();
  const monthName = d.toLocaleDateString("en-GB", { month: "long" });
  return `${dayName}, ${dayNum} ${monthName}`;
}

export default function DayViewClient({ trip, days, dayWithCards, hotelCards, initialNotes, readOnly = false }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  // ONE ordering rule for the agenda, applied to the initial server list and
  // every later add: chronological, untimed cards last, position as the
  // tiebreak. The server orders by position alone, so sorting only the adds
  // (the old behaviour) made cards jump to a different spot after a refresh.
  //
  // OFFLINE: the page payload is whatever the service worker cached, i.e. the
  // SERVER's version of these rows. Anything edited offline and still queued
  // is laid back over them here, in the initialiser, so a reload on a plane
  // paints the ticked box / moved time / new order on the FIRST frame rather
  // than flashing the stale value. Overlay values are absolute, so re-applying
  // them after a sync that has already landed is a no-op.
  const [localCards, setLocalCards] = useState<Card[]>(() =>
    applyOverlayAll("cards", [...dayWithCards.cards]).sort(agendaOrder)
  );
  // Undo window after a delete — holds the removed row for re-insert
  const { toast } = useToast();

  // The day's title — "Arrival", "Lucca morning". The Plan showed it and the
  // Agenda, the screen you read on the day, did not (UX audit, Sep 2026,
  // finding 4). Edited inline in the desktop header; the phone shows it and
  // names days from the Plan's day header, as before.
  const [dayTitle, setDayTitle] = useState<string>(dayWithCards.theme ?? "");
  const [editingTitle, setEditingTitle] = useState(false);
  useEffect(() => {
    setDayTitle(dayWithCards.theme ?? "");
    setEditingTitle(false);
  }, [dayWithCards.id, dayWithCards.theme]);
  const commitDayTitle = useCallback(async (raw: string) => {
    const theme = raw.trim() || null;
    const previous = dayTitle;
    setEditingTitle(false);
    if ((theme ?? "") === previous) return;
    setDayTitle(theme ?? "");
    const { error } = await supabase.from("days").update({ theme }).eq("id", dayWithCards.id);
    if (error) {
      setDayTitle(previous);
      toast({ message: "Couldn't save the day's title. Try again." });
      return;
    }
    router.refresh();
  }, [dayTitle, supabase, dayWithCards.id, toast, router]);

  // ── Import a booking / Documents — the same flow the Plan board has, here
  // because the Agenda is the tab you're on when a confirmation arrives
  // (Brennan, Sep 2026). Parse → preview sheet → cards land on their days;
  // only the ones for THIS day are spliced into the timeline.
  const importInputRef = useRef<HTMLInputElement>(null);
  const [pendingConf, setPendingConf] = useState<{ items: ParsedConfirmation[]; fileName: string; fileType: string } | null>(null);
  const [importingConf, setImportingConf] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const handleImportFile = useCallback(async (file: File) => {
    setImportingConf(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/confirmations/parse", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't read that file.");
      setPendingConf({ items: json.parsed, fileName: file.name, fileType: file.type });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Couldn't read that file.");
      setTimeout(() => setImportError(null), 4000);
    } finally {
      setImportingConf(false);
    }
  }, []);
  const agendaMenuExtra = readOnly ? undefined : [
    { key: "bookings", title: "Bookings", sub: "", icon: <Files size={15} weight="light" />, onClick: () => setShowDocs(true) },
  ];
  const search = useGlobalSearch();

  const handleCardUpdate = useCallback(
    (updated: Card) => {
      // "Move to day" reports the card with its new day_id — it leaves this
      // day's timeline. (An error rollback reports it back with this day's id,
      // so the not-in-list branch re-adds it.)
      if (updated.day_id && updated.day_id !== dayWithCards.id) {
        setLocalCards((prev) => prev.filter((c) => c.id !== updated.id));
        setSelectedCard(null);
        setIsCardOpen(false);
        return;
      }
      setLocalCards((prev) =>
        (prev.some((c) => c.id === updated.id)
          ? prev.map((c) => (c.id === updated.id ? updated : c))
          : [...prev, updated]
        ).sort(agendaOrder)
      );
      setSelectedCard((prev) => (prev?.id === updated.id ? updated : prev));
    },
    [dayWithCards.id]
  );

  // Delete is instant (the sheet asks nothing); the six-second Undo in the
  // app toast is the safety net. Re-insert keeps the original id so
  // attachments and links keep working.
  const handleCardDelete = useCallback((cardId: string) => {
    setLocalCards((prev) => {
      const gone = prev.find((c) => c.id === cardId) ?? null;
      if (gone) {
        toast({
          message: "Card deleted",
          undo: async () => {
            const { error } = await supabase.from("cards").insert({
              id: gone.id, day_id: gone.day_id, trip_id: gone.trip_id,
              start_time: gone.start_time, end_time: gone.end_time,
              position: gone.position, status: gone.status, source_url: gone.source_url,
              details: gone.details, ai_generated: gone.ai_generated,
              confirmed: gone.confirmed, place_id: gone.place_id,
            });
            if (error) { toast({ message: "Couldn't bring it back. Try again." }); return; }
            setLocalCards((cur) =>
              cur.some((c) => c.id === gone.id) ? cur : [...cur, gone].sort(agendaOrder)
            );
          },
        });
      }
      return prev.filter((c) => c.id !== cardId);
    });
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
    setIsCardOpen(false);
  }, [supabase, toast]);

  // A copy lands on ANOTHER day by definition, so this day's timeline is
  // unchanged — but if the target happens to be this day (a future
  // same-day copy), splice it in rather than silently dropping it.
  const handleCardCopied = useCallback(
    (card: Card) => {
      if (card.day_id !== dayWithCards.id) return;
      setLocalCards((prev) =>
        prev.some((c) => c.id === card.id) ? prev : [...prev, card].sort(agendaOrder)
      );
    },
    [dayWithCards.id]
  );

  const handleToggleConfirmed = useCallback(async (cardId: string) => {
    const card = localCards.find((c) => c.id === cardId);
    if (!card) return;
    const newValue = !card.confirmed;
    setLocalCards((prev) => prev.map((c) => c.id === cardId ? { ...c, confirmed: newValue } : c));
    setSelectedCard((prev) => prev?.id === cardId ? { ...prev, confirmed: newValue } : prev);
    // Queued when the write can't reach Supabase — the optimistic tick then
    // stands, survives a reload, and replays on reconnect. Only a genuine
    // refusal rolls back.
    const { error } = await queuedUpdate("cards", { id: cardId }, { confirmed: newValue });
    if (error) {
      setLocalCards((prev) => prev.map((c) => c.id === cardId ? { ...c, confirmed: !newValue } : c));
      setSelectedCard((prev) => prev?.id === cardId ? { ...prev, confirmed: !newValue } : prev);
    }
  }, [localCards]);

  const [isCardOpen, setIsCardOpen] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [gapTimes, setGapTimes] = useState<{ start: string; end: string } | null>(null);

  // Journey notes — the sheet unmounts on close, so the latest text is held
  // here; re-opening it shows what was just written, not the page payload.
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<string | null>(initialNotes);

  // Companion open state — hoisted from Companion so the desktop body grid can
  // flip between 2 columns (timeline + map) and 3 columns (timeline + map +
  // companion). Mobile composition is unchanged: Companion owns its own state
  // when uncontrolled, but here it's controlled so the grid layout can react.
  const [companionOpen, setCompanionOpen] = useState(false);

  // ── Weather ────────────────────────────────────────────────────────────
  const [weatherByDate, setWeatherByDate] = useState<Record<string, DayWeather> | null>(null);
  const [weatherExpanded, setWeatherExpanded] = useState(false);

  // Only this day's forecast renders here, so only this day's stop-anchor is
  // passed — if its stops are in a different city than the trip destination,
  // that city's forecast overrides the date. (Repeat fetches are cache hits.)
  useEffect(() => {
    if (!trip.destination_lat || !trip.destination_lng) return;
    const a = dayStopsAnchor(dayWithCards.cards);
    const anchors = a ? [{ date: dayWithCards.date, lat: a.lat, lng: a.lng }] : [];
    fetchTripWeather(
      {
        id: trip.id,
        destination_lat: trip.destination_lat,
        destination_lng: trip.destination_lng,
        start_date: trip.start_date,
        end_date: trip.end_date,
      },
      anchors
    )
      .then(setWeatherByDate)
      .catch((err) => {
        console.error("[Roam] Weather fetch failed:", err);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id, trip.destination_lat, trip.destination_lng, trip.start_date, trip.end_date, dayWithCards.id]);

  // ── Day cross-fade ─────────────────────────────────────────────────────
  const [contentVisible, setContentVisible] = useState(false);
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setContentVisible(true), 16);
    setWeatherExpanded(false);
    return () => clearTimeout(t);
  }, [dayWithCards.id]);

  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!swipeDir) return;
    const t = setTimeout(() => setSwipeDir(null), 200);
    return () => clearTimeout(t);
  }, [swipeDir]);

  const currentIndex = days.findIndex((d) => d.id === dayWithCards.id);
  const prevDay = currentIndex > 0 ? days[currentIndex - 1] : null;
  const nextDay = currentIndex < days.length - 1 ? days[currentIndex + 1] : null;

  // Warm adjacent day routes so tab-switches skip the skeleton flash
  useEffect(() => {
    if (prevDay) router.prefetch(`/trips/${trip.id}/days/${prevDay.id}`);
    if (nextDay) router.prefetch(`/trips/${trip.id}/days/${nextDay.id}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayWithCards.id]);

  const handleDaySelect = useCallback(
    (day: Day) => {
      if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
      setContentVisible(false);
      navTimeoutRef.current = setTimeout(() => {
        router.push(`/trips/${trip.id}/days/${day.id}`);
      }, 150);
    },
    [router, trip.id]
  );

  const goToPrevDay = useCallback(() => {
    if (!prevDay) return;
    setSwipeDir("right");
    router.push(`/trips/${trip.id}/days/${prevDay.id}`);
  }, [prevDay, router, trip.id]);

  const goToNextDay = useCallback(() => {
    if (!nextDay) return;
    setSwipeDir("left");
    router.push(`/trips/${trip.id}/days/${nextDay.id}`);
  }, [nextDay, router, trip.id]);

  const swipeHandlers = useSwipeNavigation({
    onSwipeLeft: goToNextDay,
    onSwipeRight: goToPrevDay,
    disabled: isCardOpen,
  });

  const localDayWithCards = useMemo(
    () => ({ ...dayWithCards, cards: localCards }),
    [dayWithCards, localCards]
  );

  const accommodationCard = useMemo(() => {
    if (!hotelCards.length) return null;
    const currentDayNumber = dayWithCards.day_number;
    const dayNumberById = new Map(days.map((d) => [d.id, d.day_number]));

    const mappableHotels = hotelCards.filter(
      (c) => c.place != null && c.place.lat != null && c.place.lng != null,
    );

    const sorted = [...mappableHotels].sort(
      (a, b) => (dayNumberById.get(a.day_id) ?? 0) - (dayNumberById.get(b.day_id) ?? 0)
    );

    let active: Card | null = null;
    for (const hotel of sorted) {
      const checkInDay = dayNumberById.get(hotel.day_id) ?? Infinity;
      if (checkInDay <= currentDayNumber) active = hotel;
    }
    return active;
  }, [hotelCards, dayWithCards.day_number, days]);

  const mappableCards = useMemo(
    () =>
      localCards.filter((c) => {
        if (accommodationCard && c.id === accommodationCard.id) return false;
        return c.place != null && c.place.lat != null && c.place.lng != null;
      }),
    [localCards, accommodationCard]
  );

  // Map each mappable card to its 1-based pin index. Activities without a place
  // get no number — the column simply stays empty for that row at md:+.
  // Order mirrors what DayMap uses when rendering markers so the numbers match.
  const cardNumberById = useMemo(() => {
    const m = new Map<string, number>();
    mappableCards.forEach((c, i) => m.set(c.id, i + 1));
    return m;
  }, [mappableCards]);

  const handlePinTap = useCallback((cardId: string) => {
    // Scroll the list into position first so it's right when the sheet closes
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setHighlightedCardId(cardId);
    setTimeout(() => setHighlightedCardId(null), 1200);
    // Then open the card itself — tapping a pin should behave like tapping the card
    const card = localCards.find((c) => c.id === cardId);
    if (card) {
      setSelectedCard(card);
      setIsCardOpen(true);
    }
  }, [localCards]);

  const handleCardTap = useCallback((card: Card) => {
    setSelectedCard(card);
    setIsCardOpen(true);
  }, []);

  const handleGapTap = useCallback((startTime: string, endTime: string) => {
    setGapTimes({ start: startTime, end: endTime });
  }, []);

  // Cards placed via the "Add from saved" picker — splice this day's in,
  // sorted like handleCardCreated. The interested card stays untouched.
  const handleCardCreated = useCallback((card: Card) => {
    setLocalCards((prev) => [...prev, card].sort(agendaOrder));
    setGapTimes(null);
  }, []);

  // Drag-reorder of the day's untimed cards. Positions are rewritten across
  // the WHOLE day (timed first, then the new untimed order) so they stay
  // 1-based and contiguous, and so agendaOrder's tiebreak reproduces exactly
  // what was just dropped.
  const handleReorderUntimed = useCallback(
    async (orderedUntimedIds: string[]) => {
      const byId = new Map(localCards.map((c) => [c.id, c]));
      const timed = localCards.filter((c) => c.start_time).sort(agendaOrder);
      const untimed = orderedUntimedIds
        .map((id) => byId.get(id))
        .filter((c): c is Card => !!c);
      if (untimed.length !== orderedUntimedIds.length) return;

      const renumbered = [...timed, ...untimed].map((c, i) => ({ ...c, position: i + 1 }));
      const snapshot = localCards;
      setLocalCards(renumbered);

      const changed = renumbered.filter((c) => byId.get(c.id)?.position !== c.position);
      // Sequential, not Promise.all: each row's write has to see the queue
      // state left by the previous one, otherwise a batch that starts online
      // and loses signal halfway can send some rows direct while queueing
      // others — and replaying that queue would rewrite an order the server
      // already has. One row at a time keeps the whole reorder in one mode.
      let failure: string | null = null;
      for (const c of changed) {
        const { error } = await queuedUpdate("cards", { id: c.id }, { position: c.position });
        // A refusal on the first row (RLS, a deleted card) will refuse the
        // rest too — stop, so the rollback below leaves local state and the
        // server agreeing rather than half-renumbered.
        if (error) { failure = error.message; break; }
      }
      if (failure) {
        console.error("[Roam] Reorder failed:", failure);
        setLocalCards(snapshot);
      }
    },
    [localCards]
  );

  const dayWeather = weatherByDate?.[dayWithCards.date] ?? null;

  // Whether a forecast could ever exist for this day. Open-Meteo runs about a
  // fortnight ahead, so anything beyond that is permanently weatherless and the
  // title can take the space the chip would have used. Computed from the date so
  // the size is settled on first paint — no shift when the fetch resolves.
  const weatherReachable = (() => {
    const day = new Date(dayWithCards.date + "T00:00:00").getTime();
    const now = new Date().setHours(0, 0, 0, 0);
    const days = Math.round((day - now) / 86_400_000);
    return days >= -1 && days <= 16;
  })();

  return (
    <div className="flex flex-col h-dvh md:block md:h-auto">
      {/* Mobile-only trip header — h-[58px] is constant; the subtitle row always reserves its height */}
      {/* Sticky, not just flex-shrink-0. It sits in an h-dvh column so it
          should never scroll — but something outside that column does the
          scrolling on a phone, and the date and the way back went with it.
          Pinning it explicitly holds regardless of which element moves. */}
      <div className="sticky top-0 z-30 relative flex items-center bg-white border-b border-gray-100 flex-shrink-0 h-[58px] md:hidden">
        <Link
          href="/"
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Back to home"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>

        {/* Center: date title + weather subtitle.
            The title grows when no forecast will ever sit under it. Open-Meteo
            only reaches about a fortnight out, so a 2027 journey is never
            getting a weather line and the date can have the room. Decided from
            the date, not from whether the fetch has landed — keying it on the
            data would shrink the title the moment weather arrived. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2px] pointer-events-none">
          <span
            className={`font-display italic text-gray-900 ${
              weatherReachable ? "text-[15px]" : "text-[19px]"
            }`}
          >
            {formatDayTitle(dayWithCards.date)}
          </span>
          {dayTitle && (
            <span className="font-display italic text-[11.5px] leading-none" style={{ color: "rgba(26,26,46,0.62)" }}>
              {dayTitle}
            </span>
          )}
          {weatherReachable && (
            <WeatherSubtitle
              weather={dayWeather}
              expanded={weatherExpanded}
              onToggle={() => setWeatherExpanded((v) => !v)}
              controlsId="weather-expansion"
            />
          )}
        </div>

        <span className="flex-1" />
        {/* Search, one tap from the header. It was a row in the menu, where
            the thing you use most sat among nine others. */}
        <button
          type="button"
          onClick={() => search.open()}
          aria-label="Search"
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors"
        >
          <MagnifyingGlass size={19} weight="light" />
        </button>
        <AppMenu
          variant="mobile"
          tripId={trip.id}
          tripTitle={trip.title}
          trip={trip}
          days={days}
          guest={readOnly}
          extra={agendaMenuExtra}
          triggerClassName="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors"
        />
      </div>

      {/* Day strip — md:hidden lives inside DayStrip itself */}
      <DayStrip
        days={days}
        activeDayId={dayWithCards.id}
        tripId={trip.id}
        onDaySelect={handleDaySelect}
      />

      {/* Mobile-only weather expansion */}
      <div className="md:hidden">
        <WeatherExpansion
          id="weather-expansion"
          expanded={weatherExpanded}
          weather={dayWeather}
          weatherByDate={weatherByDate}
          days={days}
          activeDayId={dayWithCards.id}
          onDaySelect={handleDaySelect}
        />
      </div>

      {/* Desktop-only editorial day header: chevron pager + Playfair date + Day N of M chip + settings */}
      <div className="hidden md:flex md:items-center md:gap-3.5 md:px-10 md:pt-8 md:pb-[18px] md:border-b md:border-[rgba(26,26,46,0.12)]">
        <button
          onClick={goToPrevDay}
          disabled={!prevDay}
          aria-label="Previous day"
          className="flex items-center justify-center p-1.5 text-[rgba(26,26,46,0.62)] disabled:opacity-30 disabled:cursor-default cursor-pointer hover:text-activity transition-colors"
        >
          <CaretLeft size={16} weight="light" />
        </button>

        {!readOnly && !dayTitle && !editingTitle ? (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            title="Name this day"
            aria-label={`${formatDayTitle(dayWithCards.date)} — tap to name this day`}
            className="font-display italic font-medium text-[26px] text-activity hover:opacity-70 transition-opacity"
            style={{ letterSpacing: "-0.01em" }}
          >
            {formatDayTitle(dayWithCards.date)}
          </button>
        ) : (
          <span
            className="font-display italic font-medium text-[26px] text-activity"
            style={{ letterSpacing: "-0.01em" }}
          >
            {formatDayTitle(dayWithCards.date)}
          </span>
        )}
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={dayTitle}
            placeholder="Lucca day, Rest, Cinque Terre…"
            aria-label="Day title"
            onBlur={(e) => commitDayTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            className="ml-3 h-8 px-2 rounded-md font-display italic text-[15px] bg-white outline-none"
            style={{ boxShadow: "0 0 0 1px rgba(26,26,46,0.18)", width: 220 }}
          />
        ) : dayTitle ? (
          readOnly ? (
            <span className="ml-3 font-display italic text-[16px]" style={{ color: "rgba(26,26,46,0.62)" }}>
              {dayTitle}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              title="Edit the day's title"
              className="ml-3 font-display italic text-[16px] hover:opacity-70 transition-opacity"
              style={{ color: "rgba(26,26,46,0.62)" }}
            >
              {dayTitle}
            </button>
          )
        ) : null}

        <button
          onClick={goToNextDay}
          disabled={!nextDay}
          aria-label="Next day"
          className="flex items-center justify-center p-1.5 text-[rgba(26,26,46,0.62)] disabled:opacity-30 disabled:cursor-default cursor-pointer hover:text-activity transition-colors"
        >
          <CaretRight size={16} weight="light" />
        </button>

        {/* Day N of M ▾ chip with calendar popover — shared DayPicker */}
        <div className="ml-1.5">
          <DayPicker
            days={days}
            onSelect={handleDaySelect}
            mode="active"
            activeDayId={dayWithCards.id}
          />
        </div>

        {/* Weather — compact chip; the full panel floats as a popover (like
            DayPicker) so it costs no layout space */}
        <div className="ml-auto relative">
          <WeatherSubtitle
            weather={dayWeather}
            expanded={weatherExpanded}
            onToggle={() => setWeatherExpanded((v) => !v)}
            controlsId="weather-expansion-desktop"
          />
          {weatherExpanded && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setWeatherExpanded(false)}
              />
              <div
                id="weather-expansion-desktop"
                className="absolute right-0 top-full mt-2 z-40 w-[440px] bg-white rounded-2xl overflow-hidden"
                style={{
                  border: "1px solid rgba(26,26,46,0.12)",
                  boxShadow: "0 8px 30px rgba(26,26,46,0.14)",
                }}
              >
                <WeatherExpansion
                  id="weather-expansion-desktop-panel"
                  expanded
                  weather={dayWeather}
                  weatherByDate={weatherByDate}
                  days={days}
                  activeDayId={dayWithCards.id}
                  onDaySelect={handleDaySelect}
                />
              </div>
            </>
          )}
        </div>

        {/* Import a booking / Documents as chips, the same pair the Plan's
            desktop toolbar carries. This slot used to hold a second ⋯ menu,
            identical to the masthead's one line above it — two doors to one
            menu on one screen (Brennan, Sep 2026). The phone keeps its menu
            because the masthead doesn't render there. */}
        {!readOnly && (
          <button
            type="button"
            onClick={() => setShowDocs(true)}
            className="rounded-full border border-[rgba(26,26,46,0.12)] bg-[rgba(26,26,46,0.025)] px-3 py-1.5 text-[12px] font-medium text-activity hover:bg-[rgba(26,26,46,0.05)] transition-colors"
            style={{ letterSpacing: "-0.005em" }}
          >
            Bookings
          </button>
        )}
      </div>

      {/* Two-pane body — mobile: flex column (Companion → Map → Timeline).
          Desktop: CSS grid that flips between 2 columns (timeline + map) and
          3 columns (timeline + smaller map + companion panel) on companionOpen.
          The Companion mount sits inside a md:contents wrapper so its two
          children (entry pull, panel) become direct grid items at md:+ and
          can be placed in separate columns. */}
      <div
        className={`flex-1 min-h-0 flex flex-col md:grid md:items-start md:px-10 md:pt-6 md:pb-16 md:flex-none md:min-h-0 ${
          companionOpen
            ? "md:grid-cols-[minmax(340px,1fr)_minmax(340px,1fr)_400px] md:gap-6"
            : "md:grid-cols-[minmax(420px,1fr)_minmax(420px,1fr)] md:gap-10"
        }`}
      >
        {/* Companion — at mobile renders its entry pull inline (above the map)
            and its panel as a fixed slide-over. At md:+, md:contents makes the
            wrapper transparent so the pull lands in col 2 row 2 (below map)
            and the panel lands in col 3 spanning rows. */}
        {COMPANION_ENABLED && (
          <div className="md:contents">
            <Companion
              tripId={trip.id}
              open={companionOpen}
              onOpenChange={setCompanionOpen}
              entryClassName="md:col-start-2 md:row-start-2"
              panelOuterClassName="md:relative md:inset-auto md:z-auto md:w-auto md:border-l-0 md:col-start-3 md:row-start-1 md:row-span-2 md:sticky md:top-6 md:self-start md:rounded-2xl md:shadow-[0_1px_2px_rgba(26,26,46,0.04),0_0_0_1px_rgba(26,26,46,0.12)] md:animate-none md:max-h-[calc(100dvh-104px)]"
            />
          </div>
        )}

        {/* Map — desktop col 2 row 1, sticky. Mobile: natural flow below Companion. */}
        <div className="md:col-start-2 md:row-start-1 md:sticky md:top-6 md:self-start">
          <DayMap
            cards={mappableCards}
            accommodationCard={accommodationCard ?? undefined}
            centerLat={trip.destination_lat ?? 41.9028}
            centerLng={trip.destination_lng ?? 12.4964}
            onPinTap={handlePinTap}
          />
        </div>

        {/* Timeline — desktop col 1 spanning rows. Mobile: natural flow below Map. */}
        <div
          className={`flex-1 overflow-y-auto min-h-0 pb-20 md:flex-none md:overflow-visible md:min-h-0 md:pb-0 md:col-start-1 md:row-start-1 md:row-span-2 transition-opacity ${
            contentVisible
              ? "opacity-100 duration-[200ms] ease-in"
              : "opacity-0 duration-[150ms] ease-out"
          }`}
        >
          <div
            key={dayWithCards.id}
            className={`px-4 pt-4 md:px-0 md:pt-0 ${
              swipeDir === "left"  ? "animate-in slide-in-from-right duration-200" :
              swipeDir === "right" ? "animate-in slide-in-from-left duration-200"  :
              ""
            }`}
            {...swipeHandlers}
          >
            <CardTimeline
              dayWithCards={localDayWithCards}
              onCardTap={handleCardTap}
              highlightedCardId={highlightedCardId}
              onGapTap={readOnly ? undefined : handleGapTap}
              onToggleConfirmed={readOnly ? undefined : handleToggleConfirmed}
              cardNumberById={cardNumberById}
              readOnly={readOnly}
              onReorder={readOnly ? undefined : handleReorderUntimed}
            />
          </div>
        </div>
      </div>

      {/* Journey notes — bottom sheet on mobile, modal at md+ */}
      {showNotes && (
        <JourneyNotesSheet
          tripId={trip.id}
          initialNotes={notes}
          readOnly={readOnly}
          onNotesChange={setNotes}
          onClose={() => setShowNotes(false)}
        />
      )}

      {/* Card detail bottom sheet */}
      {selectedCard && (
        <CardBottomSheet
          card={selectedCard}
          onClose={() => {
            setSelectedCard(null);
            setIsCardOpen(false);
          }}
          onCardUpdate={handleCardUpdate}
          onCardDelete={handleCardDelete}
          onCardCopied={handleCardCopied}
          days={days}
          tripDestination={trip.destination}
          readOnly={readOnly}
        />
      )}

      {/* Create card sheet — gapTimes.end available for future use by CreateCardSheet */}
      {gapTimes !== null && (
        <CreateCardSheet
          dayId={dayWithCards.id}
          tripId={trip.id}
          endPosition={localCards.reduce((m, c) => Math.max(m, c.position), 0) + 1}
          initialStartTime={gapTimes.start}
          initialEndTime={gapTimes.end}
          scheduledPlaceIds={
            new Set(
              localCards
                .filter((c) => c.status === "in_itinerary" && c.place_id)
                .map((c) => c.place_id as string),
            )
          }
          destination={trip.destination}
          destinationLat={trip.destination_lat}
          destinationLng={trip.destination_lng}
          onClose={() => setGapTimes(null)}
          onCardCreated={handleCardCreated}
        />
      )}

      {/* Undo toast after a delete — matches the Plan board's */}
      {/* Import a booking / Documents — hidden file input, parse preview and
          the documents sheet, mirroring the Plan board. */}
      {!readOnly && (
        <input
          ref={importInputRef}
          type="file"
          accept="application/pdf,image/*,.eml,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImportFile(f);
            e.currentTarget.value = "";
          }}
        />
      )}
      {pendingConf && (
        <ConfirmationPreviewSheet
          items={pendingConf.items}
          fileName={pendingConf.fileName}
          fileType={pendingConf.fileType}
          days={days.map((d) => (d.id === dayWithCards.id ? { ...d, cards: localCards } : { ...d, cards: [] }))}
          tripId={trip.id}
          onClose={() => setPendingConf(null)}
          onCardsCreated={(cards, deletedIds) => {
            setLocalCards((prev) => {
              const kept = deletedIds.length ? prev.filter((c) => !deletedIds.includes(c.id)) : prev;
              const mine = cards.filter((c) => c.day_id === dayWithCards.id);
              return [...kept, ...mine].sort(agendaOrder);
            });
            setPendingConf(null);
          }}
        />
      )}
      {showDocs && <DocumentsSheet tripId={trip.id} onClose={() => setShowDocs(false)} onImport={() => { setShowDocs(false); importInputRef.current?.click(); }} />}
      {(importingConf || importError) && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] px-4 py-2 rounded-full bg-[#1A1A2E] text-white text-[12.5px] shadow-lg">
          {importError ?? "Reading your booking…"}
        </div>
      )}

    </div>
  );
}
