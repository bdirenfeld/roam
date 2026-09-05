"use client";

// ── "Your year" — 12-month planning strip on the Journeys page ────────────
// Rolling window (current month + next 11) with four lanes: journeys,
// family birthdays, the TDSB school calendar, and a climate heat row for a
// picked destination. The point of the section is the "open windows" —
// school breaks and 3+ day weekends with no journey booked yet, drawn as
// dashed pills and listed below the strip; tapping one opens "Plan a journey"
// in place with the dates prefilled (ctrl/cmd-click still opens
// /trips/new?start=…&end=… as a page — see overlays/AppOverlays.tsx).
//
// Static inputs live in src/lib/yearView/ (familyDates, schoolCalendar).
// Climate comes from Open-Meteo's archive API, fetched lazily client-side
// and cached at module level — the page render never waits on it.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useSheetDrag as useSharedSheetDrag } from "@/hooks/useSheetDrag";
import Link from "next/link";
import { NewJourneyLink } from "@/components/overlays/AppOverlays";
import { createClient } from "@/lib/supabase/client";
import { FAMILY_DATES } from "@/lib/yearView/familyDates";
import { SCHOOL_CALENDAR } from "@/lib/yearView/schoolCalendar";
import {
  computeOpenWindows,
  parseDate,
  isoOf,
  addDays,
  daysBetweenInclusive,
  maxDate,
} from "@/lib/yearView/openWindows";
import type { OpenWindow } from "@/lib/yearView/openWindows";
import { stormSeasonFor } from "@/lib/yearView/stormSeasons";
import { bugSeasonFor } from "@/lib/yearView/bugSeasons";
import { hciTone } from "@/lib/yearView/hci";
import { fetchClimate, compactAddress, seedClimateCache } from "@/lib/wishlist/climate";
import type { MonthClimate } from "@/lib/wishlist/climate";
import { fetchPredictions, fetchPlaceDetails, predMain, predSecondary } from "@/lib/places/predictions";
import type { Prediction, ResolvedPlace } from "@/lib/places/predictions";

// Brennan's own "ideal times to travel", stored per-user in Supabase
// (public.travel_windows, RLS own-row). Row shape also lives in
// types/database.ts; this is the view-shaped subset the component selects.
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
}

const OPEN_KEY = "roam_year_view_open";

// ── Date helpers (date-only, local — matches tripRecency's approach) ──────
// parseDate / isoOf / addDays / daysBetweenInclusive / maxDate now live in
// lib/yearView/openWindows alongside the computation that needs them.
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const minDate = (a: Date, b: Date) => (a < b ? a : b);
const fmtMD = (dt: Date) =>
  dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const formatRange = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.toLocaleDateString("en-US", { month: "short" })} ${a.getDate()}–${b.getDate()}`
    : `${fmtMD(a)} – ${fmtMD(b)}`;


type HeatTone = "great" | "good" | "fair" | "rough";

function scoreMonth(c: MonthClimate): HeatTone {
  // Deep-cold floor: mean daytime feels-like at or below −6°C (the HCI
  // thermal table's bottom band) is "rough" for family travel whatever the
  // sunshine math says. HCI:Urban is documented to over-rate winter months
  // — snow arrives as low mm water-equivalent, so its precip facet scores
  // a −12° January almost perfectly (Jay Peak Jan computes HCI 52 without
  // this floor).
  if (c.feelsMax != null && c.feelsMax <= -6) return "rough";

  let tone: HeatTone;
  if (c.hci != null) {
    // Published index when the profile carries it (all new fetches do)
    tone = hciTone(c.hci);
  } else {
    // Legacy hand bands — only for rows stored before the HCI fields
    if (c.high >= 18 && c.high <= 28 && c.rainShare < 0.3) tone = "great";
    else if (c.high >= 13 && c.high <= 31 && c.rainShare < 0.4) tone = "good";
    else if (c.high >= 8 && c.high <= 33) tone = "fair";
    else tone = "rough";
  }
  // A monsoon month can't be "great" however pleasant the temperature —
  // ≥180mm mean rainfall caps the tone at fair, layered over either path:
  // HCI's precip facet works on mm/day means and under-penalizes
  // concentrated monsoons. (Storm season deliberately does NOT downgrade:
  // a hurricane is a risk, not a certainty; the glyph and legend carry it.)
  if ((c.precipMm ?? 0) >= 180 && (tone === "great" || tone === "good")) tone = "fair";
  // Drizzle cap, the same disease at the other end: mm/day means also miss
  // places where light rain falls every other day (west of Ireland rates
  // 8/10 on precip in July). Rain on half the days can't be "great".
  if (c.rainShare >= 0.5 && tone === "great") tone = "good";
  return tone;
}

// Wet-season marker: heavy total rainfall, or moderately heavy rainfall
// falling on most days. Unknown precipMm (old stored rows) → no marker.
const isWetMonth = (c: MonthClimate) =>
  c.precipMm != null && (c.precipMm >= 180 || (c.precipMm >= 120 && c.rainShare >= 0.55));

// Tiny marker glyphs — SVG, legible at cell-corner sizes on both breakpoints
const DropGlyph = ({ size = 7 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="#3A7CA5"
    aria-hidden
    style={{ flexShrink: 0, display: "block" }}
  >
    <path d="M12 2C12 2 5 10.5 5 15a7 7 0 0 0 14 0C19 10.5 12 2 12 2z" />
  </svg>
);

const StormGlyph = ({ size = 8 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="rgba(26,26,46,0.6)"
    strokeWidth={3}
    strokeLinecap="round"
    aria-hidden
    style={{ flexShrink: 0, display: "block" }}
  >
    <path d="M20 12a8 8 0 1 0-8 8" />
    <path d="M8 12a4 4 0 1 1 4 4" />
  </svg>
);

const BugGlyph = ({ size = 7 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="#4A5D23"
    aria-hidden
    style={{ flexShrink: 0, display: "block" }}
  >
    <ellipse cx="12" cy="14" rx="5" ry="7" />
    <circle cx="12" cy="5.5" r="3" />
    <path
      stroke="#4A5D23"
      strokeWidth="1.8"
      fill="none"
      strokeLinecap="round"
      d="M7 9 3 6 M7 14H2.5 M7 19l-4 3 M17 9l4-3 M17 14h4.5 M17 19l4 3"
    />
  </svg>
);

const HEAT_STYLE: Record<HeatTone, { bg: string; fg: string }> = {
  great: { bg: "#DCE8D4", fg: "#3F5D33" },
  good:  { bg: "#EDE9D8", fg: "#6B6538" },
  fair:  { bg: "#F3E4CE", fg: "#8A5F2E" },
  rough: { bg: "#F5DAD2", fg: "#93402A" },
};
const HEAT_TONES: HeatTone[] = ["great", "good", "fair", "rough"];
const TONE_LABEL: Record<HeatTone, string> = {
  great: "Great",
  good: "Good",
  fair: "Fair",
  rough: "Rough",
};



// Resolve a bare name (a trip's destination, or the "Lisbon" fallback) to
// coordinates through the same pipeline: first prediction wins.
async function resolvePlaceByName(name: string, token: string): Promise<ResolvedPlace | null> {
  const preds = await fetchPredictions(name, token);
  if (preds.length === 0) return null;
  return fetchPlaceDetails(preds[0].place_id, token);
}

// ── Drag-to-dismiss for mobile bottom sheets ──────────────────────────────
// The app's standard sheet gesture (same numbers as plan/DocumentsSheet):
// touchstart records y, touchmove translates the sheet with transition off,
// touchend past 120px animates out and closes, otherwise springs back.
// Handlers go on the handle/header region — never the scrollable list — so
// scrolling the sheet's content can't fight the dismiss. The width guard
// keeps a stray touch on desktop (touch laptops) from clobbering the md:
// centering transforms with an inline translate.
// Now the shared hook: bound to the whole sheet (below), with the scroll-at-top
// guard so the lists still scroll, and touchcancel so an interrupted drag
// springs back instead of freezing the sheet.
function useSheetDrag(onClose: () => void) {
  return useSharedSheetDrag(onClose, undefined, { mobileOnly: true });
}

// ── Shared grid: 90px label column + 12 equal month columns. The strip is
// desktop-only and sized to fit its container exactly — no horizontal
// scrolling, so no scrollbar, sticky labels, or edge fades. ───────────────
const GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "90px repeat(12, 1fr)",
  columnGap: 5,
};
const LANE_BORDER = "1px solid rgba(26,26,46,0.06)";
const HATCH =
  "repeating-linear-gradient(45deg, rgba(26,26,46,0.10), rgba(26,26,46,0.10) 3px, transparent 3px, transparent 7px)";
// Solid card background (the picker popover and pills sit on it)
const CARD_BG = "#FCFAF7";
// Desktop destination popover — size is fixed so the flip-above maths can
// run before the element exists
const PICKER_W = 250;
const PICKER_H = 380; // tall enough for the wishlist + search without scrolling at 10 rows
// Lane-label cells — first grid column, vertically centred
const LABEL_CELL: CSSProperties = {
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

export default function YearView({ trips }: Props) {
  // null until mounted — the body is client-only, so localStorage and the
  // viewport width can decide the default without a hydration mismatch.
  const [openState, setOpenState] = useState<boolean | null>(null);
  const [dest, setDest] = useState<{ label: string; lat: number; lng: number } | null>(null);
  const [climate, setClimate] = useState<MonthClimate[] | null>(null);
  const [climateError, setClimateError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Prediction[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  // One Places session token, regenerated after each pick (Google bills a
  // session as autocomplete-keystrokes + the details call that closes it)
  const sessionToken = useRef(crypto.randomUUID());
  // Ideal travel windows (Supabase-backed) + the inline add form
  const [travelWindows, setTravelWindows] = useState<TravelWindow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [formLabel, setFormLabel] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [saving, setSaving] = useState(false);
  // The wishlist — "places whose weather I care about". It lives inside the
  // destination picker, decoupled from the open-windows planning path.
  const [wishlist, setWishlist] = useState<WishlistDest[]>([]);
  // Undo window for the two instant deletes (wishlist place, ideal window)
  const [undo, setUndo] = useState<{ label: string; restore: () => Promise<void> } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showUndo = (label: string, restore: () => Promise<void>) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ label, restore });
    undoTimerRef.current = setTimeout(() => setUndo(null), 6000);
  };
  // Tapped heat cell (calendar month 0–11) — tooltips are hover-only, so on
  // touch a tap surfaces the month's numbers in a strip under the grid
  const [detailMonth, setDetailMonth] = useState<number | null>(null);
  // The destination picker renders position:fixed (anchored at open time) so
  // the strip's overflow container can't clip it; this holds the anchor.
  const [pickerPos, setPickerPos] = useState<
    { top?: number; bottom?: number; left: number } | null
  >(null);
  // Add-window sheet's calendar: viewed month + tap-start/tap-end phase
  const [awYear, setAwYear] = useState(() => new Date().getFullYear());
  const [awMonth, setAwMonth] = useState(() => new Date().getMonth());
  const [awPhase, setAwPhase] = useState<"start" | "end">("start");
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(OPEN_KEY);
    } catch {}
    if (stored === "1") setOpenState(true);
    else if (stored === "0") setOpenState(false);
    // Closed by default everywhere (simplification audit, group three). It
    // used to open itself on desktop, which put two thousand lines of planning
    // apparatus — birthdays, the school calendar, wishlist lanes — on the
    // second screen a new user sees. One click opens it, and the choice is
    // remembered, so anyone who wants it open sees it open from then on.
    else setOpenState(false);
  }, []);

  const setOpen = (v: boolean) => {
    setOpenState(v);
    try {
      localStorage.setItem(OPEN_KEY, v ? "1" : "0");
    } catch {}
  };

  // ── Ideal travel windows: load, add, delete (RLS scopes to the user) ────
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
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
    const { data, error } = await supabase
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
    supabase
      .from("wishlist_destinations")
      .select(WISHLIST_COLS)
      // Alphabetical — it's a pick-list, so findability beats any ranking
      .order("name", { ascending: true })
      .then(({ data }: { data: WishlistDest[] | null }) => {
        if (!cancelled && data) setWishlist(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced place search for the weather destination picker
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(async () => {
      const rs = await fetchPredictions(q, sessionToken.current).catch(() => [] as Prediction[]);
      if (cancelled) return;
      setResults(rs);
      setSearching(false);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Selecting a saved wishlist place for the heat row — one tap, no typing.
  // Rows with a stored climate seed the module cache first, so the heat row
  // renders instantly with zero network.
  const handlePickWishlist = (d: WishlistDest) => {
    if (d.lat == null || d.lng == null) return;
    // Seed the cache only from CURRENT-shape profiles. A row stored before
    // precipMm existed would otherwise paint the heat row with no wet-season
    // markers and never self-heal, since a cache hit skips the archive fetch.
    if (
      Array.isArray(d.climate) &&
      d.climate.length === 12 &&
      d.climate[0]?.precipMm != null
    ) {
      seedClimateCache(d.lat, d.lng, d.climate);
    }
    setDest({ label: d.name, lat: d.lat, lng: d.lng });
    setPickerOpen(false);
    setQuery("");
    setResults([]);
  };

  // A search pick does two things: selects the place for the heat row
  // (immediately — the picker closes before the insert lands) and saves it
  // to the wishlist with its climate computed, unless an equivalent row is
  // already there. "The wishlist is places whose weather I care about."
  const handleSearchPick = async (p: Prediction) => {
    if (resolving) return;
    setResolving(true);
    const place = await fetchPlaceDetails(p.place_id, sessionToken.current).catch(() => null);
    sessionToken.current = crypto.randomUUID();
    setResolving(false);
    if (!place) return;
    const name = place.name || predMain(p);
    setDest({ label: name, lat: place.lat, lng: place.lng });
    setPickerOpen(false);
    setQuery("");
    setResults([]);

    const alreadySaved = wishlist.some(
      (d) =>
        d.name.trim().toLowerCase() === name.trim().toLowerCase() ||
        (d.lat != null &&
          d.lng != null &&
          Math.abs(d.lat - place.lat) < 0.05 &&
          Math.abs(d.lng - place.lng) < 0.05)
    );
    if (alreadySaved) return;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // Climate computed up front so the new row behaves like a seeded one;
    // a failed fetch still inserts (climate null).
    const climateArr = await fetchClimate(place.lat, place.lng).catch(() => null);
    const location = compactAddress(place.address, name);
    const { data, error } = await supabase
      .from("wishlist_destinations")
      .insert({
        user_id: user.id,
        name,
        location,
        lat: place.lat,
        lng: place.lng,
        drive_hours: null,
        budget: null,
        best_time: null,
        why: null,
        source: "app",
        climate: climateArr,
      })
      .select(WISHLIST_COLS)
      .single();
    if (error || !data) {
      console.error("Failed to save wishlist place:", error);
      return;
    }
    const saved = data as WishlistDest;
    setWishlist((prev) =>
      [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    );
    // The auto-save is a side effect of a weather check — say so, and let
    // one tap take it back
    showUndo(`Added ${name} to wishlist`, async () => {
      const { error: delErr } = await supabase
        .from("wishlist_destinations")
        .delete()
        .eq("id", saved.id);
      if (!delErr) setWishlist((w) => w.filter((d) => d.id !== saved.id));
    });
  };

  // Instant delete, but never silent: the × sits close to the row's own tap
  // target, so a mis-tap must be recoverable. Rows are re-inserted with their
  // original id, which keeps the climate column and any future references.
  const handleRemovePlace = async (id: string) => {
    const prev = wishlist;
    const row = wishlist.find((d) => d.id === id) ?? null;
    setWishlist((w) => w.filter((d) => d.id !== id));
    const supabase = createClient();
    const { error } = await supabase
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
        const { error: reErr } = await supabase.from("wishlist_destinations").insert({
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
        // Anchor to the whole weather lane, not the chip, so the popover
        // clears the heat cells it filters. Flips above when the viewport
        // has no room below — still never covering the heat row itself.
        const chip = e.currentTarget.getBoundingClientRect();
        const lane = e.currentTarget.closest("[data-lane]")?.getBoundingClientRect() ?? chip;
        const left = Math.max(8, Math.min(chip.left, window.innerWidth - PICKER_W - 8));
        setPickerPos(
          window.innerHeight - lane.bottom >= PICKER_H + 12
            ? { top: lane.bottom + 6, left }
            : { bottom: window.innerHeight - lane.top + 6, left }
        );
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
          background: "#EDECE8",
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
    if (!addOpen && !pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAddOpen(false);
        setPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen, pickerOpen]);

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
    const { error } = await supabase.from("travel_windows").delete().eq("id", id);
    if (error) {
      console.error("Failed to delete travel window:", error);
      return;
    }
    setTravelWindows((prev) => prev.filter((w) => w.id !== id));
    if (row) {
      showUndo(`Removed ${row.label || "window"}`, async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { error: reErr } = await supabase.from("travel_windows").insert({
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

  // Ideal windows that fall inside the rolling window — the lane and the
  // mobile pill row only render when this is non-empty (an empty lane is
  // just a band of blank parchment)
  const idealInWindow = useMemo(
    () =>
      travelWindows.filter(
        (w) => parseDate(w.end_date) >= winStart && parseDate(w.start_date) <= winEnd
      ),
    [travelWindows, winStart, winEnd]
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
  // Computation lives in lib/yearView/openWindows so the new-journey date
  // picker can offer the same windows as quick chips.
  const openWindows = useMemo<OpenWindow[]>(
    () => computeOpenWindows({ trips, travelWindows, todayD, winEnd }),
    [trips, travelWindows, todayD, winEnd]
  );

  // ── Destination default: next upcoming journey, else Lisbon ─────────────
  useEffect(() => {
    const next = trips
      .filter((t) => !t.archived && t.end_date && parseDate(t.end_date) >= todayD)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
    const name = (next?.destination || "Lisbon").split(",")[0].trim();
    let cancelled = false;
    (async () => {
      // A throwaway token: this resolution isn't a user-typed session
      let place = await resolvePlaceByName(name, crypto.randomUUID()).catch(() => null);
      if (!place && name !== "Lisbon") {
        place = await resolvePlaceByName("Lisbon", crypto.randomUUID()).catch(() => null);
      }
      if (!cancelled && place) {
        setDest({ label: place.name || name, lat: place.lat, lng: place.lng });
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

  // Tap-elsewhere dismisses the month detail strip (tapping another cell
  // switches via the cells' own toggle handlers)
  useEffect(() => {
    if (detailMonth == null) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest("[data-heat-cell],[data-heat-detail]")) return;
      setDetailMonth(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [detailMonth]);

  // Reset the detail strip when the destination changes — the numbers on
  // screen would otherwise silently swap under a stale selection
  useEffect(() => {
    setDetailMonth(null);
  }, [dest]);

  // Storm/bug seasons for the picked destination — location decides the
  // label and which calendar months carry the glyph; unmatched places
  // (Tuscany, Budapest) get nothing
  const storm = useMemo(() => (dest ? stormSeasonFor(dest.lat, dest.lng) : null), [dest]);
  const bugs = useMemo(() => (dest ? bugSeasonFor(dest.lat, dest.lng) : null), [dest]);

  // Legend under the heat row — always on, leading with the four colour
  // tones (Brennan: "there's no legend of what the colours mean"); the
  // marker entries join the line only while such a marker is on screen
  const wetVisible = !!climate && climate.some((c) => isWetMonth(c));
  const heatLegend = (
    <div
      className="flex items-center flex-wrap gap-x-3 gap-y-1"
      style={{ fontSize: 9.5, color: "rgba(26,26,46,0.45)" }}
    >
      {HEAT_TONES.map((t) => (
        <span key={t} className="inline-flex items-center gap-1">
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2.5,
              background: HEAT_STYLE[t].bg,
              border: "1px solid rgba(26,26,46,0.08)",
            }}
          />
          {TONE_LABEL[t]}
        </span>
      ))}
      {wetVisible && (
        <span className="inline-flex items-center gap-1">
          <DropGlyph size={7} /> wet season
        </span>
      )}
      {climate && storm && (
        <span className="inline-flex items-center gap-1">
          <StormGlyph size={8} /> {storm.label}
        </span>
      )}
      {climate && bugs && (
        <span className="inline-flex items-center gap-1">
          <BugGlyph size={8} /> {bugs.label}
        </span>
      )}
    </div>
  );

  // Tapped-month detail strip — the hover tooltip's numbers, readable on
  // touch. Renders under whichever grid is on screen; wraps to a second
  // line when season labels join in.
  const detailClimate = detailMonth != null ? climate?.[detailMonth] : undefined;
  const heatDetail =
    detailMonth != null && detailClimate ? (
      <div
        data-heat-detail=""
        className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
        style={{ fontSize: 10.5, lineHeight: "15px", color: "rgba(26,26,46,0.6)" }}
      >
        <span style={{ fontWeight: 600, color: "#1A1A2E" }}>{MONTH_NAMES[detailMonth]}</span>
        <span>
          {[
            `high ${detailClimate.high}°`,
            detailClimate.feelsMax != null ? `feels ${Math.round(detailClimate.feelsMax)}°` : null,
            `rain on ${Math.round(detailClimate.rainShare * 100)}% of days`,
            detailClimate.precipMm != null ? `~${detailClimate.precipMm}mm` : null,
            detailClimate.hci != null ? `HCI ${detailClimate.hci}` : null,
            isWetMonth(detailClimate) ? "wet season" : null,
            storm && storm.months.includes(detailMonth + 1) ? storm.label : null,
            bugs && bugs.months.includes(detailMonth + 1) ? bugs.label : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
    ) : null;

  const isOpen = openState === true;

  // Swipe-down dismissal for the two mobile sheets
  const pickerDrag = useSheetDrag(() => setPickerOpen(false));
  const addDrag = useSheetDrag(() => setAddOpen(false));

  return (
    <>
      {/* A row, not a label and not a header glyph.
          It began as the subtitle of the "Journeys" title; when that title went
          it was an orphan holding a whole line. Moving it to the header made
          the top row seven things at one weight — and a glyph can't tell you
          whether there's anything worth opening. As a row it sits with the
          journeys it describes and carries its own reason to tap. */}
      {!isOpen && (
        <div className="px-4 md:px-0">
          <button
            onClick={() => setOpen(true)}
            aria-expanded={false}
            className="flex items-center gap-1.5 mt-7 mb-3 md:mt-10"
          >
            <span
              className="font-display italic text-sm md:text-[15px]"
              style={{ color: "rgba(26,26,46,0.62)" }}
            >
              Your year
            </span>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#B8B4AC"
              strokeWidth="3"
              strokeLinecap="round"
              style={{ transform: "rotate(-90deg)" }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      )}

      {isOpen && (
    <section
      className="mx-4 mt-3 md:mx-0 md:mt-4 rounded-[14px]"
      style={{ border: "1px solid rgba(26,26,46,0.08)", background: CARD_BG }}
    >
      {/* The panel names and closes itself, now that the trigger outside is
          gone. */}
      <div className="flex items-center justify-between px-4 md:px-5 pt-3">
        <span
          className="font-sans uppercase"
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.14em",
            color: "rgba(26,26,46,0.62)",
          }}
        >
          Your year
        </span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close your year"
          className="flex items-center justify-center"
          style={{ width: 28, height: 28, marginRight: -6, color: "rgba(26,26,46,0.35)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      {/* Body — on mobile the Open-windows list leads (vertical, actionable)
          and the strip follows; desktop keeps the strip first */}
      <div className="flex flex-col px-4 pt-2 pb-3 md:px-5 md:pb-4">
        {/* The strip is desktop-only and fills its container exactly — the
            12 columns flex, nothing scrolls, no scrollbar, no cut months.
            On a phone it was five lanes of sideways swiping to reach what
            the Open-windows list already says, so mobile gets the list +
            heat row + ideal pills instead. */}
        <div className="hidden md:block order-2 md:order-1">
              {/* Month header — year shown where it changes */}
              <div style={GRID} className="mt-1.5">
                <div style={LABEL_CELL} />
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
                      paddingBottom: 5,
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

              {/* Journeys lane — real journeys only. Open windows live in
                  the list below; their dashed pills degraded into confetti
                  at narrow spans and told you less than the list does. */}
              <div style={{ ...GRID, borderTop: LANE_BORDER }} className="items-center py-[5px]">
                <div style={{ ...LABEL_CELL, fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.6)" }}>
                  Journeys
                </div>
                <div style={{ gridColumn: "2 / 14", position: "relative", height: 26 }}>
                  {visibleTrips.map((t) => {
                    const start = parseDate(t.start_date);
                    const end = parseDate(t.end_date);
                    const past = end < todayD;
                    const left = posStart(maxDate(start, winStart));
                    const width = posEnd(minDate(end, winEnd)) - left;
                    // A pill never shrinks below a readable minimum: a short
                    // span renders at 56px with an ellipsized label (it may
                    // overhang its true dates slightly — better than a
                    // one-letter circle), clamped inside the track.
                    const pillWidth = `clamp(56px, ${width}%, 100%)`;
                    return (
                      <Link
                        key={t.id}
                        href={t.openDayId ? `/trips/${t.id}/days/${t.openDayId}` : `/trips/${t.id}`}
                        title={`${t.title} · ${formatRange(start, end)}`}
                        style={{
                          position: "absolute",
                          left: `min(${left}%, calc(100% - ${pillWidth}))`,
                          width: pillWidth,
                          top: 2,
                          height: 22,
                          borderRadius: 999,
                          background: past ? "rgba(26,26,46,0.16)" : "#1A1A2E",
                          color: past ? "#1A1A2E" : "#F5F4F1",
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

              {/* Ideal times lane — only when there's something to show; an
                  empty lane is a band of blank parchment. With no windows,
                  "+ Add window" moves to the Open-windows header instead. */}
              {idealInWindow.length > 0 && (
              <div style={{ ...GRID, borderTop: LANE_BORDER }} className="items-center py-[5px]">
                <div style={{ ...LABEL_CELL, alignItems: "flex-start" }}>
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
                  {idealInWindow.map((w) => {
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
              )}

              {/* Birthdays lane — gold diamonds, names beneath */}
              <div style={{ ...GRID, borderTop: LANE_BORDER }} className="items-center py-[5px]">
                <div style={{ ...LABEL_CELL, fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.6)" }}>
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
                              style={{ fontSize: 8.5, color: "rgba(26,26,46,0.62)", whiteSpace: "nowrap" }}
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
              <div style={{ ...GRID, borderTop: LANE_BORDER }} className="items-center py-[5px]">
                <div style={{ ...LABEL_CELL, fontSize: 11, fontWeight: 600, color: "rgba(26,26,46,0.6)" }}>
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
                          background: "#B0541F",
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
              <div
                data-lane="weather"
                style={{ ...GRID, borderTop: LANE_BORDER }}
                className="items-center py-[5px]"
              >
                <div style={{ ...LABEL_CELL, alignItems: "flex-start" }}>
                  {/* Stacked label: tiny WEATHER caption over the pill, so
                      the pill reads as an openable control (matches mobile) */}
                  <div
                    className="uppercase"
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      color: "rgba(26,26,46,0.4)",
                    }}
                  >
                    Weather
                  </div>
                  {/* 40px hit area; the visual pill is the inner span */}
                  {destChip(86)}
                </div>
                {months.map((m) => {
                  const c = climate?.[m.getMonth()];
                  const tone = c ? scoreMonth(c) : null;
                  const wet = !!c && isWetMonth(c);
                  const stormy = !!c && !!storm && storm.months.includes(m.getMonth() + 1);
                  const buggy = !!c && !!bugs && bugs.months.includes(m.getMonth() + 1);
                  return (
                    <button
                      key={`heat-${m.getTime()}`}
                      type="button"
                      data-heat-cell=""
                      onClick={() =>
                        setDetailMonth((prev) => (prev === m.getMonth() ? null : m.getMonth()))
                      }
                      title={
                        c
                          ? [
                              `Mean high ${c.high}°`,
                              c.feelsMax != null ? `feels ${Math.round(c.feelsMax)}°` : null,
                              `rainy days ${Math.round(c.rainShare * 100)}%`,
                              c.precipMm != null ? `~${c.precipMm}mm rain` : null,
                              c.hci != null ? `HCI ${c.hci}` : null,
                              stormy && storm ? storm.label : null,
                              buggy && bugs ? bugs.label : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : climateError
                            ? "Climate data unavailable"
                            : "Loading climate…"
                      }
                      style={{
                        position: "relative",
                        height: 26,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 600,
                        background: tone ? HEAT_STYLE[tone].bg : "rgba(26,26,46,0.05)",
                        color: tone ? HEAT_STYLE[tone].fg : "rgba(26,26,46,0.3)",
                        boxShadow:
                          detailMonth === m.getMonth()
                            ? "inset 0 0 0 1.5px rgba(26,26,46,0.4)"
                            : undefined,
                      }}
                    >
                      {c ? `${c.high}°` : "–"}
                      {wet && (
                        <span style={{ position: "absolute", top: 2, left: 3 }}>
                          <DropGlyph size={6} />
                        </span>
                      )}
                      {stormy && (
                        <span style={{ position: "absolute", top: 2, right: 3 }}>
                          <StormGlyph size={7} />
                        </span>
                      )}
                      {buggy && (
                        <span style={{ position: "absolute", bottom: 2, right: 3 }}>
                          <BugGlyph size={7} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Tapped-month detail + marker legend — GRID-aligned */}
              {heatDetail && (
                <div style={GRID}>
                  <div />
                  <div style={{ gridColumn: "2 / 14", paddingTop: 5 }}>{heatDetail}</div>
                </div>
              )}
              {heatLegend && (
                <div style={GRID}>
                  <div />
                  <div style={{ gridColumn: "2 / 14", paddingTop: 4 }}>{heatLegend}</div>
                </div>
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
            {idealInWindow.map((w) => (
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
              const wet = !!c && isWetMonth(c);
              const stormy = !!c && !!storm && storm.months.includes(m.getMonth() + 1);
              const buggy = !!c && !!bugs && bugs.months.includes(m.getMonth() + 1);
              return (
                <button
                  key={`mheat-${m.getTime()}`}
                  type="button"
                  data-heat-cell=""
                  onClick={() =>
                    setDetailMonth((prev) => (prev === m.getMonth() ? null : m.getMonth()))
                  }
                  className="flex flex-col items-center justify-center"
                  style={{
                    position: "relative",
                    height: 34,
                    borderRadius: 6,
                    background: tone ? HEAT_STYLE[tone].bg : "rgba(26,26,46,0.05)",
                    color: tone ? HEAT_STYLE[tone].fg : "rgba(26,26,46,0.3)",
                    boxShadow:
                      detailMonth === m.getMonth()
                        ? "inset 0 0 0 1.5px rgba(26,26,46,0.4)"
                        : undefined,
                  }}
                >
                  <span style={{ fontSize: 8.5, opacity: 0.75, textTransform: "uppercase" }}>
                    {m.toLocaleDateString("en-US", { month: "short" })}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.1 }}>
                    {c ? `${c.high}°` : "–"}
                  </span>
                  {wet && (
                    <span style={{ position: "absolute", top: 2, left: 3 }}>
                      <DropGlyph size={6} />
                    </span>
                  )}
                  {stormy && (
                    <span style={{ position: "absolute", top: 2, right: 3 }}>
                      <StormGlyph size={7} />
                    </span>
                  )}
                  {buggy && (
                    <span style={{ position: "absolute", bottom: 2, right: 3 }}>
                      <BugGlyph size={7} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {heatDetail && <div className="mt-1.5">{heatDetail}</div>}
          <div className="mt-1.5">{heatLegend}</div>
        </div>

        {/* Open windows — the takeaway, in words; leads on mobile. At md+
            the rows flow into two columns so the section uses the card's
            width instead of leaving a sea of parchment on the right. */}
        {openWindows.length > 0 && (
          <div className="order-1 md:order-2 md:mt-2 md:pt-1.5 md:border-t md:border-[rgba(26,26,46,0.06)]">
              <div className="flex items-baseline justify-between">
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
                {/* With no ideal windows the strip has no Ideal-times lane;
                    the add affordance lives here instead (desktop only —
                    mobile keeps its chip in the pill row) */}
                {idealInWindow.length === 0 && (
                  <button
                    onClick={openAddSheet}
                    className="hidden md:flex items-center"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "rgba(26,26,46,0.4)",
                      minHeight: 32,
                      margin: "-8px 0",
                    }}
                  >
                    + Add an ideal window
                  </button>
                )}
              </div>
              <div className="mt-1 md:columns-2 md:gap-x-10">
                {openWindows.map((w, i) => {
                  // Tiny month prefix on the first row of each month so the
                  // eye can jump straight to "MAR" in a ~11-row list
                  const prev = openWindows[i - 1];
                  const newMonth =
                    !prev ||
                    prev.coreStart.getMonth() !== w.coreStart.getMonth() ||
                    prev.coreStart.getFullYear() !== w.coreStart.getFullYear();
                  return (
                    <NewJourneyLink
                      key={`list-${w.key}`}
                      seed={{ start: isoOf(w.start), end: isoOf(w.end) }}
                      className="flex w-full items-center justify-between gap-2 py-[4px] text-left"
                      style={{ breakInside: "avoid" }}
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
                        className="flex-shrink-0"
                        style={{ fontSize: 13, color: "rgba(26,26,46,0.3)", lineHeight: 1 }}
                      >
                        ›
                      </span>
                    </NewJourneyLink>
                  );
                })}
              </div>
          </div>
        )}
      </div>

      {/* Destination picker — the wishlist lives here now. Saved places
          first (tap = show its weather, × = remove), then the Google search,
          whose pick both selects for the heat row and saves to the wishlist.
          Bottom sheet below md; anchored popover on desktop. */}
      {pickerOpen && (
        <>
          {/* Mobile: sheet */}
          <div className="md:hidden">
            <div
              className="fixed inset-0 bg-black/40 z-[60]"
              onClick={() => setPickerOpen(false)}
            />
            <div
              ref={pickerDrag.sheetRef}
              onTouchStart={pickerDrag.onTouchStart}
              onTouchMove={pickerDrag.onTouchMove}
              onTouchEnd={pickerDrag.onTouchEnd}
              onTouchCancel={pickerDrag.onTouchCancel}
              role="dialog"
              aria-label="Wishlist"
              className="fixed z-[60] bg-white flex flex-col bottom-0 left-0 right-0 rounded-t-2xl max-w-mobile mx-auto"
              style={{ maxHeight: "80vh", willChange: "transform" }}
            >
              {/* The whole sheet carries the swipe-down gesture (bound on the
                  root above); the list scrolls in its own container and the
                  hook only claims a swipe when that list is at the top. */}
              <div className="flex-shrink-0">
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-9 h-1 bg-gray-200 rounded-full" />
                </div>
                <p className="text-center font-display italic text-base text-gray-900 pt-1 pb-2">
                  Wishlist
                </p>
              </div>
              {/* One scroll region: wishlist rows, then search beneath. The
                  input deliberately has no autoFocus — a keyboard would bury
                  the wishlist rows the sheet leads with. */}
              <div className="flex-1 overflow-y-auto px-3 pb-8">
                {wishlist.length > 0 && (
                  <>
                    {wishlist.map((d) => (
                      <div key={d.id} className="group/wl relative">
                        <button
                          onClick={() => handlePickWishlist(d)}
                          disabled={d.lat == null || d.lng == null}
                          className="w-full text-left rounded-xl px-2 py-2 pr-9 hover:bg-gray-50 transition-colors disabled:opacity-40"
                        >
                          <div style={{ fontSize: 14, color: "#1A1A2E" }}>{d.name}</div>
                          {d.location && d.location !== d.name && (
                            <div
                              className="truncate"
                              style={{ fontSize: 11.5, color: "rgba(26,26,46,0.45)", marginTop: 1 }}
                            >
                              {d.location}
                            </div>
                          )}
                        </button>
                        <button
                          onClick={() => handleRemovePlace(d.id)}
                          aria-label={`Remove ${d.name} from wishlist`}
                          className="absolute top-1/2 -translate-y-1/2 right-1 flex items-center justify-center rounded-full opacity-0 [@media(hover:hover)]:group-hover/wl:opacity-100 [@media(hover:none)]:opacity-40 transition-opacity"
                          style={{ width: 28, height: 28, fontSize: 14, color: "rgba(26,26,46,0.45)" }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </>
                )}
                <div className={`px-2 pb-1 ${wishlist.length > 0 ? "pt-3" : "pt-1"}`}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search a city or region"
                    className="w-full rounded-xl px-3 py-2.5"
                    style={{
                      fontSize: 14,
                      border: "1px solid rgba(26,26,46,0.12)",
                      background: "#FFFFFF",
                      outline: "none",
                    }}
                  />
                </div>
                {resolving || searching ? (
                  <div style={{ fontSize: 12.5, color: "rgba(26,26,46,0.4)", padding: "10px 8px" }}>
                    {resolving ? "Loading…" : "Searching…"}
                  </div>
                ) : results.length === 0 && query.trim().length >= 2 ? (
                  <div style={{ fontSize: 12.5, color: "rgba(26,26,46,0.4)", padding: "10px 8px" }}>
                    Nothing found
                  </div>
                ) : (
                  results.map((p) => (
                    <button
                      key={p.place_id}
                      onClick={() => handleSearchPick(p)}
                      className="w-full text-left rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <div style={{ fontSize: 14, color: "#1A1A2E" }}>{predMain(p)}</div>
                      {predSecondary(p) && (
                        <div
                          className="truncate"
                          style={{ fontSize: 11.5, color: "rgba(26,26,46,0.45)", marginTop: 1 }}
                        >
                          {predSecondary(p)}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Desktop: anchored popover with a real surface */}
          {pickerPos && (
            <div className="hidden md:block">
              <div className="fixed inset-0 z-20" onClick={() => setPickerOpen(false)} />
              <div
                className="z-30 rounded-xl p-2 flex flex-col"
                style={{
                  position: "fixed",
                  top: pickerPos.top,
                  bottom: pickerPos.bottom,
                  left: pickerPos.left,
                  width: PICKER_W,
                  maxHeight: PICKER_H,
                  background: "#FFFFFF",
                  border: "1px solid rgba(26,26,46,0.12)",
                  boxShadow: "0 12px 36px rgba(26,26,46,0.22)",
                }}
              >
                <div className="overflow-y-auto">
                  {wishlist.length > 0 && (
                    <>
                      <div
                        className="uppercase px-1 pb-1"
                        style={{
                          fontSize: 9,
                          fontWeight: 600,
                          letterSpacing: "0.12em",
                          color: "rgba(26,26,46,0.4)",
                        }}
                      >
                        Wishlist
                      </div>
                      {wishlist.map((d) => (
                        <div key={d.id} className="group/wl relative">
                          <button
                            onClick={() => handlePickWishlist(d)}
                            disabled={d.lat == null || d.lng == null}
                            className="w-full text-left rounded-lg px-1.5 py-1.5 pr-7 hover:bg-gray-50 transition-colors disabled:opacity-40"
                          >
                            <div style={{ fontSize: 12.5, color: "#1A1A2E" }}>{d.name}</div>
                            {d.location && d.location !== d.name && (
                              <div
                                className="truncate"
                                style={{ fontSize: 10.5, color: "rgba(26,26,46,0.45)" }}
                              >
                                {d.location}
                              </div>
                            )}
                          </button>
                          <button
                            onClick={() => handleRemovePlace(d.id)}
                            aria-label={`Remove ${d.name} from wishlist`}
                            className="absolute top-1/2 -translate-y-1/2 right-0.5 flex items-center justify-center rounded-full opacity-0 group-hover/wl:opacity-100 transition-opacity"
                            style={{ width: 22, height: 22, fontSize: 12, color: "rgba(26,26,46,0.45)" }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  <div className={wishlist.length > 0 ? "pt-2" : ""}>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search a city or region"
                      className="w-full rounded-lg px-2.5 py-2"
                      style={{
                        fontSize: 12.5,
                        border: "1px solid rgba(26,26,46,0.12)",
                        background: "#FFFFFF",
                        outline: "none",
                      }}
                    />
                  </div>
                  {resolving || searching ? (
                    <div style={{ fontSize: 11.5, color: "rgba(26,26,46,0.4)", padding: "6px 4px" }}>
                      {resolving ? "Loading…" : "Searching…"}
                    </div>
                  ) : results.length === 0 && query.trim().length >= 2 ? (
                    <div style={{ fontSize: 11.5, color: "rgba(26,26,46,0.4)", padding: "6px 4px" }}>
                      Nothing found
                    </div>
                  ) : (
                    results.map((p) => (
                      <button
                        key={p.place_id}
                        onClick={() => handleSearchPick(p)}
                        className="w-full text-left rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
                      >
                        <div style={{ fontSize: 12.5, color: "#1A1A2E" }}>{predMain(p)}</div>
                        {predSecondary(p) && (
                          <div
                            className="truncate"
                            style={{ fontSize: 10.5, color: "rgba(26,26,46,0.45)" }}
                          >
                            {predSecondary(p)}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add an ideal window — the app's sheet chrome + the same calendar
          interaction as the trips/new date picker (tap start, tap end) */}
      {addOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60]" onClick={() => setAddOpen(false)} />
          <div
            ref={addDrag.sheetRef}
            onTouchStart={addDrag.onTouchStart}
            onTouchMove={addDrag.onTouchMove}
            onTouchEnd={addDrag.onTouchEnd}
            onTouchCancel={addDrag.onTouchCancel}
            role="dialog"
            aria-label="Add an ideal window"
            className="fixed z-[60] bg-white flex flex-col bottom-0 left-0 right-0 rounded-t-2xl max-w-mobile mx-auto md:bottom-auto md:top-1/2 md:left-1/2 md:right-auto md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:w-[400px] md:max-w-[calc(100vw-48px)] md:mx-0"
            style={{ maxHeight: "88vh", willChange: "transform" }}
          >
            {/* The whole sheet carries the swipe-down gesture (bound on the
                root above; mobile only — the hook no-ops at md+, where this
                renders as a modal). */}
            <div className="flex-shrink-0">
              <div className="flex justify-center pt-3 pb-1 md:hidden">
                <div className="w-9 h-1 bg-gray-200 rounded-full" />
              </div>
              <p className="text-center font-display italic text-base text-gray-900 pt-1 pb-2 md:pt-5">
                Add an ideal window
              </p>
            </div>

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
