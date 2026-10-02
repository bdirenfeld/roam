"use client";

/**
 * The desktop Plan as a week (24 Sep 2026): days across, hours down, every
 * timed card a block at its time, untimed cards in their day's header (1 Oct
 * 2026; there is no Anytime lane). Drag a block sideways to change its day, up and down to change its
 * time, its bottom edge to change its end; click it to open the card sheet.
 * Every write goes through queuedUpdate and shows the app's one toast with
 * Undo. Phase 2 (24 Sep 2026) put the map beside it (WeekMap): hover a block
 * and its pin lifts, click a day header and the other days' pins fade, click
 * a pin and the Map tab's card opens. Plan-first blocks and Where to stay are
 * the next pushes (mock: https://claude.ai/artifact/Wtio2jYAqHFkA5Kmcq9CDq).
 *
 * The geometry (lanes for overlaps, snapping, no-end height) is in
 * lib/week/layout.ts and tested against Rome's real times.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCardNotes, withNotes, warmNotes } from "@/hooks/useCardNotes";
import { tripCountries } from "@/lib/entry/countries";
import EntryLine from "@/components/day/EntryLine";
import { useRouter, useSearchParams } from "next/navigation";
import type { Trip, DayWithCards, Card, Day } from "@/types/database";
import { queuedUpdate, queuedInsert, queuedDelete } from "@/lib/offline/queuedWrite";
import { createClient } from "@/lib/supabase/client";
import { scheduleCardOnDay, unscheduleCard } from "@/lib/scheduleCard";
import { PIN_COLORS, getMaterialIconHTML } from "@/lib/mapPins";
import { autoDayTitle } from "@/lib/autoDayTitle";
import { useToast } from "@/components/ui/Toast";
import { cardTimes } from "@/lib/cardTime";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import DocumentsSheet from "./DocumentsSheet";
import StartHere from "./StartHere";
import { useBookingUpload } from "@/components/trip/useBookingUpload";
import WeekMap from "./WeekMap";
import { weekColumns, weekMinWidth } from "@/lib/week/focus";
import { planBatch, planExisting, plannedOtherDays, stayAnchor } from "@/lib/week/dayPlan";
import { durationFor } from "@/lib/week/arrange";
import { placeShare, isMuseum } from "@/lib/plan/dayGroups";
import { dayForCard, onlyOnLine } from "@/lib/plan/eventDays";
import { shortAddress, firstSentence } from "@/lib/week/cardText";
import { weekStarts, pageOf } from "@/lib/week/pages";
import { stayRuns } from "@/lib/stays/stayRuns";
import {
  placeBlocks, movedTimes, resizedEnd, resizedStart, minutesAtY, toMin, toTime, fmt12, gridHeight,
  HOUR_START, HOUR_END, PX_PER_HOUR, NO_END_MIN, type Block,
} from "@/lib/week/layout";

interface Props {
  trip: Trip;
  initialDays: DayWithCards[];
  /** Dayless saved places: hollow pins on the map, nothing on the grid. */
  initialSaved: Card[];
}

const COL_MIN = 168;   // px — seven days fit beside a 440px map at 1440; more scroll sideways
const COL_FLOOR = 120; // px — the seam will not push a day column below this
const HOURS_W = 52;
const MAP_MIN = 300;
const MAP_WIDTH_KEY = "roam.week.mapWidth";

function dow(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short" });
}
function dayLabel(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function cardTitle(c: Card): string {
  const det = c.details as { title?: string; notes?: string } | null;
  return c.place?.title ?? det?.title ?? (det?.notes ? det.notes.slice(0, 60) : "(untitled)");
}
function isNote(c: Card): boolean { return !c.place_id; }
/** The first sentence of a card's notes, for the widened day. */
function noteLine(c: Card): string { return firstSentence((c.details as { notes?: string } | null)?.notes); }

type Drag =
  | { kind: "move"; card: Card; fromDay: string; x0: number; y0: number; offY: number; moved: boolean }
  | { kind: "fromMap"; card: Card; x0: number; y0: number; offY: number; moved: boolean }
  | { kind: "fromMapMany"; cards: Card[]; x0: number; y0: number; moved: boolean }
  | { kind: "resize"; card: Card; y0: number; end0: number; moved: boolean }
  | { kind: "resizeStart"; card: Card; y0: number; moved: boolean };

export default function WeekBoard({ trip, initialDays, initialSaved }: Props) {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [days, setDays] = useState<DayWithCards[]>(initialDays);
  // The map can take the whole page (the week folds away) and come back.
  const [mapWide, setMapWide] = useState(false);
  // Where to stay (25 Sep 2026): ?stays=1 opens the panel over the map, wide.
  const [showStays, setShowStays] = useState(false);
  useEffect(() => { if (searchParams.get("stays") === "1") { setShowStays(true); setMapWide(true); } }, [searchParams]);
  const closeStays = useCallback(() => { setShowStays(false); setMapWide(false); router.replace("/trips/" + trip.id + "/plan"); }, [router, trip.id]);
  // Bookings (26 Sep 2026): the masthead menu asks the open screen for it
  // with "roam:open-bookings". The Agenda and the Map listened; the week did
  // not, so on the desktop Plan the menu row did nothing.
  const [showDocs, setShowDocs] = useState(false);
  useEffect(() => {
    const onOpen = () => setShowDocs(true);
    window.addEventListener("roam:open-bookings", onOpen);
    return () => window.removeEventListener("roam:open-bookings", onOpen);
  }, []);
  // Upload a booking from the week (1 Oct 2026): a new journey's Start here,
  // and Bookings' Upload, which did nothing here. The cards land on their days.
  const upload = useBookingUpload({
    tripId: trip.id,
    days,
    onAdded: (created, deletedIds) => {
      if (deletedIds.length) setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => !deletedIds.includes(c.id)) })));
      draftCreated(created);
    },
  });
  // The visible width of the week, to centre Start here in it while the grid scrolls sideways.
  const [weekW, setWeekW] = useState(0);
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWeekW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Plan first (25 Sep 2026): click an empty hour, name it, a timeless-place
  // block lands there; a place can be linked from its sheet later.
  const [draftBlock, setDraftBlock] = useState<{ dayId: string; dayIdx: number; min: number } | null>(null);
  const [draftText, setDraftText] = useState("");
  // Bulk actions (25 Sep 2026): Shift-click blocks to pick them; a tray offers
  // Move to a day, Take off the day, Delete. Esc or ✕ clears.
  const [pickedBlocks, setPickedBlocks] = useState<Set<string>>(() => new Set());
  const [bulkMove, setBulkMove] = useState(false);
  useEffect(() => {
    if (pickedBlocks.size === 0) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setPickedBlocks(new Set()); setBulkMove(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickedBlocks.size]);
  const justDraggedRef = useRef(false);
  const daysRef = useRef(days); daysRef.current = days;
  const [saved, setSaved] = useState<Card[]>(initialSaved);
  // Every card that lands on a day gets its Intent and Know before you go (hooks/useCardNotes).
  useCardNotes(trip.id, days.flatMap((d) => d.cards), true, (notes) => setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.map((c) => withNotes(c, notes)) }))));
  // The saved places' notes, written ahead so a drop shows its note at once.
  useEffect(() => { warmNotes(trip.id, saved.filter((c) => c.place_id).map((c) => c.id)); }, [trip.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  // One screen (26 Sep 2026): a day header widens that day in place — the
  // other days shrink to strips, the map fits the day. The header again, a
  // strip, or Esc goes back. It replaced a jump to the Agenda page.
  const [focusDayId, setFocusDayId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusDayId) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"))) setFocusDayId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusDayId]);
  // A block dragged over the map: the panel tints, and the drop takes the
  // card off its day (the Map tab's unschedule, so a saved pin remains).
  const [overMap, setOverMap] = useState(false);
  // The header's "…" menu, by day id.
  const [headerMenu, setHeaderMenu] = useState<string | null>(null);
  // Day names (25 Sep 2026): automatic from the cards (`autoDayTitle`), or the
  // name you typed (`days.theme`), which wins. Rename from the "…" menu; an
  // empty name goes back to automatic.
  const [renamingDay, setRenamingDay] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const commitRename = useCallback(async () => {
    const id = renamingDay; if (!id) return;
    setRenamingDay(null);
    const theme = nameDraft.trim() || null;
    const day = daysRef.current.find((d) => d.id === id); if (!day || (day.theme ?? null) === theme) return;
    const before = day.theme ?? null;
    setDays((prev) => prev.map((d) => (d.id === id ? { ...d, theme } : d)));
    const { error } = await queuedUpdate("days", { id }, { theme });
    if (error) { setDays((prev) => prev.map((d) => (d.id === id ? { ...d, theme: before } : d))); toast({ message: "Couldn't rename it. Try again." }); }
  }, [renamingDay, nameDraft, toast]);
  useEffect(() => {
    if (!headerMenu) return;
    const off = () => setHeaderMenu(null);
    window.addEventListener("pointerdown", off);
    return () => window.removeEventListener("pointerdown", off);
  }, [headerMenu]);
  // The seam drags (25 Sep 2026): the map is as wide as you left it, between
  // MAP_MIN and whatever leaves the week its column floor. Remembered per
  // browser; 440px until you touch it.
  const [mapWidth, setMapWidth] = useState(440);
  const [seamHot, setSeamHot] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    try { const v = Number(localStorage.getItem(MAP_WIDTH_KEY)); if (v >= MAP_MIN) setMapWidth(v); } catch { /* private mode */ }
  }, []);
  const onSeamPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setSeamHot(true);
    const frame = frameRef.current;
    const move = (ev: PointerEvent) => {
      if (!frame) return;
      const r = frame.getBoundingClientRect();
      const maxW = Math.max(MAP_MIN, r.width - (HOURS_W + nDays * COL_FLOOR));
      setMapWidth(Math.round(Math.min(maxW, Math.max(MAP_MIN, r.right - ev.clientX))));
    };
    const up = () => {
      setSeamHot(false);
      setMapWidth((w) => { try { localStorage.setItem(MAP_WIDTH_KEY, String(w)); } catch { /* ignore */ } return w; });
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const mapPanelRef = useRef<HTMLDivElement | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [hover, setHover] = useState<{ day: number; min: number | null } | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const colsRef = useRef<HTMLDivElement | null>(null);
  const laneRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // While a drag is in flight the block follows the pointer through a live
  // override; the real times are written once on drop.
  const [ghost, setGhost] = useState<{ id: string; day: number; min: number | null; endMin: number | null } | null>(null);
  // The thing in hand (Brennan, 25 Sep 2026: "you need the outline of an
  // object to know you're dragging something"): a chip with the name rides
  // with the pointer whenever a drag is outside the grid — a pin on its way
  // to the week, a block on its way to the map.
  const [dragChip, setDragChip] = useState<{ x: number; y: number; title: string } | null>(null);

  // Seven days at a time (Brennan, 25 Sep 2026: "you're never scrolling,
  // you're just picking the week"). Longer journeys page with the arrows in
  // the cell above the hours; a 7-day journey shows no arrows at all.
  // Past seven days a screen runs Monday to Sunday (lib/week/pages).
  const starts = useMemo(() => weekStarts(days.map((d) => d.date)), [days]);
  const startsRef = useRef(starts); startsRef.current = starts;
  const [weekIdx, setWeekIdx] = useState(0);
  const page = Math.min(weekIdx, starts.length - 1);
  const weekStart = starts[page];
  const shown = useMemo(() => days.slice(weekStart, starts[page + 1] ?? days.length), [days, starts, page, weekStart]);
  const shownRef = useRef(shown); shownRef.current = shown;
  // Where the journey goes, from its places: a new country re-runs the entry check.
  const weekCountries = useMemo(() => tripCountries(trip.destination, days.flatMap((d) => d.cards.map((c) => c.place?.address))), [trip.destination, days]);
  // ?day=<id> opens the week on that day, in place (27 Sep 2026): the day
  // page sends a computer here rather than showing the old agenda.
  useEffect(() => {
    const id = searchParams.get("day"); if (!id) return;
    const i = daysRef.current.findIndex((d) => d.id === id); if (i < 0) return;
    setWeekIdx(pageOf(startsRef.current, i));
    setFocusDayId(id);
  }, [searchParams]);
  const weeks = starts.length;
  const nDays = shown.length;
  const focusIdx = focusDayId ? shown.findIndex((d) => d.id === focusDayId) : -1;
  const minWidth = weekMinWidth(HOURS_W, nDays, COL_MIN, focusIdx);
  // The day the map fits and fades to: the focused one, else a drop's tint.
  const mapDayId = focusIdx >= 0 ? focusDayId : activeDayId;

  // ── local state helpers ────────────────────────────────────────
  const patchCard = useCallback((id: string, patch: Partial<Card>, toDayId?: string) => {
    setDays((prev) => {
      let moving: Card | null = null;
      const stripped = prev.map((d) => {
        const c = d.cards.find((x) => x.id === id);
        if (c) moving = { ...c, ...patch };
        return { ...d, cards: d.cards.filter((x) => x.id !== id) };
      });
      if (!moving) return prev;
      const target = toDayId ?? (moving as Card).day_id;
      return stripped.map((d) => (d.id === target ? { ...d, cards: [...d.cards, moving as Card] } : d));
    });
    setSelectedCard((prev) => (prev?.id === id ? { ...prev, ...patch } : prev));
  }, []);

  // ── writes ─────────────────────────────────────────────────────
  const write = useCallback(async (card: Card, next: { day_id: string; start_time: string | null; end_time: string | null }, message: string) => {
    const before = { day_id: card.day_id, start_time: card.start_time, end_time: card.end_time };
    patchCard(card.id, next, next.day_id);
    const { error } = await queuedUpdate("cards", { id: card.id }, next);
    if (error) { patchCard(card.id, before, before.day_id); toast({ message: "Couldn't move it. Try again." }); return; }
    toast({
      message,
      undo: async () => {
        patchCard(card.id, before, before.day_id);
        const r = await queuedUpdate("cards", { id: card.id }, before);
        if (r.error) toast({ message: "Couldn't undo. Try again." });
      },
    });
  }, [patchCard, toast]);

  // ── geometry of the pointer ────────────────────────────────────
  // The column container is display:contents (no box), so each day column is
  // measured on its own: with a day in focus they are no longer equal widths.
  function dayAtX(clientX: number): number | null {
    const cols = colsRef.current; if (!cols) return null;
    const dayCols = cols.querySelectorAll<HTMLElement>("[data-daycol]");
    for (let i = 0; i < dayCols.length; i++) {
      const r = dayCols[i].getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right) return i;
    }
    return null;
  }
  function minAtY(clientY: number): number | null {
    const g = colsRef.current; if (!g) return null;
    const r = g.getBoundingClientRect();
    if (clientY < r.top || clientY > r.bottom) return null;
    return minutesAtY(clientY - r.top);
  }
  function overMapPanel(x: number, y: number): boolean {
    const p = mapPanelRef.current; if (!p) return false;
    const r = p.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }
  function overLane(clientY: number): boolean {
    const l = laneRef.current; if (!l) return false;
    const r = l.getBoundingClientRect();
    return clientY >= r.top && clientY <= r.bottom;
  }

  // ── drag: move ─────────────────────────────────────────────────
  const onBlockPointerDown = (e: React.PointerEvent, card: Card, fromDay: string) => {
    if (e.button !== 0) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setPickedBlocks((prev) => { const next = new Set(prev); if (next.has(card.id)) next.delete(card.id); else next.add(card.id); return next; });
      return;
    }
    const el = e.currentTarget as HTMLElement;
    dragRef.current = { kind: "move", card, fromDay, x0: e.clientX, y0: e.clientY, offY: e.clientY - el.getBoundingClientRect().top, moved: false };
    e.preventDefault();
  };
  const [selectionEpoch, setSelectionEpoch] = useState(0);
  const onClusterDragStart = useCallback((picked: Card[]) => {
    dragRef.current = { kind: "fromMapMany", cards: picked, x0: NaN, y0: NaN, moved: false };
  }, []);
  const onPinDragStart = useCallback((card: Card) => {
    // Position is read from the first pointermove (the map's event is not a React one).
    dragRef.current = { kind: "fromMap", card, x0: NaN, y0: NaN, offY: 0, moved: false };
  }, []);
  const onStartHandlePointerDown = (e: React.PointerEvent, card: Card) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    dragRef.current = { kind: "resizeStart", card, y0: e.clientY, moved: false };
  };
  const onHandlePointerDown = (e: React.PointerEvent, card: Card) => {
    if (e.button !== 0) return;
    e.stopPropagation(); e.preventDefault();
    const t = cardTimes(card);
    const s = t.start ? toMin(t.start) : HOUR_START * 60;
    dragRef.current = { kind: "resize", card, y0: e.clientY, end0: t.end ? toMin(t.end) : s + NO_END_MIN, moved: false };
  };

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const d = dragRef.current; if (!d) return;
      if ((d.kind === "fromMap" || d.kind === "fromMapMany") && Number.isNaN(d.x0)) { d.x0 = e.clientX; d.y0 = e.clientY; return; }
      if (!d.moved) {
        const dist = d.kind === "move" || d.kind === "fromMap" || d.kind === "fromMapMany" ? Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) : Math.abs(e.clientY - d.y0);
        if (dist < 4) return;
        d.moved = true;
      }
      if (d.kind === "fromMapMany") {
        const day = dayAtX(e.clientX);
        const onGrid = day !== null && (overLane(e.clientY) || minAtY(e.clientY) !== null);
        setHover(onGrid ? { day: day as number, min: 0 } : null);
        setDragChip({ x: e.clientX, y: e.clientY, title: `${d.cards.length} places` });
        return;
      }
      if (d.kind === "move" || d.kind === "fromMap") {
        const t = cardTimes(d.card);
        const dur = t.start && t.end ? toMin(t.end) - toMin(t.start) : null;
        if (d.kind === "move" && overMapPanel(e.clientX, e.clientY)) {
          setOverMap(true); setGhost(null); setHover(null);
          setDragChip({ x: e.clientX, y: e.clientY, title: cardTitle(d.card) });
          return;
        }
        setOverMap(false);
        const onGrid = dayAtX(e.clientX) !== null && (overLane(e.clientY) || minAtY(e.clientY) !== null);
        setDragChip(d.kind === "fromMap" && !onGrid ? { x: e.clientX, y: e.clientY, title: cardTitle(d.card) } : null);
        if (overLane(e.clientY)) {
          const day = dayAtX(e.clientX);
          setGhost(day === null ? null : { id: d.card.id, day, min: null, endMin: null });
          setHover(day === null ? null : { day, min: null });
          return;
        }
        const day = dayAtX(e.clientX); const min = minAtY(e.clientY - d.offY);
        if (day === null || min === null) { setGhost(null); setHover(null); return; }
        setGhost({ id: d.card.id, day, min, endMin: dur !== null ? min + dur : null });
        setHover({ day, min });
      } else if (d.kind === "resizeStart") {
        const g = colsRef.current; if (!g) return;
        const r = g.getBoundingClientRect();
        const t = cardTimes(d.card);
        const end = t.end ? toMin(t.end) : null;
        const min = toMin(resizedStart({ id: d.card.id, startMin: toMin(t.start ?? "07:00:00"), endMin: end }, minutesAtY(e.clientY - r.top)));
        const dayIdx = shownRef.current.findIndex((x) => x.id === d.card.day_id);
        setGhost({ id: d.card.id, day: dayIdx, min, endMin: end });
      } else {
        const g = colsRef.current; if (!g) return;
        const r = g.getBoundingClientRect();
        const endMin = Math.max(toMin(cardTimes(d.card).start ?? "07:00:00") + 30, minutesAtY(e.clientY - r.top));
        const dayIdx = shownRef.current.findIndex((x) => x.id === d.card.day_id);
        setGhost({ id: d.card.id, day: dayIdx, min: toMin(cardTimes(d.card).start ?? "07:00:00"), endMin });
      }
    }
    function onUp(e: PointerEvent) {
      const d = dragRef.current; dragRef.current = null;
      const g = ghost; setGhost(null); setHover(null); setDragChip(null);
      const wasOverMap = overMap; setOverMap(false);
      if (!d) return;
      if (d.moved) { justDraggedRef.current = true; window.setTimeout(() => { justDraggedRef.current = false; }, 0); }
      if (!d.moved) { if (d.kind === "move") setSelectedCard(d.card); return; }
      const dayList = shownRef.current;
      if (d.kind === "move" && wasOverMap && overMapPanel(e.clientX, e.clientY)) {
        void takeOffDay(d.card);
        return;
      }
      if (d.kind === "fromMap") {
        if (!g) return;
        const target = dayList[g.day];
        void putFromMap(d.card, target, g.min);
        return;
      }
      if (d.kind === "fromMapMany") {
        const day = dayAtX(e.clientX);
        const onGrid = day !== null && (overLane(e.clientY) || minAtY(e.clientY) !== null);
        if (!onGrid) return;
        setSelectionEpoch((n) => n + 1);
        void putMany(d.cards, dayList[day as number]);
        return;
      }
      if (d.kind === "move" && g) {
        // An event on set days stays on them (lib/plan/eventDays).
        const { day: target, moved } = eventTarget(d.card, dayList[g.day]);
        if (moved && target.id === d.card.day_id) { toast({ message: onlyOn(d.card, target.date) }); return; }
        if (g.min === null) {
          if (d.card.start_time === null && d.card.day_id === target.id) return;
          void write(d.card, { day_id: target.id, start_time: null, end_time: null }, `Put on ${dow(target.date)}, anytime`);
          return;
        }
        const t = cardTimes(d.card);
        // Out of Anytime (no times yet): as long as that kind of place takes,
        // the same as a pin dropped from the map (lib/week/arrange durationFor).
        const fromAnytime = !t.start && !t.end;
        const block: Block = { id: d.card.id, startMin: t.start ? toMin(t.start) : g.min, endMin: t.end ? toMin(t.end) : fromAnytime ? g.min + durationFor(d.card.place?.type ?? "activity", d.card.place?.sub_type ?? null, g.min, placeShare(d.card.place), isMuseum(d.card.place)) : null };
        const times = movedTimes(block, g.min);
        if (target.id === d.card.day_id && times.start === d.card.start_time) return;
        void write(d.card, { day_id: target.id, start_time: times.start, end_time: times.end }, moved ? onlyOn(d.card, target.date) : `Moved to ${dow(target.date)} ${fmt12(toMin(times.start))}`);
      } else if (d.kind === "resizeStart" && g && g.min !== null) {
        const start = toTime(g.min);
        if (start === d.card.start_time) return;
        void write(d.card, { day_id: d.card.day_id, start_time: start, end_time: d.card.end_time }, `${cardTitle(d.card)} now starts ${fmt12(g.min)}`);
      } else if (d.kind === "resize" && g && g.endMin !== null) {
        const t = cardTimes(d.card);
        const block: Block = { id: d.card.id, startMin: toMin(t.start ?? "07:00:00"), endMin: t.end ? toMin(t.end) : null };
        const end = resizedEnd(block, g.endMin);
        if (end === d.card.end_time) return;
        void write(d.card, { day_id: d.card.day_id, start_time: d.card.start_time, end_time: end }, `${cardTitle(d.card)} now ends ${fmt12(toMin(end))}`);
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
    // dayAtX/minAtY/overLane read refs and nDays; nDays only changes with days, which re-runs via ghost writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost, write, nDays, overMap]);

  // ── events on set days ─────────────────────────────────────────
  // Brennan, 1 Oct 2026: the Bravio delle Botti is on one Sunday; dropping it
  // on Thursday must not plan it for Thursday. Its own day (the nearest, when
  // it runs on several) takes it, and the toast says why.
  const eventTarget = (card: Card, target: DayWithCards) => dayForCard(card, daysRef.current, target);
  const onlyOn = (card: Card, date: string) => onlyOnLine(cardTitle(card), date, dayForCard(card, daysRef.current, daysRef.current.find((x) => x.date === date) ?? daysRef.current[0]).dates);

  // ── the map drops ──────────────────────────────────────────────
  // Pin → week: a new scheduled card at the drop time, as long as that kind
  // of place takes (lib/week/arrange durationFor: dinner two hours, coffee
  // half an hour), or no time in the Anytime lane; the saved pin stays, as on
  // the Map tab. Undo deletes the new card.
  const putFromMap = useCallback(async (card: Card, dropped: DayWithCards, min: number | null) => {
    if (!card.place_id) return;
    // An event on set days goes to its own day (lib/plan/eventDays).
    const { day: target, moved } = eventTarget(card, dropped);
    const startTime = min === null ? null : toTime(min);
    const endTime = min === null ? null : toTime(Math.min(min + durationFor(card.place?.type ?? "activity", card.place?.sub_type ?? null, min, placeShare(card.place), isMuseum(card.place)), HOUR_END * 60 + 45));
    const created = await scheduleCardOnDay(supabase, { tripId: trip.id, dayId: target.id, placeId: card.place_id, place: card.place, startTime, endTime, details: card.details, sourceUrl: card.source_url });
    if (!created) { toast({ message: "Couldn't put it on that day. Try again." }); return; }
    setDays((prev) => prev.map((d) => (d.id === target.id ? { ...d, cards: [...d.cards, created] } : d)));
    toast({
      message: moved ? onlyOn(card, target.date) : min === null ? `Put on ${dow(target.date)}, anytime` : `Put on ${dow(target.date)} ${fmt12(min)}`,
      undo: async () => {
        const { error } = await queuedDelete("cards", { id: created.id });
        if (error) { toast({ message: "Couldn't undo. Try again." }); return; }
        setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== created.id) })));
      },
    });
  }, [supabase, trip.id, toast]);
  // Week → map: the Map tab's unschedule (deletes the scheduled card, makes a
  // saved one if the place had none). Undo reverses both.
  const takeOffDay = useCallback(async (card: Card) => {
    const { ok, created } = await unscheduleCard(supabase, card);
    if (!ok) { toast({ message: "Couldn't take it off the day. Try again." }); return; }
    setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== card.id) })));
    if (created) setSaved((prev) => [...prev, created]);
    const day = daysRef.current.find((d) => d.id === card.day_id);
    toast({
      message: `Taken off ${day ? dow(day.date) : "the day"}, still on the map`,
      undo: async () => {
        const { error } = await queuedInsert("cards", {
          id: card.id, day_id: card.day_id, trip_id: card.trip_id,
          start_time: card.start_time, end_time: card.end_time,
          position: card.position, status: card.status, source_url: card.source_url,
          details: card.details, ai_generated: card.ai_generated,
          confirmed: card.confirmed, place_id: card.place_id,
        });
        if (error) { toast({ message: "Couldn't undo. Try again." }); return; }
        setDays((prev) => prev.map((d) => (d.id === card.day_id && !d.cards.some((c) => c.id === card.id) ? { ...d, cards: [...d.cards, card] } : d)));
        if (created) { await queuedDelete("cards", { id: created.id }); setSaved((prev) => prev.filter((c) => c.id !== created.id)); }
      },
    });
  }, [supabase, toast]);

  // ── sheet callbacks ────────────────────────────────────────────
  const handleCardUpdate = useCallback((updated: Card) => {
    patchCard(updated.id, updated, updated.day_id);
  }, [patchCard]);
  const handleCardDelete = useCallback((cardId: string) => {
    const gone = daysRef.current.flatMap((d) => d.cards).find((c) => c.id === cardId);
    setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) })));
    setSelectedCard((prev) => (prev?.id === cardId ? null : prev));
    if (!gone) return;
    toast({
      message: "Card deleted",
      undo: async () => {
        const { error } = await queuedInsert("cards", {
          id: gone.id, day_id: gone.day_id, trip_id: gone.trip_id,
          start_time: gone.start_time, end_time: gone.end_time,
          position: gone.position, status: gone.status, source_url: gone.source_url,
          details: gone.details, ai_generated: gone.ai_generated,
          confirmed: gone.confirmed, place_id: gone.place_id,
        });
        if (error) { toast({ message: "Couldn't bring it back. Try again." }); return; }
        setDays((prev) => prev.map((d) => (d.id === gone.day_id && !d.cards.some((c) => c.id === gone.id) ? { ...d, cards: [...d.cards, gone] } : d)));
      },
    });
  }, [toast]);
  const handleCardCopied = useCallback((card: Card) => {
    setDays((prev) => prev.map((d) => (d.id === card.day_id ? { ...d, cards: [...d.cards, card] } : d)));
  }, []);

  // ── arranging (lib/week/arrange) ───────────────────────────────
  // First or last day of the journey, for the planner's hinges (lib/week/dayPlan).
  const edgeOf = (id: string) => { const all = daysRef.current; return { first: all[0]?.id === id, last: all[all.length - 1]?.id === id }; };
  const tintDay = (id: string) => { setActiveDayId(id); window.setTimeout(() => setActiveDayId((cur) => (cur === id ? null : cur)), 2500); };

  // Door 1: several pins → a day. New scheduled cards at arranged times; the
  // saved pins stay. Undo deletes the new cards.
  const putMany = useCallback(async (dropped: Card[], day: Day) => {
    const target = daysRef.current.find((d) => d.id === day.id); if (!target) return;
    // Events on other days go to their own (lib/plan/eventDays); the rest are planned here.
    const onOtherDays = dropped.filter((c) => eventTarget(c, target).moved);
    for (const c of onOtherDays) void putFromMap(c, target, null);
    const picked = dropped.filter((c) => !onOtherDays.includes(c));
    if (!picked.length) return;
    // A place already on that day is not added again (the tray and the drag
    // both write; a second go must not double the day — 25 Sep 2026).
    // Shared with the phone (lib/week/dayPlan): skips places already on this
    // day or planned on another, and a flight home closes the last day.
    const all = daysRef.current;
    const fallback = stayAnchor(all.map((d) => d.id), all.flatMap((d) => d.cards), day.id)
      ?? (trip.destination_lat != null && trip.destination_lng != null ? { lat: trip.destination_lat, lng: trip.destination_lng } : null);
    const { toAdd: withPlace, times, skipped, elsewhere, unplaced } = planBatch(picked, target.cards, fallback, {
      plannedElsewhere: plannedOtherDays(all.flatMap((d) => d.cards), day.id),
      edge: edgeOf(day.id),
    });
    if (withPlace.length === 0) { toast({ message: elsewhere ? `Already planned: ${elsewhere} on other days${skipped ? `, ${skipped} on ${dow(target.date)}` : ""}.` : `Already on ${dow(target.date)}.` }); return; }
    const created: Card[] = [];
    for (const c of withPlace) {
      const t = times.get(c.id);
      const made = await scheduleCardOnDay(supabase, { tripId: trip.id, dayId: day.id, placeId: c.place_id, place: c.place, startTime: t ? t.start : null, endTime: t ? t.end : null, details: c.details, sourceUrl: c.source_url });
      if (made) created.push(made);
    }
    if (created.length === 0) { toast({ message: "Couldn't put them on that day. Try again." }); return; }
    setDays((prev) => prev.map((d) => (d.id === day.id ? { ...d, cards: [...d.cards, ...created] } : d)));
    setMapWide(false); tintDay(day.id);
    const n = created.length;
    toast({
      duration: 12000,
      message: [
        unplaced.length ? `${n} on ${dow(target.date)}; ${unplaced.length} didn't fit, left anytime` : `${n} ${n === 1 ? "place" : "places"} on ${dow(target.date)}, in walking order`,
        skipped ? `${skipped} already there` : "",
        elsewhere ? `${elsewhere} already on other days` : "",
      ].filter(Boolean).join(" · "),
      undo: async () => {
        for (const c of created) await queuedDelete("cards", { id: c.id });
        const ids = new Set(created.map((c) => c.id));
        setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => !ids.has(c.id)) })));
      },
    });
  }, [supabase, trip.id, trip.destination_lat, trip.destination_lng, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // Door 2: a day's timeless blocks get times around the timed ones.
  // One planner for the week, the day page and the phone (lib/week/dayPlan):
  // the week used to call the engine itself and missed what the planner knows
  // (ports, all aboard, the first and last day's hinges; 27 Sep 2026).
  const planFallback = trip.destination_lat != null && trip.destination_lng != null ? { lat: trip.destination_lat, lng: trip.destination_lng } : null;
  // That night's stay first, then the journey's centre (lib/week/dayPlan stayAnchor).
  const fallbackFor = (dayId: string) => {
    const all = daysRef.current;
    return stayAnchor(all.map((d) => d.id), all.flatMap((d) => d.cards), dayId) ?? planFallback;
  };
  const applyPlan = useCallback(async (dayId: string, list: { id: string; start_time: string | null; end_time: string | null }[]) => {
    for (const u of list) {
      const next = { start_time: u.start_time, end_time: u.end_time };
      patchCard(u.id, next, dayId);
      await queuedUpdate("cards", { id: u.id }, next);
    }
  }, [patchCard]);
  const arrangeThisDay = useCallback(async (dayId: string) => {
    const day = daysRef.current.find((d) => d.id === dayId); if (!day) return;
    if (!day.cards.some((c) => !cardTimes(c).start)) { toast({ message: "Everything on this day already has a time." }); return; }
    const { updates, before, unplaced } = planExisting(day.cards, "rest", fallbackFor(dayId), edgeOf(dayId));
    if (updates.length === 0) { toast({ message: "No room left on this day." }); return; }
    await applyPlan(dayId, updates);
    tintDay(dayId);
    toast({
      message: unplaced.length ? `${dow(day.date)} arranged; ${unplaced.length} didn't fit` : `${dow(day.date)} arranged`,
      undo: () => applyPlan(dayId, before),
    });
  }, [applyPlan, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── plan first ─────────────────────────────────────────────────
  const onColumnClick = (e: React.MouseEvent<HTMLDivElement>, dayId: string, dayIdx: number) => {
    if (justDraggedRef.current) return;
    const t = e.target as HTMLElement;
    if (t !== e.currentTarget && !t.dataset.hourline) return;   // a block, not the empty hour
    const min = minAtY(e.clientY); if (min === null) return;
    setDraftText(""); setDraftBlock({ dayId, dayIdx, min });
  };
  const commitDraft = useCallback(async () => {
    const d = draftBlock; const title = draftText.trim();
    setDraftBlock(null);
    if (!d || !title) return;
    const created = await scheduleCardOnDay(supabase, { tripId: trip.id, dayId: d.dayId, placeId: null, details: { title }, startTime: toTime(d.min), endTime: toTime(Math.min(d.min + 60, HOUR_END * 60 + 45)) });
    if (!created) { toast({ message: "Couldn't add it. Try again." }); return; }
    setDays((prev) => prev.map((x) => (x.id === d.dayId ? { ...x, cards: [...x.cards, created] } : x)));
    toast({
      message: `"${title}" at ${fmt12(d.min)}. Open it to link a place.`,
      undo: async () => {
        const { error } = await queuedDelete("cards", { id: created.id });
        if (error) { toast({ message: "Couldn't undo. Try again." }); return; }
        setDays((prev) => prev.map((x) => ({ ...x, cards: x.cards.filter((c) => c.id !== created.id) })));
      },
    });
  }, [draftBlock, draftText, supabase, trip.id, toast]);

  // Door 3: the whole day re-sequenced and re-timed; confirmed bookings stay
  // as fixed points. Undo puts every time back.
  const rearrangeEverything = useCallback(async (dayId: string) => {
    const day = daysRef.current.find((d) => d.id === dayId); if (!day) return;
    const { updates, before, unplaced } = planExisting(day.cards, "all", fallbackFor(dayId), edgeOf(dayId));
    if (updates.length === 0) { toast({ message: "Everything on this day is confirmed." }); return; }
    await applyPlan(dayId, updates);
    tintDay(dayId);
    toast({
      duration: 12000,
      message: unplaced.length ? `${dow(day.date)} rearranged; ${unplaced.length} left anytime` : `${dow(day.date)} rearranged`,
      undo: () => applyPlan(dayId, before),
    });
  }, [applyPlan, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── bulk actions on picked blocks ──────────────────────────────
  const pickedCards = useMemo(() => days.flatMap((d) => d.cards).filter((c) => pickedBlocks.has(c.id)), [days, pickedBlocks]);
  const bulkMoveTo = useCallback(async (day: Day) => {
    const cards = pickedCards; setPickedBlocks(new Set()); setBulkMove(false);
    const before = cards.map((c) => ({ id: c.id, day_id: c.day_id }));
    for (const c of cards) { patchCard(c.id, { day_id: day.id }, day.id); await queuedUpdate("cards", { id: c.id }, { day_id: day.id }); }
    toast({
      message: `${cards.length} moved to ${dow(day.date)}`,
      undo: async () => { for (const b of before) { patchCard(b.id, { day_id: b.day_id }, b.day_id ?? undefined); await queuedUpdate("cards", { id: b.id }, { day_id: b.day_id }); } },
    });
  }, [pickedCards, patchCard, toast]);
  const bulkTakeOff = useCallback(async () => {
    const cards = pickedCards; setPickedBlocks(new Set());
    for (const c of cards) await takeOffDay(c);
  }, [pickedCards, takeOffDay]);
  const bulkDelete = useCallback(async () => {
    const cards = pickedCards; setPickedBlocks(new Set());
    const ids = new Set(cards.map((c) => c.id));
    setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => !ids.has(c.id)) })));
    for (const c of cards) await queuedDelete("cards", { id: c.id });
    toast({
      message: `${cards.length} deleted`,
      undo: async () => {
        for (const gone of cards) {
          const { error } = await queuedInsert("cards", {
            id: gone.id, day_id: gone.day_id, trip_id: gone.trip_id, start_time: gone.start_time, end_time: gone.end_time,
            position: gone.position, status: gone.status, source_url: gone.source_url, details: gone.details,
            ai_generated: gone.ai_generated, confirmed: gone.confirmed, place_id: gone.place_id,
          });
          if (!error) setDays((prev) => prev.map((d) => (d.id === gone.day_id && !d.cards.some((c) => c.id === gone.id) ? { ...d, cards: [...d.cards, gone] } : d)));
        }
      },
    });
  }, [pickedCards, toast]);

  // ── Plan my trip (28–29 Sep 2026) ───────────────────────────────
  // The plan lands as ordinary cards (no draft, nothing to confirm). Right
  // after, a tray says what was planned with Where to stay and Undo; Undo
  // deletes those cards. Taking them off later is in the sheet ("Remove what
  // Plan my trip added").
  const [recentPlan, setRecentPlan] = useState<Card[] | null>(null);
  const draftCreated = useCallback((created: Card[]) => {
    setDays((prev) => prev.map((d) => {
      const mine = created.filter((c) => c.day_id === d.id);
      return mine.length ? { ...d, cards: [...d.cards, ...mine] } : d;
    }));
    setRecentPlan(created);
  }, []);
  useEffect(() => {
    const onGone = (e: Event) => {
      const ids = new Set((e as CustomEvent<string[]>).detail);
      setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => !ids.has(c.id)) })));
      setRecentPlan(null);
    };
    window.addEventListener("roam:draft-removed", onGone);
    return () => window.removeEventListener("roam:draft-removed", onGone);
  }, []);
  const undoPlan = useCallback(async () => {
    const cards = recentPlan ?? [];
    setRecentPlan(null);
    if (!cards.length) return;
    const ids = new Set(cards.map((c) => c.id));
    setDays((prev) => prev.map((d) => ({ ...d, cards: d.cards.filter((c) => !ids.has(c.id)) })));
    const { error } = await createClient().from("cards").delete().in("id", Array.from(ids));
    if (error) { draftCreated(cards); toast({ message: "Couldn't undo it. Try again." }); return; }
    toast({ message: `Took off ${cards.length} ${cards.length === 1 ? "place" : "places"}` });
  }, [recentPlan, draftCreated, toast]);

  // ── the map's callbacks ────────────────────────────────────────
  // A pin's card is either on a day (patch it there) or in the saved pile.
  const mapCardUpdate = useCallback((updated: Card) => {
    if (updated.day_id) { patchCard(updated.id, updated, updated.day_id); return; }
    setSaved((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, [patchCard]);
  // "Put on a day" makes a new scheduled card; the saved one stays, as on the Map tab.
  const mapCardCreated = useCallback((created: Card) => {
    if (!created.day_id) { setSaved((prev) => [...prev, created]); return; }
    setDays((prev) => prev.map((d) => (d.id === created.day_id && !d.cards.some((c) => c.id === created.id) ? { ...d, cards: [...d.cards, created] } : d)));
    // Show where it went (27 Sep 2026): "Put on Mon 16 Aug" from the map left
    // the week on 1 July, and the camp was nowhere to be seen.
    const i = daysRef.current.findIndex((d) => d.id === created.day_id);
    if (i >= 0) { setWeekIdx(pageOf(startsRef.current, i)); tintDay(created.day_id); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mapCardDelete = useCallback((cardId: string) => {
    const inSaved = saved.find((c) => c.id === cardId);
    if (!inSaved) { handleCardDelete(cardId); return; }
    setSaved((prev) => prev.filter((c) => c.id !== cardId));
    toast({
      message: "Removed from the map",
      undo: async () => {
        const { error } = await queuedInsert("cards", {
          id: inSaved.id, day_id: null, trip_id: inSaved.trip_id,
          start_time: null, end_time: null, position: inSaved.position,
          status: inSaved.status, source_url: inSaved.source_url, details: inSaved.details,
          ai_generated: inSaved.ai_generated, confirmed: inSaved.confirmed, place_id: inSaved.place_id,
        });
        if (error) { toast({ message: "Couldn't bring it back. Try again." }); return; }
        setSaved((prev) => (prev.some((c) => c.id === inSaved.id) ? prev : [...prev, inSaved]));
      },
    });
  }, [saved, handleCardDelete, toast]);
  const pinCards = useMemo(() => [...saved, ...days.flatMap((d) => d.cards)], [saved, days]);

  // ── layout per day ─────────────────────────────────────────────
  const laidOut = useMemo(() => shown.map((d, di) => {
    const timed: Block[] = []; const untimed: Card[] = [];
    for (const c of d.cards) {
      if (ghost && ghost.id === c.id) {
        if (ghost.day !== di) continue;
        if (ghost.min === null) { untimed.push(c); continue; }
        timed.push({ id: c.id, startMin: ghost.min, endMin: ghost.endMin });
        continue;
      }
      const t = cardTimes(c);
      if (!t.start) { untimed.push(c); continue; }
      timed.push({ id: c.id, startMin: toMin(t.start), endMin: t.end ? toMin(t.end) : null });
    }
    // a block dragged INTO this day from another
    if (ghost && ghost.day === di && !d.cards.some((c) => c.id === ghost.id)) {
      if (ghost.min === null) { const src = [...saved, ...days.flatMap((x) => x.cards)].find((c) => c.id === ghost.id); if (src) untimed.push(src); }
      else timed.push({ id: ghost.id, startMin: ghost.min, endMin: ghost.endMin });
    }
    return { day: d, placed: placeBlocks(timed), untimed };
  }), [shown, days, ghost, saved]);
  const byId = useMemo(() => { const m = new Map<string, Card>(); saved.forEach((c) => m.set(c.id, c)); days.forEach((d) => d.cards.forEach((c) => m.set(c.id, c))); return m; }, [days, saved]);
  // Where you sleep (1 Oct 2026, lib/stays/stayRuns). The Anytime lane went
  // (untimed cards sit in their day's header); a band across the hotel's
  // nights replaced it and was dropped the same day (Brennan: "maybe just
  // check-in and check-out"). A hotel shows as its check-in and check-out
  // blocks, named so.
  const runs = useMemo(() => stayRuns(days.map((d) => ({ date: d.date, cards: d.cards })), trip.end_date), [days, trip.end_date]);
  const blockTitle = (c: Card, date: string) => {
    if (c.place?.sub_type !== "hotel") return cardTitle(c);
    const run = runs.find((r) => r.placeId === c.place_id && (r.checkIn === date || r.checkOut === date));
    return run ? `${run.checkIn === date ? "Check in" : "Check out"} · ${run.title}` : cardTitle(c);
  };

  const hours: number[] = []; for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);
  const gridStyle = { gridTemplateColumns: weekColumns(HOURS_W, nDays, COL_MIN, focusIdx), transition: "grid-template-columns 200ms ease" } as const;
  const collapsed = (i: number) => focusIdx >= 0 && i !== focusIdx;

  return (
    <div ref={frameRef} className="flex h-[calc(100dvh-64px)] bg-[#F5F4F1]">
      {/* One scroller for both axes (25 Sep 2026): the header and the Anytime
          lane stick to the top, the hours gutter sticks to the left. Two nested
          scrollers (sideways outside, down inside) left the gutter sliding
          away once the map was widened, because sticky only knows its nearest
          scrolling ancestor. */}
      <div ref={gridRef} data-week-scroll="1" className={`weekScroll flex-1 min-w-0 overflow-auto select-none ${mapWide ? "hidden" : ""}`}>
        <div className="flex flex-col" style={{ minWidth: minWidth }}>
          {/* Entry (27 Sep 2026): the check and its line lived only on the day
              page, and a computer now opens the week — so since the week became
              the owner's day, a new journey was never checked. Same line, same
              rules: before departure, hidden with its ×. */}
          <div className="sticky left-0 pb-2 empty:hidden" style={{ maxWidth: "min(100%, 100vw)" }}>
            <EntryLine trip={trip} days={days} dayDate={days[0]?.date ?? ""} countries={weekCountries} />
          </div>
          {/* Start here (1 Oct 2026): a new journey's two ways to start, held
              in view over the empty grid (sticky both ways, no height of its
              own); each button goes once done (lib/plan/startHere). */}
          <div className="sticky left-0 top-[150px] z-[12] h-0 pointer-events-none" style={{ width: weekW || "100%" }}>
            <div className="flex justify-center px-4">
              <div className="pointer-events-auto w-full max-w-[360px]">
                <StartHere floating cards={pinCards} place={trip.destination ?? ""} reading={upload.reading} onUpload={upload.pick}
                  onFind={() => window.dispatchEvent(new Event("roam:open-find"))} />
              </div>
            </div>
          </div>
          <div className="sticky top-0 z-[9]">
          {/* day headers */}
          {/* The headers are also where a card goes to lose its time: drop it
              on a day's header and it sits there, untimed (overLane). */}
          <div ref={laneRef} className="grid border-b bg-white flex-shrink-0" style={{ ...gridStyle, borderColor: "rgba(26,26,46,0.10)" }}>
            <div className="flex items-center justify-center gap-0.5 sticky left-0 z-[8] bg-white">
              {weeks > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => { setFocusDayId(null); setWeekIdx(Math.max(0, page - 1)); }}
                    disabled={page === 0}
                    aria-label="Previous week"
                    title={`Week ${page} of ${weeks}`}
                    className="w-5 h-5 rounded-full flex items-center justify-center disabled:opacity-25 hover:bg-[rgba(26,26,46,0.06)]"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFocusDayId(null); setWeekIdx(Math.min(weeks - 1, page + 1)); }}
                    disabled={page === weeks - 1}
                    aria-label="Next week"
                    title={`Week ${page + 2} of ${weeks}`}
                    className="w-5 h-5 rounded-full flex items-center justify-center disabled:opacity-25 hover:bg-[rgba(26,26,46,0.06)]"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </>
              )}
            </div>
            {shown.map((d, i) => collapsed(i) ? (
              <button
                key={d.id}
                type="button"
                onClick={() => setFocusDayId(d.id)}
                data-testid="day-strip"
                className="border-l py-2 min-w-0 text-center text-[10.5px] font-semibold leading-tight hover:bg-[#F3EFE4] transition-colors"
                style={{ borderColor: "rgba(26,26,46,0.10)" }}
                title={`${dow(d.date)} ${dayLabel(d.date)}`}
                aria-label={`Open ${dow(d.date)} ${dayLabel(d.date)}`}
              >
                {dow(d.date)}<br /><span className="font-normal text-activity/50">{new Date(d.date + "T00:00:00").getDate()}</span>
              </button>
            ) : (
              <div
                key={d.id}
                // One screen (26 Sep 2026): a day header widens that day in
                // place; again goes back to the week. The map fits the day.
                onClick={() => setFocusDayId((cur) => (cur === d.id ? null : d.id))}
                className="group relative px-2 py-2 border-l min-w-0 cursor-pointer transition-colors hover:bg-[#F3EFE4]"
                title={focusIdx === i ? "Back to the week (Esc)" : "Open this day"}
                data-testid={focusIdx === i ? "day-focused" : "day-header"}
                style={{ borderColor: "rgba(26,26,46,0.10)", background: hover && hover.day === i && hover.min === null ? "rgba(26,26,46,0.06)" : mapDayId === d.id ? "#F3EFE4" : undefined, opacity: mapDayId && mapDayId !== d.id ? 0.55 : 1 }}
              >
                <button
                  type="button"
                  aria-label="Day actions"
                  onClick={(e) => { e.stopPropagation(); setHeaderMenu((cur) => (cur === d.id ? null : d.id)); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className={`absolute right-1.5 top-1.5 w-[22px] h-[22px] rounded-full flex items-center justify-center text-[12px] font-bold transition-opacity ${headerMenu === d.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                  style={{ background: "rgba(26,26,46,0.06)" }}
                >…</button>
                {headerMenu === d.id && (
                  <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="absolute right-1.5 top-8 z-30 bg-white rounded-[10px] p-1 w-[172px] text-[12.5px] font-normal" style={{ border: "1px solid rgba(26,26,46,0.10)", boxShadow: "0 16px 34px rgba(26,26,46,0.17)" }}>
                    <button className="w-full text-left px-2.5 py-[7px] rounded-md hover:bg-[#F3EFE4]" onClick={() => { setHeaderMenu(null); setNameDraft(d.theme ?? ""); setRenamingDay(d.id); }}>Rename this day</button>
                    <button className="w-full text-left px-2.5 py-[7px] rounded-md hover:bg-[#F3EFE4]" onClick={() => { setHeaderMenu(null); void arrangeThisDay(d.id); }}>Fill in missing times</button>
                    <button className="w-full text-left px-2.5 py-[7px] rounded-md hover:bg-[#F3EFE4]" onClick={() => { setHeaderMenu(null); void rearrangeEverything(d.id); }}>Re-plan the whole day</button>
                  </div>
                )}
                {focusIdx === i ? (
                  <div className="text-[15px] font-semibold leading-tight flex items-baseline gap-2">
                    {new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                    <span className="text-[11px] font-normal text-activity/50">{d.cards.length} {d.cards.length === 1 ? "plan" : "plans"} · Esc for the week</span>
                  </div>
                ) : (
                  <div className="text-[13px] font-semibold leading-tight">{dow(d.date)}<span className="ml-1.5 text-[11px] font-medium text-activity/40">{dayLabel(d.date)}</span></div>
                )}
                {renamingDay === d.id ? (
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void commitRename(); if (e.key === "Escape") setRenamingDay(null); }}
                    onBlur={() => void commitRename()}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    placeholder={autoDayTitle(d, i === 0, i === shown.length - 1) ?? "Name this day"}
                    aria-label="Name this day"
                    className="w-full text-[10.5px] mt-0.5 bg-white rounded px-1 outline-none ring-1 ring-[#1A1A2E]"
                  />
                ) : (
                  <div className="text-[10.5px] text-activity/60 truncate mt-0.5">{d.theme ?? autoDayTitle(d, i === 0, i === shown.length - 1) ?? " "}</div>
                )}
                {/* Untimed: on its own day, dashed until it has a time. */}
                {(laidOut[i]?.untimed.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-[3px] mt-1.5" data-testid="day-untimed">
                    {laidOut[i].untimed.map((c) => (
                      <div
                        key={c.id}
                        onPointerDown={(e) => onBlockPointerDown(e, c, d.id)}
                        onClick={(e) => e.stopPropagation()}
                        onPointerEnter={() => setHoveredId(c.id)}
                        onPointerLeave={() => setHoveredId((h) => (h === c.id ? null : h))}
                        className={`text-[10px] font-medium bg-[#FBFAF7] rounded-[5px] px-1.5 py-[3px] truncate max-w-full cursor-grab ${pickedBlocks.has(c.id) ? "ring-2 ring-[#1A1A2E]" : ""}`}
                        style={{ border: "1px dashed rgba(26,26,46,0.22)", borderLeft: `3px solid ${isNote(c) ? "rgba(26,26,46,0.4)" : PIN_COLORS[c.place!.type]}`, opacity: ghost?.id === c.id ? 0.6 : 1 }}
                        title={`${cardTitle(c)} · no time yet`}
                      >{cardTitle(c)}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          </div>
          {/* the hours */}
          <div className="relative">
            <div ref={colsRef} className="grid relative" style={{ ...gridStyle, height: gridHeight() }}>
              <div className="sticky left-0 z-[8] bg-[#F5F4F1]">
                {hours.map((h) => (
                  <div key={h} className="absolute right-1.5 text-[10px] text-activity/40 tabular-nums" style={{ top: (h - HOUR_START) * PX_PER_HOUR - 6 }}>{h % 12 || 12}{h < 12 ? " am" : " pm"}</div>
                ))}
              </div>
              <div className="contents">
                {laidOut.map(({ day, placed }, di) => (
                  <div key={day.id} data-daycol={day.id} onClick={(e) => (collapsed(di) ? setFocusDayId(day.id) : onColumnClick(e, day.id, di))} className={`relative border-l min-w-0 transition-colors ${collapsed(di) ? "cursor-pointer hover:bg-[rgba(26,26,46,0.04)]" : "cursor-cell"}`} style={{ borderColor: "rgba(26,26,46,0.10)", background: collapsed(di) ? "rgba(26,26,46,0.02)" : hover && hover.day === di && hover.min !== null ? "rgba(26,26,46,0.04)" : undefined }}>
                    {hours.map((h) => (
                      <div key={h} data-hourline="1" className="absolute left-0 right-0" style={{ top: (h - HOUR_START) * PX_PER_HOUR, borderTop: "1px solid rgba(26,26,46,0.06)" }} />
                    ))}
                    {draftBlock && draftBlock.dayId === day.id && (
                      <div
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute left-[3px] right-[3px] rounded-[6px] z-[7]"
                        style={{ top: ((draftBlock.min - HOUR_START * 60) / 60) * PX_PER_HOUR, height: PX_PER_HOUR, background: "#F3EFE4", border: "1px dashed rgba(26,26,46,0.35)", borderLeft: "3px solid rgba(26,26,46,0.4)", padding: "4px 6px" }}
                      >
                        <input
                          autoFocus
                          value={draftText}
                          onChange={(e) => setDraftText(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") void commitDraft(); if (e.key === "Escape") setDraftBlock(null); }}
                          onBlur={() => void commitDraft()}
                          placeholder="What's the plan?"
                          aria-label="Name the plan"
                          className="w-full bg-transparent text-[11px] font-medium outline-none placeholder:text-activity/40"
                        />
                        <div className="text-[9.5px] text-activity/60 tabular-nums">{fmt12(draftBlock.min)} – {fmt12(Math.min(draftBlock.min + 60, HOUR_END * 60 + 45))}</div>
                      </div>
                    )}
                    {placed.map((b) => {
                      const c = byId.get(b.id); if (!c) return null;
                      const note = isNote(c);
                      // A strip keeps the shape of its day: coloured bars, no text.
                      if (collapsed(di)) return (
                        <div key={c.id} className="absolute rounded-[3px] pointer-events-none" style={{ top: b.top, height: Math.max(b.height, 12), left: 6, right: 6, background: note ? "rgba(26,26,46,0.18)" : PIN_COLORS[c.place!.type], opacity: 0.55 }} />
                      );
                      const wide = focusIdx === di;
                      const noEnd = b.endMin === null;
                      const t = cardTimes(c);
                      const short = b.height < 34;
                      const isGhost = ghost?.id === c.id;
                      const laneW = 100 / b.lanes;
                      return (
                        <div
                          key={c.id}
                          onPointerDown={(e) => onBlockPointerDown(e, c, day.id)}
                          onPointerEnter={() => setHoveredId(c.id)}
                          onPointerLeave={() => setHoveredId((h) => (h === c.id ? null : h))}
                          className={`absolute rounded-[6px] overflow-hidden cursor-grab ${pickedBlocks.has(c.id) ? "ring-2 ring-[#1A1A2E]" : selectedCard?.id === c.id || hoveredId === c.id ? "ring-1 ring-[#B0541F]" : ""}`}
                          style={{
                            top: b.top, height: b.height,
                            left: `calc(${b.lane * laneW}% + 3px)`, width: `calc(${laneW}% - 6px)`,
                            background: note ? "#F3EFE4" : "#FFFFFF",
                            border: `1px ${noEnd ? "dashed" : "solid"} rgba(26,26,46,0.10)`,
                            // The pin's colour on the edge and its glyph before the
                            // name (Brennan, 25 Sep 2026): three colours the map
                            // already taught, so a glance says food, sight, transit.
                            borderLeft: `3px solid ${note ? "rgba(26,26,46,0.4)" : PIN_COLORS[c.place!.type]}`,
                            boxShadow: isGhost ? "0 10px 24px rgba(26,26,46,0.22)" : "0 1px 2px rgba(26,26,46,0.05)",
                            opacity: isGhost ? 0.9 : 1, zIndex: isGhost ? 6 : 1,
                            padding: short ? "2px 6px" : "4px 6px",
                          }}
                        >
                          <div onPointerDown={(e) => onStartHandlePointerDown(e, c)} className="absolute left-0 right-0 top-0 h-[6px] cursor-ns-resize" aria-label="Change the start time" />
                          <div className="text-[11px] font-medium leading-tight truncate pointer-events-none flex items-center gap-1">
                            {!note && <span className="inline-flex flex-shrink-0 opacity-70" dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(c.place!.sub_type, 12) }} />}
                            <span className="truncate">{blockTitle(c, day.date)}</span>
                          </div>
                          {!short && (
                            <div className="text-[9.5px] text-activity/60 truncate tabular-nums pointer-events-none">
                              {isGhost && ghost?.min !== null && ghost ? fmt12(ghost.min) : t.start ? fmt12(toMin(t.start)) : ""}
                              {isGhost && ghost?.endMin != null ? ` – ${fmt12(ghost.endMin)}` : t.end ? ` – ${fmt12(toMin(t.end))}` : " · no end yet"}
                            </div>
                          )}
                          {wide && !short && (c.place?.address || noteLine(c)) && (
                            <div className="text-[10.5px] text-activity/60 truncate pointer-events-none mt-px">
                              {c.place?.address ? shortAddress(c.place.address) : noteLine(c)}
                              {c.place?.rating ? <span style={{ color: "#B45309" }}> · ★ {c.place.rating}</span> : null}
                            </div>
                          )}
                          {wide && b.height >= 70 && c.place && noteLine(c) && (
                            <div className="text-[10.5px] text-activity/80 leading-snug pointer-events-none mt-0.5 line-clamp-2">{noteLine(c)}</div>
                          )}
                          {c.confirmed && <span className="absolute right-1.5 top-1 text-[9px] font-bold pointer-events-none" style={{ color: "#2F7A46" }}>✓</span>}
                          <div onPointerDown={(e) => onHandlePointerDown(e, c)} className="absolute left-0 right-0 bottom-0 h-[7px] cursor-ns-resize" aria-label="Change the end time">
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-[2px] w-[22px] h-[2px] rounded" style={{ background: "rgba(26,26,46,0.10)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The map. 380px from lg, 440px from xl; below lg the week stands alone
          and the Map tab still has the full map. */}
      {/* the seam: a 4px grip, ink while held */}
      {!mapWide && (
        <div
          onPointerDown={onSeamPointerDown}
          className="hidden lg:flex w-[10px] -mx-[5px] relative z-10 cursor-col-resize items-center justify-center flex-shrink-0"
          aria-label="Drag to resize the map"
          role="separator"
          aria-orientation="vertical"
        >
          <span className="w-1 h-9 rounded-sm transition-colors" style={{ background: seamHot ? "#1A1A2E" : "rgba(26,26,46,0.18)" }} />
        </div>
      )}
      <div ref={mapPanelRef} className={mapWide ? "block flex-1 min-w-0 h-full" : "hidden lg:block flex-shrink-0 h-full"} style={mapWide ? undefined : { width: mapWidth }}>
        <WeekMap
          onPinDragStart={onPinDragStart}
          hot={overMap}
          wide={mapWide}
          onToggleWide={() => setMapWide((w) => !w)}
          onPutMany={putMany}
          onClusterDragStart={onClusterDragStart}
          selectionEpoch={selectionEpoch}
          showStays={showStays}
          onCloseStays={closeStays}
          onStaysChanged={() => router.refresh()}
          trip={trip}
          days={days}
          cards={pinCards}
          hoveredId={hoveredId}
          activeDayId={mapDayId}
          onHover={setHoveredId}
          onCardUpdate={mapCardUpdate}
          onCardCreated={mapCardCreated}
          onCardDelete={mapCardDelete}
          onDraftCreated={draftCreated}
        />
      </div>

      {recentPlan && recentPlan.length > 0 && pickedBlocks.size === 0 && !mapWide && (
        <div data-plan-tray className="absolute left-1/2 -translate-x-1/2 z-[40] bg-white rounded-full flex items-center gap-1.5 pl-4 pr-1.5 py-1.5" style={{ bottom: 20, boxShadow: "0 8px 24px rgba(26,26,46,0.18)", marginLeft: -(mapWidth / 2) }}>
          <span className="text-[13px] font-semibold whitespace-nowrap mr-1">Planned {recentPlan.length} {recentPlan.length === 1 ? "place" : "places"} on {new Set(recentPlan.map((c) => c.day_id)).size} days</span>
          {/* The plan's bases are Where to stay's bases (same 100 km rule, nights from the planned days). */}
          <button onClick={() => { setShowStays(true); setMapWide(true); }} className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap" style={{ background: "rgba(26,26,46,0.06)" }}>Where to stay</button>
          <button onClick={() => void undoPlan()} className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap text-[#B0541F]" style={{ background: "rgba(176,84,31,0.08)" }}>Undo</button>
          <button onClick={() => setRecentPlan(null)} aria-label="Close" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
      {pickedBlocks.size > 0 && !mapWide && (
        <div className="absolute left-1/2 -translate-x-1/2 z-[40] bg-white rounded-full flex items-center gap-1.5 pl-4 pr-1.5 py-1.5" style={{ bottom: 20, boxShadow: "0 8px 24px rgba(26,26,46,0.18)", marginLeft: -(mapWidth / 2) }}>
          <span className="text-[13px] font-semibold whitespace-nowrap">{pickedBlocks.size} {pickedBlocks.size === 1 ? "block" : "blocks"}</span>
          {bulkMove ? (
            <div className="flex items-center gap-1 overflow-x-auto max-w-[420px]">
              {days.map((d) => (
                <button key={d.id} onClick={() => void bulkMoveTo(d)} className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap hover:bg-[#1A1A2E] hover:text-white transition-colors" style={{ background: "rgba(26,26,46,0.06)" }}>{dow(d.date)} {new Date(d.date + "T00:00:00").getDate()}</button>
              ))}
            </div>
          ) : (
            <>
              <button onClick={() => setBulkMove(true)} className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap" style={{ background: "rgba(26,26,46,0.06)" }}>Move to a day</button>
              <button onClick={() => void bulkTakeOff()} className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap" style={{ background: "rgba(26,26,46,0.06)" }}>Take off the day</button>
              <button onClick={() => void bulkDelete()} className="h-8 px-3 rounded-full text-[12.5px] font-medium whitespace-nowrap text-[#B0541F]" style={{ background: "rgba(176,84,31,0.08)" }}>Delete</button>
            </>
          )}
          <button onClick={() => { setPickedBlocks(new Set()); setBulkMove(false); }} aria-label="Clear the selection" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 hover:bg-gray-200">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#1A1A2E" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
      {dragChip && (
        <div
          className="fixed z-[90] pointer-events-none rounded-[6px] bg-white px-2.5 py-1.5 text-[12px] font-medium max-w-[220px] truncate"
          style={{ left: dragChip.x + 14, top: dragChip.y + 10, border: "1px solid rgba(26,26,46,0.10)", borderLeft: "3px solid #1A1A2E", boxShadow: "0 10px 24px rgba(26,26,46,0.22)" }}
        >
          {dragChip.title}
        </div>
      )}
      {selectedCard && (
        <CardBottomSheet
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onCardUpdate={handleCardUpdate}
          onCardDelete={handleCardDelete}
          onCardCopied={handleCardCopied}
          days={days}
          tripDestination={trip.destination}
          stayCheckOut={runs.find((r) => r.placeId === selectedCard.place_id)?.checkOut ?? null}
        />
      )}
      {showDocs && <DocumentsSheet tripId={trip.id} onClose={() => setShowDocs(false)} onImport={() => { setShowDocs(false); upload.pick(); }} />}
      {upload.element}
    </div>
  );
}
