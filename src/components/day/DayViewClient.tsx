"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DotsThree, CaretLeft, CaretRight, CaretDown } from "@phosphor-icons/react";
import DayStrip from "@/components/day/DayStrip";
import DayMap from "@/components/day/DayMap";
import CardTimeline from "@/components/day/CardTimeline";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import CreateCardSheet from "@/components/plan/CreateCardSheet";
import Companion from "@/components/companion/Companion";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { createClient } from "@/lib/supabase/client";
import type { Trip, Day, DayWithCards, Card } from "@/types/database";

// ── Weather types ──────────────────────────────────────────────────────────
interface DayWeather {
  high_c: number;
  low_c: number;
  condition_code: number;
  precip_probability_max: number;
  wind_speed_max: number;
  snow: boolean;
  hourly_precip: number[];
  hourly_temp: number[];
  hourly_condition_codes: number[];
}

type WeatherCategory = "sunny" | "partly-cloudy" | "cloudy" | "rain" | "snow" | "fog";

// Module-level cache — survives client-side route changes within a session
const weatherCache = new Map<string, Record<string, DayWeather>>();

// ── Open-Meteo fetch ───────────────────────────────────────────────────────
async function fetchWeatherForTrip(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string
): Promise<Record<string, DayWeather>> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: "temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,wind_speed_10m_max,snowfall_sum",
    hourly: "precipitation_probability,temperature_2m,weathercode",
    start_date: startDate,
    end_date: endDate,
    timezone: "auto",
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`);
  const data = await res.json();

  const { daily, hourly } = data as {
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      weathercode: number[];
      precipitation_probability_max: number[];
      wind_speed_10m_max: number[];
      snowfall_sum: number[];
    };
    hourly: {
      precipitation_probability: number[];
      temperature_2m: number[];
      weathercode: number[];
    };
  };

  const result: Record<string, DayWeather> = {};
  for (let i = 0; i < daily.time.length; i++) {
    const date = daily.time[i];
    const s = i * 24;
    result[date] = {
      high_c: Math.round(daily.temperature_2m_max[i]),
      low_c: Math.round(daily.temperature_2m_min[i]),
      condition_code: daily.weathercode[i],
      precip_probability_max: daily.precipitation_probability_max[i] ?? 0,
      wind_speed_max: daily.wind_speed_10m_max[i] ?? 0,
      snow: (daily.snowfall_sum[i] ?? 0) > 0,
      hourly_precip: hourly.precipitation_probability.slice(s, s + 24),
      hourly_temp: hourly.temperature_2m.slice(s, s + 24),
      hourly_condition_codes: hourly.weathercode.slice(s, s + 24),
    };
  }
  return result;
}

// ── WMO code → icon category ──────────────────────────────────────────────
function getWeatherCategory(code: number): WeatherCategory {
  if (code === 0) return "sunny";
  if (code === 1 || code === 2) return "partly-cloudy";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "rain";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code === 85 || code === 86) return "snow";
  if (code === 95 || code === 96 || code === 99) return "rain";
  return "cloudy";
}

// Icon stroke colors are semantic accents — inline hex is intentional
const ICON_COLOR: Record<WeatherCategory, string> = {
  "sunny": "#D18A2E",
  "partly-cloudy": "#D18A2E",
  "cloudy": "#8B8680",
  "rain": "#3A7CA5",
  "snow": "#8B8680",
  "fog": "#8B8680",
};

function WeatherIcon({ category, size = 13 }: { category: WeatherCategory; size?: number }) {
  const stroke = ICON_COLOR[category];
  const base = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { flexShrink: 0 },
    "aria-hidden": true,
  };

  if (category === "sunny") {
    return (
      <svg {...base}>
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
        <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
        <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
      </svg>
    );
  }
  if (category === "partly-cloudy") {
    return (
      <svg {...base}>
        <path d="M12 2v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="M20 12h2" />
        <path d="m19.07 4.93-1.41 1.41" />
        <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128" />
        <path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z" />
      </svg>
    );
  }
  if (category === "rain") {
    return (
      <svg {...base}>
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="M16 14v6" />
        <path d="M8 14v6" />
        <path d="M12 16v6" />
      </svg>
    );
  }
  if (category === "snow") {
    return (
      <svg {...base}>
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="M8 15h.01" />
        <path d="M8 19h.01" />
        <path d="M12 17h.01" />
        <path d="M12 21h.01" />
        <path d="M16 15h.01" />
        <path d="M16 19h.01" />
      </svg>
    );
  }
  if (category === "fog") {
    return (
      <svg {...base}>
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
        <path d="M16 17H7" />
        <path d="M17 21H9" />
      </svg>
    );
  }
  // cloudy (default)
  return (
    <svg {...base}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z" />
    </svg>
  );
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
const HOURLY_INDICES = [8, 10, 12, 14, 16, 18, 20, 22];
const HOURLY_LABELS = ["8a", "10a", "12p", "2p", "4p", "6p", "8p", "10p"];

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
          <div className="flex overflow-x-auto scrollbar-none">
            {HOURLY_INDICES.map((h, i) => {
              const temp = weather.hourly_temp[h];
              const precip = weather.hourly_precip[h] ?? 0;
              const code = weather.hourly_condition_codes[h] ?? weather.condition_code;
              return (
                <div key={h} className="min-w-[46px] flex flex-col items-center">
                  <div className="text-[9px] text-activity/50 lowercase">{HOURLY_LABELS[i]}</div>
                  <div className="mt-[6px]"><WeatherIcon category={getWeatherCategory(code)} size={14} /></div>
                  <div className="font-display italic text-[13px] text-activity mt-[4px]">{Math.round(temp)}°</div>
                  <div className="text-[9px] mt-[2px]" style={{ color: precip >= 20 ? "#C4622D" : "rgba(26,26,46,0.35)" }}>
                    {precip >= 20 ? `${precip}%` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-[14px] mb-3" style={{ borderTop: "0.5px solid rgba(26,26,46,0.10)" }} />
          <div className="text-[9px] font-medium uppercase tracking-[0.18em] text-activity/50 mb-3">7-day outlook</div>
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
                  <div className="text-[8px] uppercase tracking-[0.1em]" style={{ color: isActive ? "#C4622D" : "#1A1A2E" }}>{dow}</div>
                  <div className="font-display italic text-[12px] mt-[2px]" style={{ color: isActive ? "#C4622D" : "#1A1A2E" }}>{dt.getDate()}</div>
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
  /** Guest view — every plan-edit affordance is suppressed; the companion stays. */
  readOnly?: boolean;
}

function formatDayTitle(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = d.toLocaleDateString("en-GB", { weekday: "long" });
  const dayNum = d.getDate();
  const monthName = d.toLocaleDateString("en-GB", { month: "long" });
  return `${dayName}, ${dayNum} ${monthName}`;
}

export default function DayViewClient({ trip, days, dayWithCards, hotelCards, readOnly = false }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [localCards, setLocalCards] = useState<Card[]>(dayWithCards.cards);

  const handleCardUpdate = useCallback(
    (updated: Card) => {
      setLocalCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelectedCard((prev) => (prev?.id === updated.id ? updated : prev));
    },
    []
  );

  const handleCardDelete = useCallback((cardId: string) => {
    setLocalCards((prev) => prev.filter((c) => c.id !== cardId));
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
    setIsCardOpen(false);
  }, []);

  const handleToggleConfirmed = useCallback(async (cardId: string) => {
    const card = localCards.find((c) => c.id === cardId);
    if (!card) return;
    const newValue = !card.confirmed;
    setLocalCards((prev) => prev.map((c) => c.id === cardId ? { ...c, confirmed: newValue } : c));
    setSelectedCard((prev) => prev?.id === cardId ? { ...prev, confirmed: newValue } : prev);
    const { error } = await supabase.from("cards").update({ confirmed: newValue }).eq("id", cardId);
    if (error) {
      setLocalCards((prev) => prev.map((c) => c.id === cardId ? { ...c, confirmed: !newValue } : c));
      setSelectedCard((prev) => prev?.id === cardId ? { ...prev, confirmed: !newValue } : prev);
    }
  }, [localCards, supabase]);

  const [isCardOpen, setIsCardOpen] = useState(false);
  const [swipeDir, setSwipeDir] = useState<"left" | "right" | null>(null);
  const [gapTimes, setGapTimes] = useState<{ start: string; end: string } | null>(null);

  // Companion open state — hoisted from Companion so the desktop body grid can
  // flip between 2 columns (timeline + map) and 3 columns (timeline + map +
  // companion). Mobile composition is unchanged: Companion owns its own state
  // when uncontrolled, but here it's controlled so the grid layout can react.
  const [companionOpen, setCompanionOpen] = useState(false);

  // ── Weather ────────────────────────────────────────────────────────────
  const [weatherByDate, setWeatherByDate] = useState<Record<string, DayWeather> | null>(null);
  const [weatherExpanded, setWeatherExpanded] = useState(false);

  useEffect(() => {
    if (!trip.destination_lat || !trip.destination_lng) return;

    const cached = weatherCache.get(trip.id);
    if (cached) {
      setWeatherByDate(cached);
      return;
    }

    fetchWeatherForTrip(
      trip.destination_lat,
      trip.destination_lng,
      trip.start_date,
      trip.end_date
    )
      .then((data) => {
        weatherCache.set(trip.id, data);
        setWeatherByDate(data);
      })
      .catch((err) => {
        console.error("[Roam] Weather fetch failed:", err);
      });
  }, [trip.id, trip.destination_lat, trip.destination_lng, trip.start_date, trip.end_date]);

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

  // Desktop-only — calendar popover for the "Day N of M ▾" chip.
  const [dayMenuOpen, setDayMenuOpen] = useState(false);
  useEffect(() => {
    setDayMenuOpen(false);
  }, [dayWithCards.id]);

  const handlePinTap = useCallback((cardId: string) => {
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setHighlightedCardId(cardId);
    setTimeout(() => setHighlightedCardId(null), 1200);
  }, []);

  const handleCardTap = useCallback((card: Card) => {
    setSelectedCard(card);
    setIsCardOpen(true);
  }, []);

  const handleGapTap = useCallback((startTime: string, endTime: string) => {
    setGapTimes({ start: startTime, end: endTime });
  }, []);

  const handleCardCreated = useCallback((card: Card) => {
    setLocalCards((prev) =>
      [...prev, card].sort((a, b) => {
        if (!a.start_time && !b.start_time) return 0;
        if (!a.start_time) return 1;
        if (!b.start_time) return -1;
        return a.start_time.localeCompare(b.start_time);
      })
    );
    setGapTimes(null);
  }, []);

  const dayWeather = weatherByDate?.[dayWithCards.date] ?? null;

  return (
    <div className="flex flex-col h-dvh md:block md:h-auto">
      {/* Mobile-only trip header — h-[58px] is constant; the subtitle row always reserves its height */}
      <div className="relative flex items-center bg-white border-b border-gray-100 flex-shrink-0 h-[58px] md:hidden">
        <Link
          href="/"
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Back to home"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>

        {/* Center: date title + weather subtitle */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2px] pointer-events-none">
          <span className="font-display italic text-[15px] text-gray-900">
            {formatDayTitle(dayWithCards.date)}
          </span>
          <WeatherSubtitle
            weather={dayWeather}
            expanded={weatherExpanded}
            onToggle={() => setWeatherExpanded((v) => !v)}
            controlsId="weather-expansion"
          />
        </div>

        <span className="flex-1" />
        {!readOnly && (
          <Link
            href={`/trips/${trip.id}/settings`}
            className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
            aria-label="Trip settings"
          >
            <DotsThree size={20} weight="light" />
          </Link>
        )}
        {readOnly && <span className="w-11 flex-shrink-0" />}
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
          className="flex items-center justify-center p-1.5 text-[rgba(26,26,46,0.55)] disabled:opacity-30 disabled:cursor-default cursor-pointer hover:text-activity transition-colors"
        >
          <CaretLeft size={16} weight="light" />
        </button>

        <span
          className="font-display italic font-medium text-[26px] text-activity"
          style={{ letterSpacing: "-0.01em" }}
        >
          {formatDayTitle(dayWithCards.date)}
        </span>

        <button
          onClick={goToNextDay}
          disabled={!nextDay}
          aria-label="Next day"
          className="flex items-center justify-center p-1.5 text-[rgba(26,26,46,0.55)] disabled:opacity-30 disabled:cursor-default cursor-pointer hover:text-activity transition-colors"
        >
          <CaretRight size={16} weight="light" />
        </button>

        {/* Day N of M ▾ chip with calendar popover */}
        <div className="relative ml-1.5">
          <button
            onClick={() => setDayMenuOpen((o) => !o)}
            aria-expanded={dayMenuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-full border border-[rgba(26,26,46,0.12)] bg-[rgba(26,26,46,0.025)] px-3 py-1.5 text-[12px] font-medium text-activity hover:bg-[rgba(26,26,46,0.05)] transition-colors"
            style={{ letterSpacing: "-0.005em" }}
          >
            <span>Day {currentIndex + 1} of {days.length}</span>
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                transform: dayMenuOpen ? "rotate(180deg)" : "none",
                transition: "transform 120ms",
                color: "rgba(26,26,46,0.55)",
              }}
            >
              <CaretDown size={11} weight="light" />
            </span>
          </button>

          {dayMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDayMenuOpen(false)}
              />
              <div
                role="menu"
                className="absolute top-[calc(100%+10px)] left-0 z-50 w-[280px] rounded-xl border border-[rgba(26,26,46,0.12)] bg-[#FAF7F2] p-3"
                style={{ boxShadow: "0 8px 28px rgba(26,26,46,0.08), 0 0 0 1px rgba(26,26,46,0.03)" }}
              >
                <div className="mt-1 flex flex-col gap-0.5">
                  {days.map((d) => {
                    const dt = new Date(d.date + "T00:00:00");
                    const dow = dt.toLocaleDateString("en-GB", { weekday: "short" });
                    const dayNum = dt.getDate();
                    const monthName = dt.toLocaleDateString("en-GB", { month: "short" });
                    const on = d.id === dayWithCards.id;
                    return (
                      <button
                        key={d.id}
                        role="menuitem"
                        onClick={() => {
                          setDayMenuOpen(false);
                          handleDaySelect(d);
                        }}
                        className="flex items-center gap-3.5 w-full px-2.5 py-2 rounded-md text-left"
                        style={{
                          background: on ? "#fff" : "transparent",
                          boxShadow: on ? "0 0 0 1px rgba(26,26,46,0.12)" : "none",
                        }}
                      >
                        <span
                          className="font-display italic text-[22px] w-8 text-center"
                          style={{
                            color: on ? "#1A1A2E" : "rgba(26,26,46,0.55)",
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {dayNum}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-[13px] font-medium text-activity"
                            style={{ letterSpacing: "-0.005em" }}
                          >
                            {dow}, {dayNum} {monthName}
                          </div>
                          <div
                            className="text-[11px] mt-px"
                            style={{ color: "rgba(26,26,46,0.55)" }}
                          >
                            Day {d.day_number}
                          </div>
                        </div>
                        {on && <div className="w-1 h-1 rounded-full bg-activity" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

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
        <div className="md:contents">
          <Companion
            tripId={trip.id}
            open={companionOpen}
            onOpenChange={setCompanionOpen}
            entryClassName="md:col-start-2 md:row-start-2"
            panelOuterClassName="md:relative md:inset-auto md:z-auto md:w-auto md:border-l-0 md:col-start-3 md:row-start-1 md:row-span-2 md:sticky md:top-6 md:self-start md:rounded-2xl md:shadow-[0_1px_2px_rgba(26,26,46,0.04),0_0_0_1px_rgba(26,26,46,0.12)] md:animate-none md:max-h-[calc(100dvh-104px)]"
          />
        </div>

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
              onCardTap={readOnly ? undefined : handleCardTap}
              highlightedCardId={highlightedCardId}
              onGapTap={readOnly ? undefined : handleGapTap}
              onToggleConfirmed={readOnly ? undefined : handleToggleConfirmed}
              cardNumberById={cardNumberById}
              readOnly={readOnly}
            />
          </div>
        </div>
      </div>

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
          tripDestination={trip.destination}
        />
      )}

      {/* Create card sheet — gapTimes.end available for future use by CreateCardSheet */}
      {gapTimes !== null && (
        <CreateCardSheet
          dayId={dayWithCards.id}
          tripId={trip.id}
          endPosition={localCards.reduce((m, c) => Math.max(m, c.position), 0) + 1}
          initialStartTime={gapTimes.start}
          onClose={() => setGapTimes(null)}
          onCardCreated={handleCardCreated}
        />
      )}

    </div>
  );
}
