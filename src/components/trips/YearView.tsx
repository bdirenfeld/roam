"use client";

// ── "Your year" — 12-month planning strip on the Journeys page ────────────
// Rolling window (current month + next 11) with four lanes: journeys,
// family birthdays, the TDSB school calendar, and a climate heat row for a
// picked destination. The point of the section is the "open windows" —
// school breaks and 3+ day weekends with no journey booked yet, drawn as
// dashed pills and listed below the strip with a "Plan it" link.
//
// Static inputs live in src/lib/yearView/ (familyDates, schoolCalendar).
// Climate comes from Open-Meteo's archive API, fetched lazily client-side
// and cached at module level — the page render never waits on it.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { FAMILY_DATES } from "@/lib/yearView/familyDates";
import { SCHOOL_CALENDAR } from "@/lib/yearView/schoolCalendar";

// Brennan's own "ideal times to travel", stored per-user in Supabase
// (public.travel_windows, RLS own-row). The table isn't in the generated
// Database types yet, so calls below cast the client — deliberately kept to
// this one component rather than regenerating types mid-flight.
interface TravelWindow {
  id: string;
  label: string | null;
  start_date: string;
  end_date: string;
}

export interface YearViewTrip {
  id: string;
  title: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  archived: boolean;
  // Same target TripCard links to — today's day clamped to the journey range
  openDayId?: string;
}

interface Props {
  trips: YearViewTrip[];
}

const OPEN_KEY = "roam_year_view_open";

// ── Date helpers (date-only, local — matches tripRecency's approach) ──────
const DAY_MS = 24 * 60 * 60 * 1000;
const parseDate = (iso: string) => new Date(iso + "T00:00:00");
const isoOf = (dt: Date) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
const addDays = (dt: Date, n: number) =>
  new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
const isWeekend = (dt: Date) => dt.getDay() === 0 || dt.getDay() === 6;
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const daysBetweenInclusive = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1;
const maxDate = (a: Date, b: Date) => (a > b ? a : b);
const minDate = (a: Date, b: Date) => (a < b ? a : b);
const fmtMD = (dt: Date) =>
  dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const formatRange = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.toLocaleDateString("en-US", { month: "short" })} ${a.getDate()}–${b.getDate()}`
    : `${fmtMD(a)} – ${fmtMD(b)}`;

// ── Climate (Open-Meteo archive), module-level cache ──────────────────────
interface MonthClimate {
  high: number; // mean daily max °C for the calendar month
  rainShare: number; // share of days with ≥1mm precipitation, 0..1
}

const climateCache = new Map<string, MonthClimate[]>();

async function fetchClimate(lat: number, lng: number): Promise<MonthClimate[]> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = climateCache.get(key);
  if (cached) return cached;

  const y = new Date().getFullYear();
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: `${y - 5}-01-01`, // past 5 full years
    end_date: `${y - 1}-12-31`,
    daily: "temperature_2m_max,precipitation_sum",
    timezone: "auto",
  });
  const res = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo archive responded ${res.status}`);
  const data = (await res.json()) as {
    daily: { time: string[]; temperature_2m_max: (number | null)[]; precipitation_sum: (number | null)[] };
  };

  const sum = Array(12).fill(0) as number[];
  const cnt = Array(12).fill(0) as number[];
  const rainy = Array(12).fill(0) as number[];
  for (let i = 0; i < data.daily.time.length; i++) {
    const mi = Number(data.daily.time[i].slice(5, 7)) - 1;
    const t = data.daily.temperature_2m_max[i];
    if (t == null) continue;
    sum[mi] += t;
    cnt[mi] += 1;
    if ((data.daily.precipitation_sum[i] ?? 0) >= 1) rainy[mi] += 1;
  }
  const result: MonthClimate[] = sum.map((s, mi) => ({
    high: cnt[mi] > 0 ? Math.round(s / cnt[mi]) : 0,
    rainShare: cnt[mi] > 0 ? rainy[mi] / cnt[mi] : 1,
  }));
  climateCache.set(key, result);
  return result;
}

type HeatTone = "great" | "good" | "fair" | "rough";

function scoreMonth(c: MonthClimate): HeatTone {
  if (c.high >= 18 && c.high <= 28 && c.rainShare < 0.3) return "great";
  if (c.high >= 13 && c.high <= 31 && c.rainShare < 0.4) return "good";
  if (c.high >= 8 && c.high <= 33) return "fair";
  return "rough";
}

const HEAT_STYLE: Record<HeatTone, { bg: string; fg: string }> = {
  great: { bg: "#DCE8D4", fg: "#3F5D33" },
  good:  { bg: "#EDE9D8", fg: "#6B6538" },
  fair:  { bg: "#F3E4CE", fg: "#8A5F2E" },
  rough: { bg: "#F5DAD2", fg: "#93402A" },
};

interface GeoResult {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

async function geocode(q: string): Promise<GeoResult[]> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: GeoResult[] };
  return data.results ?? [];
}

// ── Shared grid: 110px label column + 12 equal month columns ──────────────
const GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "110px repeat(12, 1fr)",
  columnGap: 5,
};
const LANE_BORDER = "1px solid rgba(26,26,46,0.06)";
const HATCH =
  "repeating-linear-gradient(45deg, rgba(26,26,46,0.10), rgba(26,26,46,0.10) 3px, transparent 3px, transparent 7px)";
// Solid card background — the sticky label column and the edge fades must
// paint the exact same colour, so no translucent card bg here.
const CARD_BG = "#FCFAF7";
// Lane-label cells stay pinned while the strip scrolls under them
const STICKY_LABEL: CSSProperties = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  background: CARD_BG,
  alignSelf: "stretch",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

interface OpenWindow {
  key: string;
  name: string; // "March break", "Family Day", "PA day", or an ideal window's label
  kind: "break" | "weekend" | "ideal";
  coreStart: Date; // printed range (the break / long weekend itself)
  coreEnd: Date;
  start: Date; // extended with adjacent weekends — pill + overlap math
  end: Date;
  days: number; // inclusive days of the extended range
}

export default function YearView({ trips }: Props) {
  // null until mounted — the body is client-only, so localStorage and the
  // viewport width can decide the default without a hydration mismatch.
  const [openState, setOpenState] = useState<boolean | null>(null);
  const [dest, setDest] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [climate, setClimate] = useState<MonthClimate[] | null>(null);
  const [climateError, setClimateError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Ideal travel windows (Supabase-backed) + the inline add form
  const [travelWindows, setTravelWindows] = useState<TravelWindow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [saving, setSaving] = useState(false);
  // Popovers render position:fixed (anchored at open time) so the strip's
  // overflow container can't clip them; these hold the anchor coordinates.
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [addPos, setAddPos] = useState<{ top: number; left: number } | null>(null);
  // Edge fades on the horizontal strip — signal there's more to swipe
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const updateEdges = () => {
    const el = scrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    // Identity-stable: scrolling fires constantly, only edge flips re-render
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  };

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(OPEN_KEY);
    } catch {}
    if (stored === "1") setOpenState(true);
    else if (stored === "0") setOpenState(false);
    else setOpenState(window.innerWidth >= 768); // default: open on desktop
  }, []);

  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {}
  };

  // Measure scrollability once the strip is on screen (initial scroll stays
  // at the left edge — the current month)
  useEffect(() => {
    if (openState === true) updateEdges();
  }, [openState]);

  // ── Ideal travel windows: load, add, delete (RLS scopes to the user) ────
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    // Cast: travel_windows isn't in the generated Database types yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("travel_windows")
      .select("id, label, start_date, end_date")
      .order("start_date", { ascending: true })
      .then(({ data }: { data: TravelWindow[] | null }) => {
        if (!cancelled && data) setTravelWindows(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddWindow = async () => {
    if (saving || !formStart || !formEnd || formEnd < formStart) return;
    setSaving(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("travel_windows")
      .insert({
        user_id: user.id,
        label: formLabel.trim() || "Ideal window",
        start_date: formStart,
        end_date: formEnd,
      })
      .select("id, label, start_date, end_date")
      .single();
    setSaving(false);
    if (error || !data) {
      console.error("Failed to add travel window:", error);
      return;
    }
    setTravelWindows((prev) =>
      [...prev, data as TravelWindow].sort((a, b) => a.start_date.localeCompare(b.start_date))
    );
    setAddOpen(false);
    setFormLabel("");
    setFormStart("");
    setFormEnd("");
  };

  const handleDeleteWindow = async (id: string) => {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("travel_windows").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete travel window:", error);
      return;
    }
    setTravelWindows((prev) => prev.filter((w) => w.id !== id));
  };

  // ── Rolling 12-month window ─────────────────────────────────────────────
  const { todayD, winStart, winEnd, months } = useMemo(() => {
    const now = new Date();
    const todayD = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const winStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const winEnd = addDays(new Date(now.getFullYear(), now.getMonth() + 12, 1), -1);
    const months = Array.from(
      { length: 12 },
      (_, i) => new Date(winStart.getFullYear(), winStart.getMonth() + i, 1)
    );
    return { todayD, winStart, winEnd, months };
  }, []);

  // Positions map a date to a % across 12 equal-width month cells (a month's
  // share of the track is constant, days interpolate within it) so bands and
  // dots line up with the month header regardless of month lengths.
  const monthIndexOf = (dt: Date) =>
    (dt.getFullYear() - winStart.getFullYear()) * 12 + dt.getMonth() - winStart.getMonth();
  const posOf = (dt: Date, dayFraction: number) => {
    const raw = monthIndexOf(dt) + dayFraction / daysInMonth(dt.getFullYear(), dt.getMonth());
    return (Math.min(Math.max(raw, 0), 12) / 12) * 100;
  };
  const posStart = (dt: Date) => posOf(dt, dt.getDate() - 1);
  const posEnd = (dt: Date) => posOf(dt, dt.getDate()); // inclusive end
  const posMid = (dt: Date) => posOf(dt, dt.getDate() - 0.5);

  const visibleTrips = useMemo(
    () =>
      trips.filter(
        (t) =>
          !t.archived &&
          t.start_date &&
          t.end_date &&
          parseDate(t.end_date) >= winStart &&
          parseDate(t.start_date) <= winEnd
      ),
    [trips, winStart, winEnd]
  );

  // Birthday occurrence inside the window (annual → exactly one each)
  const birthdays = useMemo(
    () =>
      FAMILY_DATES.map((f) => {
        const inStartYear = new Date(winStart.getFullYear(), f.month - 1, f.day);
        const date =
          inStartYear >= winStart && inStartYear <= winEnd
            ? inStartYear
            : new Date(winStart.getFullYear() + 1, f.month - 1, f.day);
        return { ...f, date };
      }).filter((b) => b.date >= winStart && b.date <= winEnd),
    [winStart, winEnd]
  );

  const schoolInWindow = useMemo(
    () =>
      SCHOOL_CALENDAR.filter(
        (e) => parseDate(e.end) >= winStart && parseDate(e.start) <= winEnd
      ),
    [winStart, winEnd]
  );

  // ── Open windows — the reason this section exists ───────────────────────
  const openWindows = useMemo<OpenWindow[]>(() => {
    const activeTrips = trips.filter((t) => !t.archived && t.start_date && t.end_date);
    const overlapsTrip = (start: Date, end: Date) =>
      activeTrips.some(
        (t) => parseDate(t.start_date) <= end && parseDate(t.end_date) >= start
      );

    // Off-days that can chain onto a weekend: PA days + stat holidays
    const singles = SCHOOL_CALENDAR.filter((e) => e.kind === "pa" || e.kind === "stat");
    const offSet = new Set(singles.map((e) => e.start));
    const isOff = (dt: Date) => isWeekend(dt) || offSet.has(isoOf(dt));
    const breaks = SCHOOL_CALENDAR.filter((e) => e.kind === "break");

    const found: OpenWindow[] = [];

    // (a) School breaks with no journey overlapping (weekends folded in)
    for (const b of breaks) {
      const bStart = parseDate(b.start);
      const bEnd = parseDate(b.end);
      if (bEnd < todayD || bStart > winEnd) continue;
      let extStart = bStart;
      while (isOff(addDays(extStart, -1))) extStart = addDays(extStart, -1);
      let extEnd = bEnd;
      while (isOff(addDays(extEnd, 1))) extEnd = addDays(extEnd, 1);
      if (overlapsTrip(extStart, extEnd)) continue;
      // A break already underway only offers its remaining days
      const start = maxDate(extStart, todayD);
      found.push({
        key: `break-${b.start}`,
        name: `${b.label} break`,
        kind: "break",
        coreStart: maxDate(bStart, todayD),
        coreEnd: bEnd,
        start,
        end: extEnd,
        days: daysBetweenInclusive(start, extEnd),
      });
    }

    // (b) PA days / stats that chain with a weekend into a 3+ day block
    const seen = new Set<string>();
    for (const s of singles) {
      const d0 = parseDate(s.start);
      if (d0 < todayD || d0 > winEnd) continue;
      // Skip days swallowed by a break (e.g. Labour Day inside summer)
      if (breaks.some((b) => d0 >= parseDate(b.start) && d0 <= parseDate(b.end))) continue;
      let runStart = d0;
      while (isOff(addDays(runStart, -1))) runStart = addDays(runStart, -1);
      let runEnd = d0;
      while (isOff(addDays(runEnd, 1))) runEnd = addDays(runEnd, 1);
      const days = daysBetweenInclusive(runStart, runEnd);
      if (days < 3) continue;
      const key = `run-${isoOf(runStart)}`;
      if (seen.has(key)) continue; // Fri PA + Mon stat share one run
      seen.add(key);
      if (overlapsTrip(runStart, runEnd)) continue;
      // Name the run after its stat holiday when it has one
      const stat = singles.find((e) => {
        const ed = parseDate(e.start);
        return e.kind === "stat" && ed >= runStart && ed <= runEnd;
      });
      found.push({
        key,
        name: stat ? stat.label : "PA day",
        kind: "weekend",
        coreStart: runStart,
        coreEnd: runEnd,
        start: runStart,
        end: runEnd,
        days,
      });
    }

    // (c) Brennan's own ideal windows with no journey booked over them
    for (const w of travelWindows) {
      const wStart = parseDate(w.start_date);
      const wEnd = parseDate(w.end_date);
      if (wEnd < todayD || wStart > winEnd) continue;
      if (overlapsTrip(wStart, wEnd)) continue;
      const start = maxDate(wStart, todayD);
      found.push({
        key: `ideal-${w.id}`,
        name: w.label || "Ideal window",
        kind: "ideal",
        coreStart: start,
        coreEnd: wEnd,
        start,
        end: wEnd,
        days: daysBetweenInclusive(start, wEnd),
      });
    }

    found.sort((a, b) => a.start.getTime() - b.start.getTime());
    return found.slice(0, 5); // soonest first, capped
  }, [trips, travelWindows, todayD, winEnd]);

  // ── Destination default: next upcoming journey, else Lisbon ─────────────
  useEffect(() => {
    const next = trips
      .filter((t) => !t.archived && t.end_date && parseDate(t.end_date) >= todayD)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
    const name = (next?.destination || "Lisbon").split(",")[0].trim();
    let cancelled = false;
    (async () => {
      let rs = await geocode(name).catch(() => [] as GeoResult[]);
      if (rs.length === 0 && name !== "Lisbon") {
        rs = await geocode("Lisbon").catch(() => [] as GeoResult[]);
      }
      if (!cancelled && rs[0]) {
        setDest({ label: rs[0].name, lat: rs[0].latitude, lng: rs[0].longitude });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once — the default shouldn't chase later prop refreshes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dest) return;
    let cancelled = false;
    setClimate(null);
    setClimateError(false);
    fetchClimate(dest.lat, dest.lng)
      .then((c) => {
        if (!cancelled) setClimate(c);
      })
      .catch(() => {
        if (!cancelled) setClimateError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dest]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setResults(await geocode(q).catch(() => [] as GeoResult[]));
    setSearching(false);
  };

  const isOpen = openState === true;

  // Collapsed (and pre-mount): a slim disclosure row, not a card — it sits
  // between the page header and the first journey card and must read as a
  // section toggle, never an empty trip.
  if (!isOpen) {
    return (
      <div
        className="mx-4 md:mx-0 mt-1 md:mt-3"
        style={{ borderBottom: "1px solid rgba(26,26,46,0.08)" }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-expanded={false}
          className="flex w-full items-center justify-between"
          style={{ minHeight: 44 }}
        >
          <span
            className="font-sans"
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(26,26,46,0.5)",
            }}
          >
            Your year
          </span>
          <span style={{ fontSize: 11.5, color: "rgba(26,26,46,0.4)" }}>▾</span>
        </button>
      </div>
    );
  }

  return (
    <section
      className="mx-4 mt-3 md:mx-0 md:mt-5 rounded-[14px]"
      style={{ border: "1px solid rgba(26,26,46,0.08)", background: CARD_BG }}
    >
      {/* Header row — whole row collapses the card */}
      <button
        onClick={() => setOpen(false)}
        aria-expanded
        className="flex w-full items-center justify-between px-4 md:px-5"
        style={{ minHeight: 44 }}
      >
        <span
          className="font-sans"
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "rgba(26,26,46,0.5)",
          }}
        >
          Your year
        </span>
        <span style={{ fontSize: 11.5, color: "rgba(26,26,46,0.4)" }}>Hide ▴</span>
      </button>

      {/* Body — on mobile the Open-windows list leads (vertical, actionable)
          and the strip follows; desktop keeps the strip first */}
      <div className="flex flex-col px-4 pb-3 md:px-5 md:pb-4">
        <div
          className={`order-2 md:order-1 relative ${
            openWindows.length > 0
              ? "mt-2 pt-1 border-t border-[rgba(26,26,46,0.06)] md:mt-0 md:pt-0 md:border-t-0"
              : ""
          }`}
        >
          {/* The strip scrolls sideways on its own; the page never does */}
          <div ref={scrollRef} onScroll={updateEdges} className="overflow-x-auto">
            <div style={{ minWidth: 960 }}>
              {/* Month header — year shown where it changes */}
              <div style={GRID} className="mt-2">
                <div style={STICKY_LABEL} />
                {months.map((m, i) => (
                  <div
                    key={m.getTime()}
                    className="text-center"
                    style={{
                      fontSize: 9.5,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "rgba(26,26,46,0.38)",
                      paddingBottom: 8,
                    }}
                  >
                    {m.toLocaleDateString("en-US", { month: "short" })}
                    {(i === 0 || m.getMonth() === 0) && (
                      <span style={{ color: "rgba(26,26,46,0.28)" }}>
                        {" ’"}
                        {String(m.getFullYear()).slice(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Journeys lane — booked pills + dashed open windows */}
              <div style={{ ...GRID, borderTop: LANE_BORDER }} className="items-center py-[6px]">
                <div style={{ ...STICKY_LABEL, fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.6)" }}>
                  Journeys
                </div>
                <div style={{ gridColumn: "2 / 14", position: "relative", height: 26 }}>
                  {openWindows.map((w) => {
                    const left = posStart(maxDate(w.start, winStart));
                    const width = posEnd(minDate(w.end, winEnd)) - left;
                    return (
                      <Link
                        key={w.key}
                        href="/trips/new"
                        title={`${w.name} · ${formatRange(w.coreStart, w.coreEnd)} — no journey planned`}
                        style={{
                          position: "absolute",
                          left: `${left}%`,
                          width: `${width}%`,
                          minWidth: 18,
                          top: 2,
                          height: 22,
                          borderRadius: 999,
                          border: "1.5px dashed rgba(26,26,46,0.35)",
                          background: "transparent",
                          color: "rgba(26,26,46,0.55)",
                          fontSize: 10.5,
                          fontWeight: 600,
                          lineHeight: "19px",
                          padding: "0 8px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        Open
                      </Link>
                    );
                  })}
                  {visibleTrips.map((t) => {
                    const start = parseDate(t.start_date);
                    const end = parseDate(t.end_date);
                    const past = end < todayD;
                    const left = posStart(maxDate(start, winStart));
                    const width = posEnd(minDate(end, winEnd)) - left;
                    return (
                      <Link
                        key={t.id}
                        href={t.openDayId ? `/trips/${t.id}/days/${t.openDayId}` : `/trips/${t.id}`}
                        title={`${t.title} · ${formatRange(start, end)}`}
                        style={{
                          position: "absolute",
                          left: `${left}%`,
                          width: `${width}%`,
                          minWidth: 18,
                          top: 2,
                          height: 22,
                          borderRadius: 999,
                          background: past ? "rgba(26,26,46,0.16)" : "#1A1A2E",
                          color: past ? "#1A1A2E" : "#FAF7F2",
                          fontSize: 10.5,
                          fontWeight: 600,
                          lineHeight: "22px",
                          padding: "0 8px",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.title}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Ideal times lane — Brennan's own travel windows (teal pills) */}
              <div style={{ ...GRID, borderTop: LANE_BORDER }} className="items-center py-[6px]">
                <div style={{ ...STICKY_LABEL, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.6)" }}>
                    Ideal times
                  </div>
                  <button
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setAddPos({
                        top: r.bottom + 4,
                        left: Math.max(8, Math.min(r.left, window.innerWidth - 246)),
                      });
                      setAddOpen((v) => !v);
                    }}
                    className="flex items-center"
                    style={{
                      fontSize: 9.5,
                      color: "rgba(26,26,46,0.4)",
                      minHeight: 40,
                      margin: "-10px 0 -12px",
                    }}
                    aria-expanded={addOpen}
                  >
                    + Add window
                  </button>
                  {addOpen && addPos && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setAddOpen(false)} />
                      <div
                        className="z-30 bg-white rounded-xl p-2.5 space-y-2"
                        style={{
                          position: "fixed",
                          top: addPos.top,
                          left: addPos.left,
                          width: 230,
                          border: "1px solid rgba(26,26,46,0.08)",
                          boxShadow: "0 8px 30px rgba(26,26,46,0.18)",
                        }}
                      >
                        <input
                          value={formLabel}
                          onChange={(e) => setFormLabel(e.target.value)}
                          placeholder="Label (optional)"
                          className="w-full rounded-lg px-2.5 py-1.5"
                          style={{
                            fontSize: 12,
                            border: "1px solid rgba(26,26,46,0.12)",
                            background: "#FAF7F2",
                            outline: "none",
                          }}
                        />
                        <div className="flex gap-1.5">
                          <input
                            type="date"
                            value={formStart}
                            onChange={(e) => setFormStart(e.target.value)}
                            aria-label="Start date"
                            className="w-1/2 rounded-lg px-1.5 py-1"
                            style={{ fontSize: 11, border: "1px solid rgba(26,26,46,0.12)", background: "#FAF7F2" }}
                          />
                          <input
                            type="date"
                            value={formEnd}
                            onChange={(e) => setFormEnd(e.target.value)}
                            aria-label="End date"
                            className="w-1/2 rounded-lg px-1.5 py-1"
                            style={{ fontSize: 11, border: "1px solid rgba(26,26,46,0.12)", background: "#FAF7F2" }}
                          />
                        </div>
                        <button
                          onClick={handleAddWindow}
                          disabled={saving || !formStart || !formEnd || formEnd < formStart}
                          className="w-full rounded-lg py-1.5 disabled:opacity-40 transition-opacity"
                          style={{ fontSize: 12, fontWeight: 600, background: "#1A1A2E", color: "#FAF7F2" }}
                        >
                          {saving ? "Adding…" : "Add"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ gridColumn: "2 / 14", position: "relative", height: 26 }}>
                  {travelWindows
                    .filter(
                      (w) => parseDate(w.end_date) >= winStart && parseDate(w.start_date) <= winEnd
                    )
                    .map((w) => {
                      const left = posStart(maxDate(parseDate(w.start_date), winStart));
                      const width = posEnd(minDate(parseDate(w.end_date), winEnd)) - left;
                      return (
                        <div
                          key={w.id}
                          className="group/iw"
                          title={`${w.label || "Ideal window"} · ${formatRange(parseDate(w.start_date), parseDate(w.end_date))}`}
                          style={{
                            position: "absolute",
                            left: `${left}%`,
                            width: `${width}%`,
                            minWidth: 18,
                            top: 2,
                            height: 22,
                            borderRadius: 999,
                            border: "1.5px solid rgba(53,118,110,0.55)",
                            background: "rgba(53,118,110,0.08)",
                            color: "#2F6E68",
                            fontSize: 10.5,
                            fontWeight: 600,
                            display: "flex",
                            alignItems: "center",
                            padding: "0 8px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                            {w.label || "Ideal window"}
                          </span>
                          <button
                            onClick={() => handleDeleteWindow(w.id)}
                            aria-label={`Remove ${w.label || "ideal window"}`}
                            className="opacity-0 [@media(hover:hover)]:group-hover/iw:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                            style={{ marginLeft: 4, fontSize: 11, lineHeight: 1, color: "rgba(47,110,104,0.8)" }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Birthdays lane — gold diamonds, names beneath */}
              <div style={{ ...GRID, borderTop: LANE_BORDER }} className="items-center py-[6px]">
                <div style={{ ...STICKY_LABEL, fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.6)" }}>
                  Birthdays
                </div>
                <div style={{ gridColumn: "2 / 14", position: "relative", height: 32 }}>
                  {birthdays.map((b) => (
                    <div
                      key={b.name}
                      title={`${b.name} · ${fmtMD(b.date)}`}
                      style={{
                        position: "absolute",
                        left: `${posMid(b.date)}%`,
                        top: 1,
                        transform: "translateX(-50%)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <i
                        style={{
                          width: 8,
                          height: 8,
                          background: "#D18A2E",
                          transform: "rotate(45deg)",
                          borderRadius: 2,
                        }}
                      />
                      <span style={{ fontSize: 8.5, color: "rgba(26,26,46,0.55)", marginTop: 4 }}>
                        {b.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* School lane — hatched breaks, PA dots, faint stat dots */}
              <div style={{ ...GRID, borderTop: LANE_BORDER }} className="items-center py-[6px]">
                <div style={{ ...STICKY_LABEL, fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.6)" }}>
                  School
                  <small
                    style={{ display: "block", fontWeight: 400, fontSize: 9.5, color: "rgba(26,26,46,0.35)" }}
                  >
                    breaks &amp; PA days
                  </small>
                </div>
                <div style={{ gridColumn: "2 / 14", position: "relative", height: 26 }}>
                  {schoolInWindow
                    .filter((e) => e.kind === "break")
                    .map((e) => {
                      const left = posStart(maxDate(parseDate(e.start), winStart));
                      const width = posEnd(minDate(parseDate(e.end), winEnd)) - left;
                      return (
                        <div
                          key={`${e.label}-${e.start}`}
                          title={`${e.label} break · ${formatRange(parseDate(e.start), parseDate(e.end))}`}
                          style={{
                            position: "absolute",
                            left: `${left}%`,
                            width: `${width}%`,
                            top: 5,
                            height: 15,
                            borderRadius: 3,
                            background: HATCH,
                            fontSize: 9,
                            color: "rgba(26,26,46,0.5)",
                            display: "flex",
                            alignItems: "center",
                            padding: "0 6px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                          }}
                        >
                          {e.label}
                        </div>
                      );
                    })}
                  {schoolInWindow
                    .filter((e) => e.kind === "pa")
                    .map((e) => (
                      <div
                        key={`pa-${e.start}`}
                        title={`PA day · ${fmtMD(parseDate(e.start))}`}
                        style={{
                          position: "absolute",
                          left: `${posMid(parseDate(e.start))}%`,
                          top: 9,
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "#C4622D",
                          opacity: 0.75,
                          transform: "translateX(-50%)",
                        }}
                      />
                    ))}
                  {schoolInWindow
                    .filter((e) => e.kind === "stat")
                    .map((e) => (
                      <div
                        key={`stat-${e.start}`}
                        title={`${e.label} · ${fmtMD(parseDate(e.start))}`}
                        style={{
                          position: "absolute",
                          left: `${posMid(parseDate(e.start))}%`,
                          top: 10,
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: "rgba(26,26,46,0.30)",
                          transform: "translateX(-50%)",
                        }}
                      />
                    ))}
                </div>
              </div>

              {/* Weather heat row — picked destination, months in window order */}
              <div style={{ ...GRID, borderTop: LANE_BORDER }} className="items-center py-[6px]">
                <div style={{ ...STICKY_LABEL, alignItems: "flex-start" }}>
                  {/* 40px hit area; the visual pill is the inner span */}
                  <button
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setPickerPos({
                        top: r.bottom + 4,
                        left: Math.max(8, Math.min(r.left, window.innerWidth - 236)),
                      });
                      setPickerOpen((v) => !v);
                      setQuery("");
                      setResults([]);
                    }}
                    className="font-sans flex items-center"
                    title="Change destination"
                    style={{ minHeight: 40, margin: "-7px 0", maxWidth: 106 }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        background: "#F2EDE3",
                        border: "1px solid rgba(26,26,46,0.12)",
                        borderRadius: 999,
                        padding: "3px 9px",
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: "#1A1A2E",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        maxWidth: "100%",
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {dest?.label ?? "…"}
                      </span>
                      ▾
                    </span>
                  </button>
                  {pickerOpen && pickerPos && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
                      <div
                        className="z-30 bg-white rounded-xl p-2"
                        style={{
                          position: "fixed",
                          top: pickerPos.top,
                          left: pickerPos.left,
                          width: 220,
                          border: "1px solid rgba(26,26,46,0.08)",
                          boxShadow: "0 8px 30px rgba(26,26,46,0.18)",
                        }}
                      >
                        <input
                          autoFocus
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") runSearch();
                          }}
                          placeholder="Type a city, press Enter"
                          className="w-full rounded-lg px-2.5 py-1.5"
                          style={{
                            fontSize: 12,
                            border: "1px solid rgba(26,26,46,0.12)",
                            background: "#FAF7F2",
                            outline: "none",
                          }}
                        />
                        {searching && (
                          <div style={{ fontSize: 11, color: "rgba(26,26,46,0.4)", padding: "6px 4px 2px" }}>
                            Searching…
                          </div>
                        )}
                        {!searching &&
                          results.map((r, i) => (
                            <button
                              key={`${r.latitude},${r.longitude},${i}`}
                              onClick={() => {
                                setDest({ label: r.name, lat: r.latitude, lng: r.longitude });
                                setPickerOpen(false);
                              }}
                              className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
                              style={{ fontSize: 12, color: "#1A1A2E" }}
                            >
                              {r.name}
                              <span style={{ color: "rgba(26,26,46,0.4)" }}>
                                {r.admin1 ? `, ${r.admin1}` : ""}
                                {r.country ? `, ${r.country}` : ""}
                              </span>
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </div>
                {months.map((m) => {
                  const c = climate?.[m.getMonth()];
                  const tone = c ? scoreMonth(c) : null;
                  return (
                    <div
                      key={`heat-${m.getTime()}`}
                      title={
                        c
                          ? `Mean high ${c.high}° · rainy days ${Math.round(c.rainShare * 100)}%`
                          : climateError
                            ? "Climate data unavailable"
                            : "Loading climate…"
                      }
                      style={{
                        height: 26,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 600,
                        background: tone ? HEAT_STYLE[tone].bg : "rgba(26,26,46,0.05)",
                        color: tone ? HEAT_STYLE[tone].fg : "rgba(26,26,46,0.3)",
                      }}
                    >
                      {c ? `${c.high}°` : "–"}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Edge fades — hint that the strip swipes. The left fade starts
              after the sticky 110px label column. */}
          {edges.left && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0"
              style={{
                left: 110,
                width: 24,
                zIndex: 3,
                background: `linear-gradient(to right, ${CARD_BG}, rgba(252,250,247,0))`,
              }}
            />
          )}
          {edges.right && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 bottom-0"
              style={{
                right: 0,
                width: 24,
                zIndex: 3,
                background: `linear-gradient(to left, ${CARD_BG}, rgba(252,250,247,0))`,
              }}
            />
          )}
        </div>

        {/* Open windows — the takeaway, in words; leads on mobile */}
        {openWindows.length > 0 && (
          <div className="order-1 md:order-2 md:mt-2.5 md:pt-2 md:border-t md:border-[rgba(26,26,46,0.06)]">
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "rgba(26,26,46,0.4)",
                }}
              >
                Open windows
              </div>
              <div className="mt-1">
                {openWindows.map((w) => (
                  <div
                    key={`list-${w.key}`}
                    className="flex items-center justify-between gap-3 py-[5px]"
                  >
                    <div style={{ fontSize: 12, color: "rgba(26,26,46,0.75)", minWidth: 0 }}>
                      <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{w.name}</span>
                      {" · "}
                      {formatRange(w.coreStart, w.coreEnd)}
                      {" · "}
                      {w.kind === "break"
                        ? `${w.days} days with weekends`
                        : w.kind === "weekend"
                          ? `${w.days}-day weekend`
                          : `${w.days} days`}
                      {" · no journey planned"}
                    </div>
                    <Link
                      href="/trips/new"
                      className="whitespace-nowrap"
                      style={{ fontSize: 11.5, fontWeight: 600, color: "#C4622D" }}
                    >
                      Plan it →
                    </Link>
                  </div>
                ))}
              </div>
          </div>
        )}
      </div>
    </section>
  );
}
