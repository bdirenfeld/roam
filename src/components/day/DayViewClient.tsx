"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DotsThree } from "@phosphor-icons/react";
import DayStrip from "@/components/day/DayStrip";
import DayMap from "@/components/day/DayMap";
import CardTimeline from "@/components/day/CardTimeline";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import CreateCardSheet from "@/components/plan/CreateCardSheet";
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
    hourly: "precipitation_probability,temperature_2m",
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

function WeatherIcon({ category }: { category: WeatherCategory }) {
  const stroke = ICON_COLOR[category];
  const base = {
    width: 13,
    height: 13,
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

// ── Weather subtitle row ──────────────────────────────────────────────────
function WeatherSubtitle({
  weather,
  onTap,
}: {
  weather: DayWeather | null;
  onTap: () => void;
}) {
  if (!weather) {
    // Reserve height so the header never resizes on data arrival
    return <div className="h-[13px]" />;
  }

  const category = getWeatherCategory(weather.condition_code);
  const conditionText = getConditionText(weather);

  return (
    <button
      onClick={onTap}
      className="pointer-events-auto flex items-center gap-1 h-[13px]"
      aria-label="View weather details"
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
    </button>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
interface Props {
  trip: Trip;
  days: Day[];
  dayWithCards: DayWithCards;
  hotelCards: Card[];
}

function formatDayTitle(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dayName = d.toLocaleDateString("en-GB", { weekday: "long" });
  const dayNum = d.getDate();
  const monthName = d.toLocaleDateString("en-GB", { month: "long" });
  return `${dayName}, ${dayNum} ${monthName}`;
}

export default function DayViewClient({ trip, days, dayWithCards, hotelCards }: Props) {
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
  const [gapStartTime, setGapStartTime] = useState<string | null>(null);

  // ── Weather ────────────────────────────────────────────────────────────
  const [weatherByDate, setWeatherByDate] = useState<Record<string, DayWeather> | null>(null);
  const [weatherModalOpen, setWeatherModalOpen] = useState(false);

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

    const mappableHotels = hotelCards.filter((c) => {
      if (c.lat != null && c.lng != null) return true;
      const d = c.details as Record<string, unknown>;
      return typeof d?.lat === "number" && typeof d?.lng === "number";
    });

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
        if (c.lat != null && c.lng != null) return true;
        const d = c.details as Record<string, unknown>;
        return typeof d?.lat === "number" && typeof d?.lng === "number";
      }),
    [localCards, accommodationCard]
  );

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

  const handleGapTap = useCallback((startTime: string) => {
    setGapStartTime(startTime);
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
    setGapStartTime(null);
  }, []);

  const dayWeather = weatherByDate?.[dayWithCards.date] ?? null;

  return (
    <div className="flex flex-col h-dvh">
      {/* Trip header — h-[58px] is constant; the subtitle row always reserves its height */}
      <div className="relative flex items-center bg-white border-b border-gray-100 flex-shrink-0 h-[58px]">
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
            onTap={() => setWeatherModalOpen(true)}
          />
        </div>

        <span className="flex-1" />
        <Link
          href={`/trips/${trip.id}/settings`}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Trip settings"
        >
          <DotsThree size={20} weight="light" />
        </Link>
      </div>

      {/* Day strip */}
      <DayStrip
        days={days}
        activeDayId={dayWithCards.id}
        tripId={trip.id}
        onDaySelect={handleDaySelect}
      />

      {/* Map */}
      <DayMap
        cards={mappableCards}
        accommodationCard={accommodationCard ?? undefined}
        centerLat={trip.destination_lat ?? 41.9028}
        centerLng={trip.destination_lng ?? 12.4964}
        onPinTap={handlePinTap}
      />

      {/* Scrollable cards */}
      <div
        className={`flex-1 overflow-y-auto min-h-0 pb-20 transition-opacity ${
          contentVisible
            ? "opacity-100 duration-[200ms] ease-in"
            : "opacity-0 duration-[150ms] ease-out"
        }`}
      >
        <div
          key={dayWithCards.id}
          className={`px-4 pt-4 ${
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
            onGapTap={handleGapTap}
            onToggleConfirmed={handleToggleConfirmed}
          />
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

      {/* Create card sheet */}
      {gapStartTime !== null && (
        <CreateCardSheet
          dayId={dayWithCards.id}
          tripId={trip.id}
          endPosition={localCards.reduce((m, c) => Math.max(m, c.position), 0) + 1}
          initialStartTime={gapStartTime}
          onClose={() => setGapStartTime(null)}
          onCardCreated={handleCardCreated}
        />
      )}

      {/* Weather detail modal (placeholder) */}
      {weatherModalOpen && (
        <div
          className="fixed inset-0 z-60 flex items-end justify-center"
          onClick={() => setWeatherModalOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-t-2xl w-full max-w-[390px] px-6 pt-4 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-[3px] rounded-full bg-gray-200 mx-auto mb-5" />
            <h2 className="font-display italic text-[18px] text-gray-900 mb-2">
              {formatDayTitle(dayWithCards.date)}
            </h2>
            <p className="text-[14px] text-gray-500">Detailed forecast coming soon.</p>
          </div>
        </div>
      )}
    </div>
  );
}
