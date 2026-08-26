// ── Shared trip weather: Open-Meteo fetch, per-trip cache, icons ──────────
// Extracted from DayViewClient so the Plan board can show per-day forecasts
// too. Client-side only (fetch + module cache).

export interface DayWeather {
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

export type WeatherCategory = "sunny" | "partly-cloudy" | "cloudy" | "rain" | "snow" | "fog";

// Module-level cache — survives client-side route changes within a session
export const weatherCache = new Map<string, Record<string, DayWeather>>();

// ── Open-Meteo fetch ───────────────────────────────────────────────────────
export async function fetchWeatherForTrip(
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
export function getWeatherCategory(code: number): WeatherCategory {
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

export function WeatherIcon({ category, size = 13 }: { category: WeatherCategory; size?: number }) {
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

// ── Hourly strip (8a–10p) — shared by the Agenda expansion and the Plan
//    board's per-day popover ────────────────────────────────────────────────
export const HOURLY_INDICES = [8, 10, 12, 14, 16, 18, 20, 22];
export const HOURLY_LABELS = ["8a", "10a", "12p", "2p", "4p", "6p", "8p", "10p"];

export function HourlyStrip({ weather }: { weather: DayWeather }) {
  return (
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
  );
}
