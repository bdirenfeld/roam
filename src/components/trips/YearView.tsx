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

// Weekend-trip wishlist (public.wishlist_destinations, RLS own-rows; seeded
// from Brennan's "Weekend Trip Ideas" spreadsheet). Same not-in-generated-
// types situation as travel_windows — calls cast the client.
interface WishlistDest {
  id: string;
  name: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  drive_hours: number | null;
  budget: string | null;
  best_time: string | null;
  why: string | null;
  // Precomputed monthly normals (12 elements, month-0 indexed). Null rows
  // lazy-fetch and self-heal by writing the result back.
  climate: MonthClimate[] | null;
}

const WISHLIST_COLS = "id, name, location, lat, lng, drive_hours, budget, best_time, why, climate";

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
  // Header meta counts — YearView owns the "N upcoming · N past" line so the
  // "Your year" trigger can sit inside it instead of floating as a stray row
  counts: { upcoming: number; past: number; archived: number };
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

// Chip wording + sort order for the "go where?" suggestion sheet
const TONE_WORD: Record<HeatTone, string> = {
  great: "prime",
  good:  "good",
  fair:  "fair",
  rough: "rough",
};
const TONE_RANK: Record<HeatTone, number> = { great: 0, good: 1, fair: 2, rough: 3 };

// Terse chip label: name the dominant problem when there is one, otherwise
// the tone word — and nothing at all for a great month, where the green
// already carries the message. e.g. "2° · cold", "24° · rainy", "22°".
function chipLabel(c: MonthClimate, tone: HeatTone): string {
  const reason =
    c.high < 8 ? "cold" : c.high > 33 ? "hot" : c.rainShare >= 0.4 ? "rainy" : null;
  if (reason) return `${c.high}° · ${reason}`;
  return tone === "great" ? `${c.high}°` : `${c.high}° · ${TONE_WORD[tone]}`;
}

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

// Month-grid cells for the add-window date picker (same shape as the
// trips/new calendar: leading nulls pad to the first weekday)
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function buildCalendarCells(year: number, month: number): Array<string | null> {
  const firstDow = new Date(year, month, 1).getDay();
  const count = daysInMonth(year, month);
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= count; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return cells;
}

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

export default function YearView({ trips, counts }: Props) {
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
  // "Go where?" sheet: which open window is being planned, the wishlist,
  // and per-destination climate (loaded lazily when the sheet first opens)
  const [sheetWindow, setSheetWindow] = useState<OpenWindow | null>(null);
  const [wishlist, setWishlist] = useState<WishlistDest[]>([]);
  // Undo window for the two instant deletes (wishlist place, ideal window)
  const [undo, setUndo] = useState<{ label: string; restore: () => Promise<void> } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showUndo = (label: string, restore: () => Promise<void>) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ label, restore });
    undoTimerRef.current = setTimeout(() => setUndo(null), 6000);
  };
  const [destClimate, setDestClimate] = useState<Record<string, MonthClimate[] | "error">>({});
  // "+ Add a place" mini-form on the sheet
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<GeoResult[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [addingPlace, setAddingPlace] = useState(false);
  // The destination picker renders position:fixed (anchored at open time) so
  // the strip's overflow container can't clip it; this holds the anchor.
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  // Add-window sheet's calendar: viewed month + tap-start/tap-end phase
  const [awYear, setAwYear] = useState(() => new Date().getFullYear());
  const [awMonth, setAwMonth] = useState(() => new Date().getMonth());
  const [awPhase, setAwPhase] = useState<"start" | "end">("start");
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

  // ── Wishlist destinations ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    // Cast: wishlist_destinations isn't in the generated Database types yet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("wishlist_destinations")
      .select(WISHLIST_COLS)
      .order("drive_hours", { ascending: true })
      .then(({ data }: { data: WishlistDest[] | null }) => {
        if (!cancelled && data) setWishlist(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Climate for a row: the precomputed column first (zero network), else
  // whatever the lazy fetch has produced this session.
  const climateOf = (d: WishlistDest): MonthClimate[] | "error" | null =>
    (Array.isArray(d.climate) && d.climate.length === 12 ? d.climate : null) ??
    destClimate[d.id] ??
    null;

  // Rows without a stored climate fetch it when a sheet first opens, then
  // write it back so the row is free forever after (self-healing backfill —
  // in practice only places added through "+ Add a place" land here).
  useEffect(() => {
    if (!sheetWindow) return;
    let cancelled = false;
    const supabase = createClient();
    for (const d of wishlist) {
      if (d.lat == null || d.lng == null) continue;
      if (Array.isArray(d.climate) && d.climate.length === 12) continue;
      if (destClimate[d.id]) continue;
      fetchClimate(d.lat, d.lng)
        .then((c) => {
          if (cancelled) return;
          setDestClimate((prev) => ({ ...prev, [d.id]: c }));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("wishlist_destinations")
            .update({ climate: c })
            .eq("id", d.id)
            .then(() => {});
        })
        .catch(() => {
          if (!cancelled) setDestClimate((prev) => ({ ...prev, [d.id]: "error" }));
        });
    }
    return () => {
      cancelled = true;
    };
    // destClimate is read as a skip-list, not a trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetWindow, wishlist]);

  // Debounced geocoding for the add-a-place field
  useEffect(() => {
    const q = placeQuery.trim();
    if (q.length < 2) {
      setPlaceResults([]);
      setPlaceSearching(false);
      return;
    }
    setPlaceSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const rs = await geocode(q).catch(() => [] as GeoResult[]);
      if (cancelled) return;
      setPlaceResults(rs);
      setPlaceSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [placeQuery]);

  // Add a geocoded place to the wishlist. Climate is computed up front so
  // the new row behaves like a seeded one; a failed fetch still inserts
  // (climate null) and the lazy backfill picks it up next time.
  const handleAddPlace = async (r: GeoResult) => {
    if (addingPlace) return;
    setAddingPlace(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAddingPlace(false);
      return;
    }
    const climateArr = await fetchClimate(r.latitude, r.longitude).catch(() => null);
    const location = [r.admin1 || r.country].filter(Boolean).join("");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("wishlist_destinations")
      .insert({
        user_id: user.id,
        name: r.name,
        location: location ? `${r.name}, ${location}` : r.name,
        lat: r.latitude,
        lng: r.longitude,
        drive_hours: null,
        budget: null,
        best_time: null,
        why: null,
        source: "app",
        climate: climateArr,
      })
      .select(WISHLIST_COLS)
      .single();
    setAddingPlace(false);
    if (error || !data) {
      console.error("Failed to add wishlist place:", error);
      return;
    }
    setWishlist((prev) => [...prev, data as WishlistDest]);
    setAddPlaceOpen(false);
    setPlaceQuery("");
    setPlaceResults([]);
  };

  // Instant delete, but never silent: the × sits close to the row's own tap
  // target, so a mis-tap must be recoverable. Rows are re-inserted with their
  // original id, which keeps the climate column and any future references.
  const handleRemovePlace = async (id: string) => {
    const prev = wishlist;
    const row = wishlist.find((d) => d.id === id) ?? null;
    setWishlist((w) => w.filter((d) => d.id !== id));
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("wishlist_destinations")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("Failed to remove wishlist place:", error);
      setWishlist(prev); // put it back rather than lie about the delete
      return;
    }
    if (row) {
      showUndo(`Removed ${row.name}`, async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: reErr } = await (supabase as any).from("wishlist_destinations").insert({
          id: row.id, user_id: user.id, name: row.name, location: row.location,
          lat: row.lat, lng: row.lng, drive_hours: row.drive_hours, budget: row.budget,
          best_time: row.best_time, why: row.why, climate: row.climate,
        });
        if (!reErr) setWishlist((w) => (w.some((d) => d.id === row.id) ? w : [...w, row]));
      });
    }
  };

  // The destination chip appears in both the desktop lane and the mobile
  // heat block; one definition, one shared popover (rendered once, fixed).
  const destChip = (maxWidth: number) => (
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
      style={{ minHeight: 40, margin: "-7px 0", maxWidth }}
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
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{dest?.label ?? "…"}</span>
        ▾
      </span>
    </button>
  );

  // Escape closes whichever overlay is up (backdrop click also closes)
  useEffect(() => {
    if (!addOpen && !sheetWindow && !pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAddOpen(false);
        setSheetWindow(null);
        setPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, sheetWindow, pickerOpen]);

  const openAddSheet = () => {
    setFormLabel("");
    setFormStart("");
    setFormEnd("");
    setAwPhase("start");
    const now = new Date();
    setAwYear(now.getFullYear());
    setAwMonth(now.getMonth());
    setAddOpen(true);
  };

  // Same tap-start-then-tap-end interaction as the trips/new date picker
  const handleAwDay = (dateStr: string) => {
    if (awPhase === "start" || !formStart) {
      setFormStart(dateStr);
      setFormEnd("");
      setAwPhase("end");
    } else if (dateStr < formStart) {
      setFormStart(dateStr);
      setFormEnd("");
    } else {
      setFormEnd(dateStr);
      setAwPhase("start");
    }
  };

  const awPrevMonth = () => {
    if (awMonth === 0) {
      setAwMonth(11);
      setAwYear((y) => y - 1);
    } else setAwMonth((m) => m - 1);
  };
  const awNextMonth = () => {
    if (awMonth === 11) {
      setAwMonth(0);
      setAwYear((y) => y + 1);
    } else setAwMonth((m) => m + 1);
  };

  const handleDeleteWindow = async (id: string) => {
    const row = travelWindows.find((w) => w.id === id) ?? null;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from("travel_windows").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete travel window:", error);
      return;
    }
    setTravelWindows((prev) => prev.filter((w) => w.id !== id));
    if (row) {
      showUndo(`Removed ${row.label || "window"}`, async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: reErr } = await (supabase as any).from("travel_windows").insert({
          id: row.id, user_id: user.id, label: row.label,
          start_date: row.start_date, end_date: row.end_date,
        });
        if (!reErr) {
          setTravelWindows((prev) =>
            prev.some((w) => w.id === row.id)
              ? prev
              : [...prev, row].sort((a, b) => a.start_date.localeCompare(b.start_date))
          );
        }
      });
    }
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

  // Birthday occurrences inside the window (annual → exactly one each),
  // grouped so name labels can never overlap: neighbouring markers whose
  // labels would collide share one label block with the names stacked
  // vertically (one per line). Diamonds keep their true date positions;
  // only near-coincident diamonds (< 0.8% apart, e.g. Dylan/Gorav a day
  // apart) collapse into one.
  const birthdayGroups = useMemo(() => {
    const occurrences = FAMILY_DATES.map((f) => {
      const inStartYear = new Date(winStart.getFullYear(), f.month - 1, f.day);
      const date =
        inStartYear >= winStart && inStartYear <= winEnd
          ? inStartYear
          : new Date(winStart.getFullYear() + 1, f.month - 1, f.day);
      return { name: f.name, date };
    })
      .filter((b) => b.date >= winStart && b.date <= winEnd)
      .map((b) => ({ ...b, pos: posMid(b.date) }))
      .sort((a, b) => a.pos - b.pos);

    // Label width as % of the narrowest track the strip can render at
    // (minWidth 960 − 110px label column ≈ 840px): DM Sans 8.5px ≈ 4.8px/char.
    // Desktop tracks are wider, so this stays conservative there.
    const widthPct = (name: string) => (name.length * 4.8 + 2) / 8.4;
    const PAD = 0.6; // breathing room between adjacent label blocks, in %

    const centerOf = (g: { members: { pos: number }[] }) =>
      g.members.reduce((s, m) => s + m.pos, 0) / g.members.length;
    const widthOf = (g: { members: { name: string }[] }) =>
      Math.max(...g.members.map((m) => widthPct(m.name)));

    // Merge neighbours until no two label blocks collide (centres converge,
    // so this terminates; n is tiny)
    const groups = occurrences.map((o) => ({ members: [o] }));
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < groups.length - 1; i++) {
        const a = groups[i];
        const b = groups[i + 1];
        if (centerOf(b) - centerOf(a) < (widthOf(a) + widthOf(b)) / 2 + PAD) {
          a.members.push(...b.members);
          groups.splice(i + 1, 1);
          merged = true;
          break;
        }
      }
    }
    return groups.map((g) => ({
      key: g.members.map((m) => m.name).join("-"),
      center: centerOf(g),
      members: g.members,
    }));
    // posMid is derived purely from winStart/winEnd
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winStart, winEnd]);

  // Lane grows with the deepest name stack so nothing clips
  const bdayMaxLines = Math.max(1, ...birthdayGroups.map((g) => g.members.length));
  const bdayLaneHeight = 15 + bdayMaxLines * 11;

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
      // Name the run after its stat holiday when it has one. The only run
      // holding two stats in an Ontario school year is Good Friday + Easter
      // Monday — call that one "Easter" rather than picking a side.
      const statsInRun = singles.filter((e) => {
        const ed = parseDate(e.start);
        return e.kind === "stat" && ed >= runStart && ed <= runEnd;
      });
      found.push({
        key,
        name:
          statsInRun.length >= 2 ? "Easter" : statsInRun[0] ? statsInRun[0].label : "PA day",
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

    // Soonest first, uncapped — every open window in the rolling 12 months
    // renders (a cap here once hid March break behind the fall windows)
    found.sort((a, b) => a.start.getTime() - b.start.getTime());
    return found;
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

  const metaText = `${counts.upcoming} upcoming · ${counts.past} past${
    counts.archived > 0 ? ` · ${counts.archived} archived` : ""
  }`;

  return (
    <>
      {/* Header meta line — owned by YearView so the "Your year" trigger is
          part of the header, not a stray row. Same style the page used. */}
      <div
        className="px-4 md:px-0 -mt-1 md:mt-1 font-sans flex items-center flex-wrap"
        style={{
          fontSize: 10,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "rgba(26,26,46,0.55)",
        }}
      >
        <span>{metaText}</span>
        <button
          onClick={() => setOpen(!isOpen)}
          aria-expanded={isOpen}
          className="uppercase"
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.14em",
            color: "rgba(26,26,46,0.8)",
            // Comfortable tap target without disturbing the line's rhythm
            padding: "12px 8px",
            margin: "-12px -8px -12px 0",
          }}
        >
          &nbsp;· Your year {isOpen ? "▾" : "▸"}
        </button>
      </div>

      {isOpen && (
    <section
      className="mx-4 mt-3 md:mx-0 md:mt-4 rounded-[14px]"
      style={{ border: "1px solid rgba(26,26,46,0.08)", background: CARD_BG }}
    >
      {/* Body — on mobile the Open-windows list leads (vertical, actionable)
          and the strip follows; desktop keeps the strip first */}
      <div className="flex flex-col px-4 pt-2 pb-3 md:px-5 md:pb-4">
        {/* The 5-lane strip is desktop-only. On a phone it was five lanes of
            sideways swiping to reach what the Open-windows list already
            says, so mobile gets the list + heat row + ideal pills instead. */}
        <div className="hidden md:block order-2 md:order-1 relative">
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
                      <button
                        key={w.key}
                        onClick={() => setSheetWindow(w)}
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
                          textAlign: "left",
                        }}
                      >
                        Open
                      </button>
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
                    onClick={openAddSheet}
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
                <div style={{ gridColumn: "2 / 14", position: "relative", height: bdayLaneHeight }}>
                  {birthdayGroups.map((g) => {
                    const title = g.members
                      .map((m) => `${m.name} · ${fmtMD(m.date)}`)
                      .join(", ");
                    // Diamonds keep true positions; drop ones that would
                    // paint on top of the previous diamond
                    const diamondPositions: number[] = [];
                    for (const m of g.members) {
                      const prev = diamondPositions[diamondPositions.length - 1];
                      if (prev === undefined || m.pos - prev >= 0.8) diamondPositions.push(m.pos);
                    }
                    return (
                      <div key={g.key}>
                        {diamondPositions.map((p) => (
                          <i
                            key={p}
                            title={title}
                            style={{
                              position: "absolute",
                              left: `${p}%`,
                              top: 2,
                              width: 8,
                              height: 8,
                              background: "#D18A2E",
                              transform: "translateX(-50%) rotate(45deg)",
                              borderRadius: 2,
                            }}
                          />
                        ))}
                        <div
                          title={title}
                          style={{
                            position: "absolute",
                            left: `${g.center}%`,
                            top: 14,
                            transform: "translateX(-50%)",
                            textAlign: "center",
                            lineHeight: "11px",
                          }}
                        >
                          {g.members.map((m) => (
                            <div
                              key={m.name}
                              style={{ fontSize: 8.5, color: "rgba(26,26,46,0.55)", whiteSpace: "nowrap" }}
                            >
                              {m.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
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
                  {destChip(106)}
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

        {/* ── Mobile substitute for the strip ────────────────────────────
            Ideal windows as a plain wrapped pill row, and the heat row as a
            6×2 grid (12 narrow cells don't survive a 390px screen). */}
        <div
          className={`md:hidden order-3 ${openWindows.length > 0 ? "mt-2.5 pt-2.5" : ""}`}
          style={openWindows.length > 0 ? { borderTop: LANE_BORDER } : undefined}
        >
          <div className="flex items-center flex-wrap gap-1.5">
            <span
              className="uppercase"
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "rgba(26,26,46,0.4)",
                marginRight: 2,
              }}
            >
              Ideal times
            </span>
            {travelWindows
              .filter((w) => parseDate(w.end_date) >= winStart && parseDate(w.start_date) <= winEnd)
              .map((w) => (
                <span
                  key={w.id}
                  className="inline-flex items-center"
                  style={{
                    borderRadius: 999,
                    border: "1.5px solid rgba(53,118,110,0.55)",
                    background: "rgba(53,118,110,0.08)",
                    color: "#2F6E68",
                    fontSize: 10.5,
                    fontWeight: 600,
                    padding: "3px 4px 3px 9px",
                    maxWidth: "100%",
                  }}
                >
                  <span className="truncate">
                    {w.label || "Ideal window"} ·{" "}
                    {formatRange(parseDate(w.start_date), parseDate(w.end_date))}
                  </span>
                  <button
                    onClick={() => handleDeleteWindow(w.id)}
                    aria-label={`Remove ${w.label || "ideal window"}`}
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 22, height: 22, fontSize: 12, color: "rgba(47,110,104,0.8)" }}
                  >
                    ×
                  </button>
                </span>
              ))}
            <button
              onClick={openAddSheet}
              className="inline-flex items-center"
              style={{
                borderRadius: 999,
                border: "1px dashed rgba(26,26,46,0.25)",
                color: "rgba(26,26,46,0.5)",
                fontSize: 10.5,
                fontWeight: 600,
                padding: "5px 10px",
              }}
            >
              + Add window
            </button>
          </div>

          <div className="flex items-center gap-2 mt-3">
            <span
              className="uppercase flex-shrink-0"
              style={{
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "rgba(26,26,46,0.4)",
              }}
            >
              Weather
            </span>
            {destChip(150)}
          </div>
          <div className="grid grid-cols-6 gap-1 mt-1.5">
            {months.map((m) => {
              const c = climate?.[m.getMonth()];
              const tone = c ? scoreMonth(c) : null;
              return (
                <div
                  key={`mheat-${m.getTime()}`}
                  className="flex flex-col items-center justify-center"
                  style={{
                    height: 34,
                    borderRadius: 6,
                    background: tone ? HEAT_STYLE[tone].bg : "rgba(26,26,46,0.05)",
                    color: tone ? HEAT_STYLE[tone].fg : "rgba(26,26,46,0.3)",
                  }}
                >
                  <span style={{ fontSize: 8.5, opacity: 0.75, textTransform: "uppercase" }}>
                    {m.toLocaleDateString("en-US", { month: "short" })}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.1 }}>
                    {c ? `${c.high}°` : "–"}
                  </span>
                </div>
              );
            })}
          </div>
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
                {openWindows.map((w, i) => {
                  // Tiny month prefix on the first row of each month so the
                  // eye can jump straight to "MAR" in a ~11-row list
                  const prev = openWindows[i - 1];
                  const newMonth =
                    !prev ||
                    prev.coreStart.getMonth() !== w.coreStart.getMonth() ||
                    prev.coreStart.getFullYear() !== w.coreStart.getFullYear();
                  return (
                    <button
                      key={`list-${w.key}`}
                      onClick={() => setSheetWindow(w)}
                      className="flex w-full items-center justify-between gap-2 py-[4px] text-left"
                    >
                      <span
                        className="uppercase flex-shrink-0"
                        style={{
                          width: 28,
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: "0.08em",
                          color: "rgba(26,26,46,0.35)",
                        }}
                      >
                        {newMonth ? w.coreStart.toLocaleDateString("en-US", { month: "short" }) : ""}
                      </span>
                      {/* One line, always: the text block truncates rather
                          than wrapping, however long a window's label is */}
                      <div
                        className="flex-1 truncate"
                        style={{ fontSize: 12, color: "rgba(26,26,46,0.75)", minWidth: 0 }}
                      >
                        <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{w.name}</span>
                        {" · "}
                        {formatRange(w.coreStart, w.coreEnd)}
                        {" · "}
                        {w.days}d
                      </div>
                      <span
                        className="whitespace-nowrap flex-shrink-0"
                        style={{ fontSize: 11.5, fontWeight: 600, color: "#C4622D" }}
                      >
                        Plan it →
                      </span>
                    </button>
                  );
                })}
              </div>
          </div>
        )}
      </div>

      {/* Destination picker popover — one instance, shared by the desktop
          lane chip and the mobile heat chip (position:fixed, so it can live
          outside the strip's overflow container) */}
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

      {/* Add an ideal window — the app's sheet chrome + the same calendar
          interaction as the trips/new date picker (tap start, tap end) */}
      {addOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60]" onClick={() => setAddOpen(false)} />
          <div
            role="dialog"
            aria-label="Add an ideal window"
            className="fixed z-[60] bg-white flex flex-col bottom-0 left-0 right-0 rounded-t-2xl max-w-mobile mx-auto md:bottom-auto md:top-1/2 md:left-1/2 md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:w-[400px] md:max-w-[calc(100vw-48px)] md:mx-0"
            style={{ maxHeight: "88vh" }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0 md:hidden">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>
            <p className="text-center font-display italic text-base text-gray-900 pt-1 pb-2 flex-shrink-0 md:pt-5">
              Add an ideal window
            </p>

            <div className="flex-1 overflow-y-auto px-5 pb-2">
              <input
                value={formLabel}
                onChange={(e) => setFormLabel(e.target.value)}
                placeholder="Ski week, cottage, visit family…"
                className="w-full text-[14px] border-b border-black/10 py-2.5 outline-none bg-transparent placeholder:text-gray-300 text-[#1A1A2E]"
              />

              {/* Month navigation */}
              <div className="flex items-center justify-between mt-4 mb-3">
                <button
                  onClick={awPrevMonth}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="text-[14px] font-semibold text-gray-800">
                  {MONTH_NAMES[awMonth]} {awYear}
                </span>
                <button
                  onClick={awNextMonth}
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
                    className="h-6 flex items-center justify-center text-[9px] text-gray-400 uppercase"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {buildCalendarCells(awYear, awMonth).map((dateStr, i) => {
                  if (!dateStr) return <div key={`e-${i}`} className="h-9" />;
                  const dayNum = Number(dateStr.slice(8));
                  const isSelected = dateStr === formStart || dateStr === formEnd;
                  const inRange = !!(
                    formStart &&
                    formEnd &&
                    dateStr > formStart &&
                    dateStr < formEnd
                  );
                  return (
                    <div
                      key={dateStr}
                      className={`relative h-9 flex items-center justify-center ${inRange ? "bg-[#1A1A2E]/10" : ""}`}
                    >
                      <button
                        onClick={() => handleAwDay(dateStr)}
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

            {/* Footer — live summary + Save */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-t border-gray-50">
              <p className="font-display italic text-[12px] text-gray-400 flex-1 pr-3">
                {formStart && formEnd
                  ? `${formatRange(parseDate(formStart), parseDate(formEnd))} · ${daysBetweenInclusive(parseDate(formStart), parseDate(formEnd))} days`
                  : formStart
                    ? `${fmtMD(parseDate(formStart))} → …`
                    : "Tap a start date"}
              </p>
              <button
                onClick={handleAddWindow}
                disabled={saving || !formStart || !formEnd}
                className="bg-[#1A1A2E] text-white text-xs font-semibold rounded-full px-5 py-2 disabled:opacity-40 active:scale-95 transition-all"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* "Go where?" — tapping an open window proposes wishlist destinations.
          Bottom sheet on mobile, centered card on desktop. */}
      {sheetWindow &&
        (() => {
          const windowMonth = sheetWindow.start.getMonth();
          const directHref = `/trips/new?start=${isoOf(sheetWindow.start)}&end=${isoOf(sheetWindow.end)}`;
          const rankOf = (d: WishlistDest) => {
            const c = climateOf(d);
            return Array.isArray(c) ? TONE_RANK[scoreMonth(c[windowMonth])] : 4;
          };
          const rows = [...wishlist].sort(
            (a, b) => rankOf(a) - rankOf(b) || (a.drive_hours ?? 99) - (b.drive_hours ?? 99)
          );
          return (
            <>
              <div
                className="fixed inset-0 bg-black/40 z-[60]"
                onClick={() => setSheetWindow(null)}
              />
              <div
                role="dialog"
                aria-label={`Plan ${sheetWindow.name}`}
                className="fixed z-[60] bg-white flex flex-col bottom-0 left-0 right-0 rounded-t-2xl max-w-mobile mx-auto md:bottom-auto md:top-1/2 md:left-1/2 md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:w-[440px] md:max-w-[calc(100vw-48px)] md:mx-0"
                style={{ maxHeight: "80vh" }}
              >
                {/* Drag-handle look, matching the app's other sheets */}
                <div className="flex justify-center pt-3 pb-1 flex-shrink-0 md:hidden">
                  <div className="w-9 h-1 bg-gray-200 rounded-full" />
                </div>

                <div className="px-5 pt-2 pb-2.5 flex-shrink-0 md:pt-5">
                  <h2 className="font-display italic text-[20px] text-gray-900">
                    {sheetWindow.name}
                  </h2>
                  <p className="mt-0.5" style={{ fontSize: 12, color: "rgba(26,26,46,0.55)" }}>
                    {formatRange(sheetWindow.start, sheetWindow.end)} · {sheetWindow.days} days
                  </p>
                  <Link
                    href={directHref}
                    className="inline-block mt-1"
                    style={{ fontSize: 11.5, color: "rgba(26,26,46,0.45)" }}
                  >
                    or just pick dates →
                  </Link>
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-8 md:pb-3">
                  {rows.length === 0 ? (
                    <div className="px-3 py-6 text-center">
                      <p style={{ fontSize: 12.5, color: "rgba(26,26,46,0.5)" }}>
                        Nothing on your wishlist yet
                      </p>
                      <Link
                        href={directHref}
                        className="inline-block mt-2"
                        style={{ fontSize: 12, fontWeight: 600, color: "#C4622D" }}
                      >
                        Plan with these dates →
                      </Link>
                    </div>
                  ) : (
                    rows.map((d) => {
                      const hasCoords = d.lat != null && d.lng != null;
                      const href = hasCoords
                        ? `${directHref}&destName=${encodeURIComponent(d.name)}&destLoc=${encodeURIComponent(d.location ?? "")}&destLat=${d.lat}&destLng=${d.lng}`
                        : directHref;
                      const c = climateOf(d);
                      const monthClimate = Array.isArray(c) ? c[windowMonth] : null;
                      const tone = monthClimate ? scoreMonth(monthClimate) : null;
                      const secondLine = [
                        d.location,
                        d.drive_hours != null ? `${d.drive_hours} h drive` : null,
                        d.budget,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <div key={d.id} className="group/wl relative">
                          <Link
                            href={href}
                            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1A1A2E" }}>
                                {d.name}
                              </div>
                              {secondLine && (
                                <div
                                  className="truncate"
                                  style={{ fontSize: 11, color: "rgba(26,26,46,0.5)", marginTop: 1 }}
                                >
                                  {secondLine}
                                </div>
                              )}
                            </div>
                            {/* Chip sits clear of the remove button */}
                            <span className="flex-shrink-0 pr-6">
                              {monthClimate && tone ? (
                                <span
                                  className="whitespace-nowrap"
                                  style={{
                                    background: HEAT_STYLE[tone].bg,
                                    color: HEAT_STYLE[tone].fg,
                                    borderRadius: 999,
                                    padding: "3px 8px",
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                  }}
                                >
                                  {chipLabel(monthClimate, tone)}
                                </span>
                              ) : c === "error" || !hasCoords ? null : (
                                <span
                                  className="whitespace-nowrap"
                                  style={{
                                    background: "rgba(26,26,46,0.05)",
                                    color: "rgba(26,26,46,0.3)",
                                    borderRadius: 999,
                                    padding: "3px 10px",
                                    fontSize: 10.5,
                                  }}
                                >
                                  —
                                </span>
                              )}
                            </span>
                          </Link>
                          {/* Remove — quiet on desktop until hover, always
                              faintly there on touch. Deletes immediately. */}
                          <button
                            onClick={() => handleRemovePlace(d.id)}
                            aria-label={`Remove ${d.name} from wishlist`}
                            className="absolute top-1/2 -translate-y-1/2 right-1 flex items-center justify-center rounded-full opacity-0 [@media(hover:hover)]:group-hover/wl:opacity-100 [@media(hover:none)]:opacity-40 transition-opacity"
                            style={{ width: 24, height: 24, fontSize: 13, color: "rgba(26,26,46,0.45)" }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })
                  )}

                  {/* Add a place — geocoded, stored with its climate so it
                      behaves like a seeded row from the next open onward */}
                  <div className="px-3 pt-1">
                    {!addPlaceOpen ? (
                      <button
                        onClick={() => setAddPlaceOpen(true)}
                        style={{ fontSize: 12, fontWeight: 600, color: "rgba(26,26,46,0.45)" }}
                      >
                        + Add a place
                      </button>
                    ) : (
                      <div>
                        <input
                          autoFocus
                          value={placeQuery}
                          onChange={(e) => setPlaceQuery(e.target.value)}
                          placeholder="Search a city…"
                          className="w-full rounded-lg px-2.5 py-2"
                          style={{
                            fontSize: 12.5,
                            border: "1px solid rgba(26,26,46,0.12)",
                            background: "#FAF7F2",
                            outline: "none",
                          }}
                        />
                        {addingPlace && (
                          <div style={{ fontSize: 11, color: "rgba(26,26,46,0.4)", padding: "6px 2px" }}>
                            Adding…
                          </div>
                        )}
                        {!addingPlace && placeSearching && (
                          <div style={{ fontSize: 11, color: "rgba(26,26,46,0.4)", padding: "6px 2px" }}>
                            Searching…
                          </div>
                        )}
                        {!addingPlace &&
                          !placeSearching &&
                          placeResults.map((r, i) => (
                            <button
                              key={`${r.latitude},${r.longitude},${i}`}
                              onClick={() => handleAddPlace(r)}
                              className="w-full text-left rounded-lg px-2.5 py-2 hover:bg-gray-50 transition-colors"
                              style={{ fontSize: 12.5, color: "#1A1A2E" }}
                            >
                              {r.name}
                              <span style={{ color: "rgba(26,26,46,0.4)" }}>
                                {r.admin1 ? `, ${r.admin1}` : ""}
                                {r.country ? `, ${r.country}` : ""}
                              </span>
                            </button>
                          ))}
                        <button
                          onClick={() => {
                            setAddPlaceOpen(false);
                            setPlaceQuery("");
                            setPlaceResults([]);
                          }}
                          className="mt-1"
                          style={{ fontSize: 11.5, color: "rgba(26,26,46,0.4)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          );
        })()}
    </section>
      )}

      {/* Undo toast — above the sheets (z-[60]) so it's reachable from them */}
      {undo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-gray-900 text-white text-[13px] font-medium pl-4 pr-1.5 py-1.5 rounded-full shadow-lg flex items-center gap-3 animate-in fade-in">
          <span className="truncate max-w-[45vw]">{undo.label}</span>
          <button
            onClick={() => {
              const r = undo.restore;
              if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
              setUndo(null);
              r();
            }}
            className="px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 font-semibold transition-colors"
          >
            Undo
          </button>
        </div>
      )}
    </>
  );
}
