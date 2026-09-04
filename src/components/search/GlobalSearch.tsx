"use client";

// ── Global search ─────────────────────────────────────────────────────────
// The problem it solves: you saved a restaurant months ago and can't remember
// which journey it's on. Before this, the only way to find it was to open
// journeys one at a time. Approved mock: a search field with results grouped
// under quiet small-caps headings — Journeys / Saved places / Wishlist — each
// row a name over a muted context line.
//
// ONE implementation, four entry points (the ⌕ in DesktopMasthead, the ⌕ in
// AppHeader, DayViewClient's ··· menu, PlanBoard's ··· menu) plus "/" and
// ⌘/Ctrl-K from anywhere. They all call `useGlobalSearch().open()`; the
// overlay itself is mounted once by GlobalSearchProvider in (app)/layout.
//
// Everything runs client-side through the browser Supabase client — no API
// route. Every query is scoped to the signed-in traveller by RLS, so there is
// no user_id filter here; adding one would silently hide shared journeys.
//
// DB truth this file depends on:
//  • `cards` has NO title/type/sub_type/address — world facts live on the
//    joined `places` row. Place filters therefore go through the embed
//    (`place:places!inner(...)` + `.ilike("place.title", …)`), the same shape
//    the day page uses for its hotel-card query.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useSheetDrag as useSharedSheetDrag } from "@/hooks/useSheetDrag";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AirplaneTilt, Star } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";
import { getIconSVG } from "@/lib/mapPins";
import LovedHeart from "@/components/ui/LovedHeart";
import { readRecommendedBy, recommendedByLine } from "@/lib/recommendedBy";

const INK = "#1A1A2E";
const PARCHMENT = "#FAF7F2";
const RULE = "rgba(26,26,46,0.10)";
const CAPTION = "rgba(26,26,46,0.45)";
const CAPTION_SOFT = "rgba(26,26,46,0.35)";
const HEADING = "rgba(26,26,46,0.40)";
const HIGHLIGHT = "rgba(26,26,46,0.05)";

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;
/** Rows shown per group before the quiet "+N more" line. */
const GROUP_CAP = 6;
/** Rows fetched per group — enough to count the overflow honestly. */
const FETCH_LIMIT = 24;

// ── The ⌕ glyph ───────────────────────────────────────────────────────────
// Bare, no enclosing shape — matches the bare "+" and "?" it sits beside in
// the masthead.
export function SearchGlyph({
  size = 17,
  strokeWidth = 1.4,
}: {
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="6.4" />
      <path d="M15.9 15.9 20 20" />
    </svg>
  );
}

// ── Context ───────────────────────────────────────────────────────────────
interface GlobalSearchContext {
  open: () => void;
}

// A no-op default rather than a throw: a stray entry point rendered outside
// the provider should be inert, never a crash on a page that otherwise works.
const Ctx = createContext<GlobalSearchContext>({ open: () => {} });

export function useGlobalSearch(): GlobalSearchContext {
  return useContext(Ctx);
}

// ── Result shapes ─────────────────────────────────────────────────────────
type GroupKey = "journeys" | "places" | "wishlist";

interface Hit {
  key: string;
  group: GroupKey;
  title: string;
  context: string;
  href: string;
  /** Sub-type icon markup for place rows; groups without one use a Phosphor glyph. */
  iconSvg?: string;
  /** Place rows only — draws the heart and floats the row up its group. */
  loved?: boolean;
}

interface Group {
  key: GroupKey;
  label: string;
  hits: Hit[];
  /** Rows found beyond GROUP_CAP — rendered as "+N more". */
  overflow: number;
}

type Results = Group[];

// ── Query helpers ─────────────────────────────────────────────────────────

/**
 * Commas and parentheses are PostgREST's `or()` grammar and `%` is the LIKE
 * wildcard — strip all three so a typed comma can't rewrite the filter or a
 * typed "%" match everything.
 */
function sanitize(raw: string): string {
  return raw.replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim();
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const parseDate = (iso: string) => new Date(iso + "T00:00:00");

/** "Aug 18 – 29" within a month, "Aug 28 – Sep 3" across one. */
function formatRange(start: string, end: string): string {
  const a = parseDate(start);
  const b = parseDate(end);
  const am = MONTHS_SHORT[a.getMonth()];
  const bm = MONTHS_SHORT[b.getMonth()];
  return am === bm && a.getFullYear() === b.getFullYear()
    ? `${am} ${a.getDate()} – ${b.getDate()}`
    : `${am} ${a.getDate()} – ${bm} ${b.getDate()}`;
}

function inclusiveDays(start: string, end: string): number {
  const ms = parseDate(end).getTime() - parseDate(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * The two best months by Holiday Climate Index, printed chronologically —
 * "Best: Jun · Sep". Returns null when the stored `climate` jsonb predates
 * the HCI fields, so the caller can fall back to the destination's location.
 */
function bestMonths(climate: unknown): string | null {
  if (!Array.isArray(climate) || climate.length !== 12) return null;
  const scored = climate
    .map((month, index) => ({
      index,
      hci: (month as { hci?: number } | null)?.hci,
    }))
    .filter((m): m is { index: number; hci: number } => typeof m.hci === "number");
  if (scored.length === 0) return null;
  const top = scored
    .slice()
    .sort((a, b) => b.hci - a.hci)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index);
  return `Best: ${top.map((m) => MONTHS_SHORT[m.index]).join(" · ")}`;
}

// Row shapes from the untyped browser client. The client carries no Database
// generic, so selects come back as `any` — these interfaces are the contract
// this file asserts, and the only place the shapes are written down.
interface TripRow {
  id: string;
  title: string;
  destination: string | null;
  start_date: string;
  end_date: string;
  notes: string | null;
  days: { id: string; date: string; day_number: number }[] | null;
}

interface CardRow {
  id: string;
  trip_id: string;
  day_id: string | null;
  status: string;
  details: Record<string, unknown> | null;
  place: {
    id: string;
    title: string;
    address: string | null;
    sub_type: string | null;
    loved: boolean | null;
  } | null;
  trip: { id: string; title: string } | null;
  day: { id: string; day_number: number } | null;
}

interface WishRow {
  id: string;
  name: string;
  location: string | null;
  climate: unknown;
}

const CARD_SELECT = `
  id, trip_id, day_id, status, details,
  place:places!inner ( id, title, address, sub_type, loved ),
  trip:trips ( id, title ),
  day:days ( id, day_number )
`;

/**
 * Runs the three groups' queries in parallel and shapes the hits.
 *
 * Saved places take three of the five calls: a place hit can come from the
 * place's title, its address, or the name of the person who recommended it,
 * and PostgREST can't OR across an embedded resource with the dotted-filter
 * form that's proven in this codebase. Three `ilike`s merged client-side beats
 * one clever filter that might silently return nothing (exactly the bug the
 * day page's hotel query hit).
 *
 * The recommender filter runs against `cards.details` (jsonb) with PostgREST's
 * `->>` path operator. Verified live against this project's REST endpoint
 * before it was relied on: `details->>recommended_by=ilike.*` returns 200,
 * while the same shape over a non-existent base column returns 42703
 * "column cards.nope does not exist" — proof the path is parsed, not treated
 * as a literal column name. If it ever regresses it fails like any other
 * group: logged once, that group dropped, the rest still render.
 */
async function runSearch(rawQuery: string): Promise<Results> {
  const q = sanitize(rawQuery);
  if (q.length < MIN_CHARS) return [];

  const supabase = createClient();
  const like = `%${q}%`;
  const needle = q.toLowerCase();

  const [tripsRes, placesByTitle, placesByAddress, placesByRecommender, wishRes] = await Promise.all([
    // `days` rides along on the embed so a journey row already knows which day
    // to open — no second round trip before the results can render.
    supabase
      .from("trips")
      .select("id, title, destination, start_date, end_date, notes, days ( id, date, day_number )")
      .or(`title.ilike.${like},destination.ilike.${like},notes.ilike.${like}`)
      .order("start_date", { ascending: true })
      .limit(FETCH_LIMIT),
    supabase
      .from("cards")
      .select(CARD_SELECT)
      .neq("status", "cut")
      .ilike("place.title", like)
      .limit(FETCH_LIMIT),
    supabase
      .from("cards")
      .select(CARD_SELECT)
      .neq("status", "cut")
      .ilike("place.address", like)
      .limit(FETCH_LIMIT),
    // "Who told me about that place in Rome?" — searching the recommender is
    // the whole point of recording one.
    supabase
      .from("cards")
      .select(CARD_SELECT)
      .neq("status", "cut")
      .ilike("details->>recommended_by", like)
      .limit(FETCH_LIMIT),
    supabase
      .from("wishlist_destinations")
      .select("id, name, location, climate")
      .or(`name.ilike.${like},location.ilike.${like}`)
      .order("name", { ascending: true })
      .limit(FETCH_LIMIT),
  ]);

  // One group failing must not take the others down with it — log once, drop
  // that group, render the rest. Same graceful-degradation rule as weather.
  for (const [label, res] of [
    ["journeys", tripsRes],
    ["places (title)", placesByTitle],
    ["places (address)", placesByAddress],
    ["places (recommended by)", placesByRecommender],
    ["wishlist", wishRes],
  ] as [string, { error: unknown }][]) {
    if (res?.error) console.error(`[Roam] Search — ${label} query failed:`, res.error);
  }

  // ── Journeys ────────────────────────────────────────────────────────────
  const journeyHits: Hit[] = ((tripsRes.data ?? []) as TripRow[]).map((trip) => {
    const days = trip.days ?? [];
    const openDay = resolveDefaultDay(days);
    const matchedOnText =
      trip.title.toLowerCase().includes(needle) ||
      (trip.destination ?? "").toLowerCase().includes(needle);
    const range = formatRange(trip.start_date, trip.end_date);
    const count = days.length || inclusiveDays(trip.start_date, trip.end_date);
    return {
      key: `trip:${trip.id}`,
      group: "journeys" as const,
      title: trip.title,
      // A notes-only hit says why it's here — the reason is more use than a
      // day count you can read on the journey itself.
      context: matchedOnText
        ? `${range} · ${count} ${count === 1 ? "day" : "days"}`
        : `${range} · matches notes`,
      href: openDay ? `/trips/${trip.id}/days/${openDay.id}` : `/trips/${trip.id}`,
    };
  });

  // ── Saved places ────────────────────────────────────────────────────────
  // One row per place per journey. A hotel sits on a card for every night of
  // the stay; six identical rows would bury everything else, so the scheduled
  // card on the earliest day wins and the rest collapse into it.
  // supabase-js types an embed as an array from the select string alone; the
  // FK here is many-to-one, so each arrives as a single row. Cast through
  // unknown rather than model a shape the runtime never produces.
  const cardRows = [
    ...((placesByTitle.data ?? []) as unknown as CardRow[]),
    ...((placesByAddress.data ?? []) as unknown as CardRow[]),
    ...((placesByRecommender.data ?? []) as unknown as CardRow[]),
  ];
  const byPlace = new Map<string, { hit: Hit; scheduled: boolean; dayNumber: number }>();
  for (const row of cardRows) {
    const place = row.place;
    const trip = row.trip;
    if (!place || !trip) continue;

    const scheduled = row.status === "in_itinerary" && !!row.day_id && !!row.day;
    const dayNumber = row.day?.day_number ?? Number.MAX_SAFE_INTEGER;
    const key = `${row.trip_id}:${place.id}`;
    const existing = byPlace.get(key);
    if (existing) {
      const better =
        (scheduled && !existing.scheduled) ||
        (scheduled === existing.scheduled && dayNumber < existing.dayNumber);
      if (!better) continue;
    }

    // Name the recommender in the context line. A row that surfaced BECAUSE
    // you typed a person's name has to say so, or the hit looks like a bug.
    const recommender = readRecommendedBy(row.details);
    const where = scheduled
      ? `${trip.title} · Day ${row.day!.day_number}`
      : `${trip.title} · saved, not scheduled`;

    byPlace.set(key, {
      scheduled,
      dayNumber,
      hit: {
        key: `card:${key}`,
        group: "places",
        title: place.title,
        loved: place.loved === true,
        context: recommender ? `${where} · ${recommendedByLine(recommender)}` : where,
        // Scheduled places open the day they sit on; an interested or
        // unscheduled card has no day, so its home is the journey's map.
        href: scheduled
          ? `/trips/${row.trip_id}/days/${row.day_id}`
          : `/trips/${row.trip_id}/map`,
        iconSvg: getIconSVG(place.sub_type, INK, 13),
      },
    });
  }
  // Loved places first, alphabetical within each half. The group cap is 6, so
  // without this a place you already know you love can fall off the bottom in
  // favour of one you have never been to.
  const placeHits = Array.from(byPlace.values())
    .map((entry) => entry.hit)
    .sort(
      (a, b) =>
        Number(b.loved === true) - Number(a.loved === true) ||
        a.title.localeCompare(b.title),
    );

  // ── Wishlist ────────────────────────────────────────────────────────────
  // Every wishlist row lands on /trips — the year view there is where a
  // wishlist destination becomes a journey, so no deep link is needed.
  const wishHits: Hit[] = ((wishRes.data ?? []) as WishRow[]).map((dest) => ({
    key: `wish:${dest.id}`,
    group: "wishlist" as const,
    title: dest.name,
    context: bestMonths(dest.climate) ?? dest.location ?? "On your wishlist",
    href: "/trips",
  }));

  return [
    { key: "journeys" as const, label: "Journeys", hits: journeyHits },
    { key: "places" as const, label: "Saved places", hits: placeHits },
    { key: "wishlist" as const, label: "Wishlist", hits: wishHits },
  ]
    .filter((group) => group.hits.length > 0)
    .map((group) => ({
      ...group,
      overflow: Math.max(0, group.hits.length - GROUP_CAP),
      hits: group.hits.slice(0, GROUP_CAP),
    }));
}

// ── Drag-to-dismiss ───────────────────────────────────────────────────────
// The app's standard sheet gesture (same numbers as plan/DocumentsSheet and
// trip/JourneyNotes). The width guard keeps a stray touch on a touch laptop
// from clobbering the md: centering transforms with an inline translate.
// Now the shared hook: bound to the whole sheet (below), with the scroll-at-top
// guard so the results list still scrolls, and touchcancel so an interrupted
// drag springs back instead of freezing the sheet.
function useSheetDrag(onClose: () => void) {
  return useSharedSheetDrag(onClose, undefined, { mobileOnly: true });
}

// ── Provider ──────────────────────────────────────────────────────────────
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ open }), [open]);

  // "/" and ⌘/Ctrl-K open search from anywhere in the app. "/" is ignored
  // while a field has focus — otherwise it would eat the slash in an address
  // or a URL being pasted into a card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        setIsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen && <GlobalSearchOverlay onClose={close} />}
    </Ctx.Provider>
  );
}

// ── Overlay ───────────────────────────────────────────────────────────────
// Mobile: a full-height sheet, field pinned at the top, results scrolling
// beneath. Desktop (md:+): a centred command palette. One element, the same
// responsive-override shape JourneyNotesSheet uses.
function GlobalSearchOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const drag = useSheetDrag(onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const requestId = useRef(0);

  const trimmed = query.trim();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Escape also closes when focus has tabbed onto a result row, not just from
  // the field — same document-level listener the app's other sheets use.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Debounced fetch. A stale response can't overwrite a fresh one: every run
  // claims a request id, and only the current claim is allowed to land.
  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      requestId.current += 1;
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(() => {
      runSearch(q)
        .catch((err) => {
          console.error("[Roam] Search failed:", err);
          return [] as Results;
        })
        .then((next) => {
          if (id !== requestId.current) return;
          setResults(next);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // One flat ordered list across all groups — what ↑/↓ walks.
  const flat = useMemo(() => results.flatMap((group) => group.hits), [results]);

  useEffect(() => {
    setCursor(0);
  }, [results]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-cursor="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[cursor];
      if (hit) go(hit.href);
    }
  };

  const showHint = trimmed.length < MIN_CHARS;
  const showEmpty = !showHint && !loading && flat.length === 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[80]" onClick={onClose} />
      <div
        ref={drag.sheetRef}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="fixed z-[80] flex flex-col bottom-0 left-0 right-0 rounded-t-2xl max-w-mobile mx-auto h-[92dvh] md:h-auto md:max-h-[70vh] md:bottom-auto md:top-[11vh] md:left-1/2 md:right-auto md:-translate-x-1/2 md:rounded-2xl md:w-[560px] md:max-w-[calc(100vw-48px)] md:mx-0"
        style={{
          background: PARCHMENT,
          boxShadow: "0 12px 44px rgba(26,26,46,0.20)",
          willChange: "transform",
        }}
      >
        {/* The whole sheet carries the swipe-down gesture (bound on the root
            above; mobile only — the hook no-ops at md+, where this renders as
            a command palette). The handle is a hint, not the only grip. */}
        <div className="flex-shrink-0 px-4 pb-3 md:px-5 md:pt-5">
          <div className="flex justify-center pt-3 pb-3 md:hidden">
            <div className="w-9 h-1 bg-gray-200 rounded-full" />
          </div>

          <div
            className="flex items-center gap-2.5 rounded-[10px] bg-white px-3"
            style={{ border: `1px solid rgba(26,26,46,0.13)`, height: 42 }}
          >
            <span style={{ color: CAPTION_SOFT, display: "flex" }}>
              <SearchGlyph size={15} strokeWidth={1.5} />
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search journeys, places, wishlist"
              aria-label="Search journeys, saved places and wishlist"
              className="flex-1 min-w-0 bg-transparent outline-none text-[14px] placeholder:text-[rgba(26,26,46,0.35)] [&::-webkit-search-cancel-button]:hidden"
              style={{ color: INK }}
            />
            {/* Quiet inline spinner — the results below stay readable while a
                newer query is in flight; nothing ever blocks the field. */}
            {loading && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={CAPTION_SOFT}
                strokeWidth="2"
                strokeLinecap="round"
                className="animate-spin flex-shrink-0"
                aria-hidden
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto pb-8 md:pb-4">
          {showHint && (
            <p className="px-4 md:px-5 pt-1 pb-4 text-[12px]" style={{ color: CAPTION }}>
              Journeys, saved places and your wishlist — start typing.
            </p>
          )}

          {showEmpty && (
            <p className="px-4 md:px-5 pt-1 pb-4 text-[12.5px]" style={{ color: CAPTION }}>
              Nothing matches &ldquo;{trimmed}&rdquo;
            </p>
          )}

          {results.map((group) => (
            <section key={group.key}>
              <h3
                className="px-4 md:px-5 pt-3.5 pb-1.5 text-[9.5px] font-bold uppercase"
                style={{ letterSpacing: "0.12em", color: HEADING }}
              >
                {group.label}
              </h3>

              {group.hits.map((hit, position) => {
                const index = flat.indexOf(hit);
                const active = index === cursor;
                // The heading below already separates the groups — a hairline
                // under the last row of one would double the rule.
                const last = position === group.hits.length - 1;
                return (
                  <Link
                    key={hit.key}
                    href={hit.href}
                    onClick={onClose}
                    onMouseEnter={() => setCursor(index)}
                    data-cursor={active}
                    className="flex items-center gap-2.5 px-4 md:px-5 py-2.5 no-underline"
                    style={{
                      background: active ? HIGHLIGHT : "transparent",
                      borderBottom: last ? "none" : "1px solid rgba(26,26,46,0.05)",
                    }}
                  >
                    <span
                      className="w-[26px] h-[26px] rounded-[8px] flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(26,26,46,0.06)" }}
                      aria-hidden
                    >
                      {hit.iconSvg ? (
                        <span dangerouslySetInnerHTML={{ __html: hit.iconSvg }} />
                      ) : hit.group === "journeys" ? (
                        <AirplaneTilt size={13} weight="light" color={INK} />
                      ) : (
                        <Star size={13} weight="light" color={INK} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="min-w-0 text-[13.5px] truncate"
                          style={{ color: INK, letterSpacing: "-0.005em" }}
                        >
                          {hit.title}
                        </span>
                        {hit.loved && <LovedHeart size={11} />}
                      </span>
                      <span className="block text-[11.5px] truncate" style={{ color: CAPTION }}>
                        {hit.context}
                      </span>
                    </span>
                  </Link>
                );
              })}

              {group.overflow > 0 && (
                <p
                  className="px-4 md:px-5 py-2 text-[11px]"
                  style={{ color: CAPTION_SOFT }}
                >
                  +{group.overflow} more
                </p>
              )}
            </section>
          ))}
        </div>

        {/* Desktop footer — the palette's own keyboard legend. Hidden on
            mobile, where there is no keyboard to legend. */}
        <div
          className="hidden md:flex items-center gap-4 px-5 py-2.5 flex-shrink-0 text-[10px]"
          style={{ borderTop: `1px solid ${RULE}`, color: CAPTION_SOFT }}
        >
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </>
  );
}

// ── Entry button ──────────────────────────────────────────────────────────
// The shared ⌕ trigger. AppHeader is a server component, so it mounts this
// rather than wiring up its own client handler.
export function SearchButton({
  className,
  size = 17,
  strokeWidth = 1.4,
  label,
}: {
  className?: string;
  size?: number;
  strokeWidth?: number;
  /** Renders the button as a labelled control with its keyboard shortcut,
   *  for places with room for words. A lens alone is a memory test. */
  label?: string;
}) {
  const { open } = useGlobalSearch();
  return (
    <button
      type="button"
      onClick={open}
      title="Search"
      aria-label="Search"
      className={className}
      style={
        label
          ? {
              background: "#FCFBF9",
              border: "1px solid rgba(26,26,46,0.16)",
              cursor: "pointer",
            }
          : { background: "transparent", border: "none", cursor: "pointer" }
      }
    >
      <SearchGlyph size={size} strokeWidth={strokeWidth} />
      {label && (
        <>
          <span style={{ fontSize: 12.5, color: "rgba(26,26,46,0.7)" }}>{label}</span>
          {/* ⌘K is really bound (see the keydown handler above), so the badge
              is a fact rather than decoration. */}
          <span
            style={{
              fontSize: 10,
              padding: "1px 5px",
              borderRadius: 4,
              color: "rgba(26,26,46,0.35)",
              border: "1px solid rgba(26,26,46,0.13)",
            }}
          >
            ⌘K
          </span>
        </>
      )}
    </button>
  );
}
