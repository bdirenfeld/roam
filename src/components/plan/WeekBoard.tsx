"use client";

/**
 * The desktop Plan as a week (24 Sep 2026): days across, hours down, every
 * timed card a block at its time, untimed cards in an Anytime lane above the
 * grid. Drag a block sideways to change its day, up and down to change its
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
import type { Trip, DayWithCards, Card } from "@/types/database";
import { queuedUpdate, queuedInsert, queuedDelete } from "@/lib/offline/queuedWrite";
import { createClient } from "@/lib/supabase/client";
import { scheduleCardOnDay, unscheduleCard } from "@/lib/scheduleCard";
import { useToast } from "@/components/ui/Toast";
import { cardTimes } from "@/lib/cardTime";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import WeekMap from "./WeekMap";
import {
  placeBlocks, movedTimes, resizedEnd, minutesAtY, toMin, toTime, fmt12, gridHeight,
  HOUR_START, HOUR_END, PX_PER_HOUR, NO_END_MIN, type Block,
} from "@/lib/week/layout";

interface Props {
  trip: Trip;
  initialDays: DayWithCards[];
  /** Dayless saved places: hollow pins on the map, nothing on the grid. */
  initialSaved: Card[];
}

const COL_MIN = 168;   // px — seven days fit beside a 440px map at 1440; more scroll sideways
const HOURS_W = 52;

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

type Drag =
  | { kind: "move"; card: Card; fromDay: string; x0: number; y0: number; offY: number; moved: boolean }
  | { kind: "fromMap"; card: Card; x0: number; y0: number; offY: number; moved: boolean }
  | { kind: "resize"; card: Card; y0: number; end0: number; moved: boolean };

export default function WeekBoard({ trip, initialDays, initialSaved }: Props) {
  const { toast } = useToast();
  const [days, setDays] = useState<DayWithCards[]>(initialDays);
  const daysRef = useRef(days); daysRef.current = days;
  const [saved, setSaved] = useState<Card[]>(initialSaved);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  // A block dragged over the map: the panel tints, and the drop takes the
  // card off its day (the Map tab's unschedule, so a saved pin remains).
  const [overMap, setOverMap] = useState(false);
  // The map can take the whole page (the week folds away) and come back.
  const [mapWide, setMapWide] = useState(false);
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

  // Seven days at a time (Brennan, 25 Sep 2026: "you're never scrolling,
  // you're just picking the week"). Longer journeys page with the arrows in
  // the cell above the hours; a 7-day journey shows no arrows at all.
  const [weekStart, setWeekStart] = useState(0);
  const shown = useMemo(() => days.slice(weekStart, weekStart + 7), [days, weekStart]);
  const shownRef = useRef(shown); shownRef.current = shown;
  const weeks = Math.max(1, Math.ceil(days.length / 7));
  const weekIdx = Math.floor(weekStart / 7);
  const nDays = shown.length;
  const minWidth = HOURS_W + nDays * COL_MIN;

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
  // The column container is display:contents (no box), so measure the grid
  // itself and skip the hours gutter. Verified the hard way, 24 Sep 2026.
  function dayAtX(clientX: number): number | null {
    const cols = colsRef.current; if (!cols) return null;
    const r = cols.getBoundingClientRect();
    const left = r.left + HOURS_W;
    if (clientX < left || clientX > r.right) return null;
    const w = (r.width - HOURS_W) / nDays;
    return Math.min(nDays - 1, Math.floor((clientX - left) / w));
  }
  function minAtY(clientY: number): number | null {
    const g = gridRef.current; if (!g) return null;
    const r = g.getBoundingClientRect();
    if (clientY < r.top || clientY > r.bottom) return null;
    return minutesAtY(clientY - r.top + g.scrollTop);
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
    const el = e.currentTarget as HTMLElement;
    dragRef.current = { kind: "move", card, fromDay, x0: e.clientX, y0: e.clientY, offY: e.clientY - el.getBoundingClientRect().top, moved: false };
    e.preventDefault();
  };
  const onPinDragStart = useCallback((card: Card) => {
    // Position is read from the first pointermove (the map's event is not a React one).
    dragRef.current = { kind: "fromMap", card, x0: NaN, y0: NaN, offY: 0, moved: false };
  }, []);
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
      if (d.kind === "fromMap" && Number.isNaN(d.x0)) { d.x0 = e.clientX; d.y0 = e.clientY; return; }
      if (!d.moved) {
        const dist = d.kind !== "resize" ? Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) : Math.abs(e.clientY - d.y0);
        if (dist < 4) return;
        d.moved = true;
      }
      if (d.kind === "move" || d.kind === "fromMap") {
        const t = cardTimes(d.card);
        const dur = t.start && t.end ? toMin(t.end) - toMin(t.start) : null;
        if (d.kind === "move" && overMapPanel(e.clientX, e.clientY)) {
          setOverMap(true); setGhost(null); setHover(null);
          return;
        }
        setOverMap(false);
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
      } else {
        const g = gridRef.current; if (!g) return;
        const r = g.getBoundingClientRect();
        const endMin = Math.max(toMin(cardTimes(d.card).start ?? "07:00:00") + 30, minutesAtY(e.clientY - r.top + g.scrollTop));
        const dayIdx = shownRef.current.findIndex((x) => x.id === d.card.day_id);
        setGhost({ id: d.card.id, day: dayIdx, min: toMin(cardTimes(d.card).start ?? "07:00:00"), endMin });
      }
    }
    function onUp(e: PointerEvent) {
      const d = dragRef.current; dragRef.current = null;
      const g = ghost; setGhost(null); setHover(null);
      const wasOverMap = overMap; setOverMap(false);
      if (!d) return;
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
      if (d.kind === "move" && g) {
        const target = dayList[g.day];
        if (g.min === null) {
          if (d.card.start_time === null && d.card.day_id === target.id) return;
          void write(d.card, { day_id: target.id, start_time: null, end_time: null }, `Put on ${dow(target.date)}, anytime`);
          return;
        }
        const t = cardTimes(d.card);
        const block: Block = { id: d.card.id, startMin: t.start ? toMin(t.start) : g.min, endMin: t.end ? toMin(t.end) : null };
        const times = movedTimes(block, g.min);
        if (target.id === d.card.day_id && times.start === d.card.start_time) return;
        void write(d.card, { day_id: target.id, start_time: times.start, end_time: times.end }, `Moved to ${dow(target.date)} ${fmt12(toMin(times.start))}`);
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

  // ── the map drops ──────────────────────────────────────────────
  // Pin → week: a new scheduled card at the drop time (an hour long, or no
  // time in the Anytime lane); the saved pin stays, as on the Map tab. Undo
  // deletes the new card.
  const putFromMap = useCallback(async (card: Card, target: DayWithCards, min: number | null) => {
    if (!card.place_id) return;
    const startTime = min === null ? null : toTime(min);
    const endTime = min === null ? null : toTime(Math.min(min + 60, HOUR_END * 60));
    const created = await scheduleCardOnDay(supabase, { tripId: trip.id, dayId: target.id, placeId: card.place_id, place: card.place, startTime, endTime, details: card.details, sourceUrl: card.source_url });
    if (!created) { toast({ message: "Couldn't put it on that day. Try again." }); return; }
    setDays((prev) => prev.map((d) => (d.id === target.id ? { ...d, cards: [...d.cards, created] } : d)));
    toast({
      message: min === null ? `Put on ${dow(target.date)}, anytime` : `Put on ${dow(target.date)} ${fmt12(min)}`,
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
  }, []);
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

  const hours: number[] = []; for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);
  const gridStyle = { gridTemplateColumns: `${HOURS_W}px repeat(${nDays}, minmax(${COL_MIN}px, 1fr))` } as const;

  return (
    <div className="flex h-[calc(100dvh-64px)] bg-[#F5F4F1] select-none">
      <div className={`flex-1 min-w-0 overflow-x-auto ${mapWide ? "hidden" : ""}`}>
        <div className="flex flex-col h-full" style={{ minWidth: minWidth }}>
          {/* day headers */}
          <div className="grid border-b bg-white flex-shrink-0" style={{ ...gridStyle, borderColor: "rgba(26,26,46,0.10)" }}>
            <div className="flex items-center justify-center gap-0.5">
              {weeks > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setWeekStart((w) => Math.max(0, w - 7))}
                    disabled={weekIdx === 0}
                    aria-label="Previous week"
                    title={`Week ${weekIdx} of ${weeks}`}
                    className="w-5 h-5 rounded-full flex items-center justify-center disabled:opacity-25 hover:bg-[rgba(26,26,46,0.06)]"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekStart((w) => Math.min((weeks - 1) * 7, w + 7))}
                    disabled={weekIdx === weeks - 1}
                    aria-label="Next week"
                    title={`Week ${weekIdx + 2} of ${weeks}`}
                    className="w-5 h-5 rounded-full flex items-center justify-center disabled:opacity-25 hover:bg-[rgba(26,26,46,0.06)]"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </>
              )}
            </div>
            {shown.map((d) => (
              <div
                key={d.id}
                onClick={() => setActiveDayId((cur) => (cur === d.id ? null : d.id))}
                className="px-2 py-2 border-l min-w-0 cursor-pointer transition-colors"
                title={activeDayId === d.id ? "Show every day on the map" : "Show only this day on the map"}
                style={{ borderColor: "rgba(26,26,46,0.10)", background: activeDayId === d.id ? "#F3EFE4" : undefined, opacity: activeDayId && activeDayId !== d.id ? 0.55 : 1 }}
              >
                <div className="text-[13px] font-semibold leading-tight">{dow(d.date)}<span className="ml-1.5 text-[11px] font-medium text-activity/40">{dayLabel(d.date)}</span></div>
                <div className="text-[10.5px] text-activity/60 truncate mt-0.5">{d.theme ?? d.day_name ?? " "}</div>
              </div>
            ))}
          </div>
          {/* anytime lane */}
          <div ref={laneRef} className="grid border-b flex-shrink-0" style={{ ...gridStyle, borderColor: "rgba(26,26,46,0.10)", minHeight: 38 }}>
            <div className="text-[9px] text-activity/40 text-right pr-1.5 pt-3 uppercase tracking-[0.06em]">Anytime</div>
            {laidOut.map(({ day, untimed }, di) => (
              <div key={day.id} className="border-l px-[3px] py-[5px] flex flex-wrap gap-[3px] content-start min-w-0 transition-colors" style={{ borderColor: "rgba(26,26,46,0.10)", background: hover && hover.day === di && hover.min === null ? "rgba(26,26,46,0.05)" : undefined }}>
                {untimed.map((c) => (
                  <div
                    key={c.id}
                    onPointerDown={(e) => onBlockPointerDown(e, c, day.id)}
                    onPointerEnter={() => setHoveredId(c.id)}
                    onPointerLeave={() => setHoveredId((h) => (h === c.id ? null : h))}
                    className="text-[10px] font-medium bg-white rounded-[5px] px-1.5 py-[3px] truncate max-w-full cursor-grab"
                    style={{ border: "1px solid rgba(26,26,46,0.10)", borderLeft: `3px solid ${isNote(c) ? "rgba(26,26,46,0.4)" : "#1A1A2E"}`, opacity: ghost?.id === c.id ? 0.6 : 1 }}
                    title={cardTitle(c)}
                  >{cardTitle(c)}</div>
                ))}
              </div>
            ))}
          </div>
          {/* the hours */}
          <div ref={gridRef} className="relative flex-1 min-h-0 overflow-y-auto">
            <div ref={colsRef} className="grid relative" style={{ ...gridStyle, height: gridHeight() }}>
              <div className="relative">
                {hours.map((h) => (
                  <div key={h} className="absolute right-1.5 text-[10px] text-activity/40 tabular-nums" style={{ top: (h - HOUR_START) * PX_PER_HOUR - 6 }}>{h % 12 || 12}{h < 12 ? " am" : " pm"}</div>
                ))}
              </div>
              <div className="contents">
                {laidOut.map(({ day, placed }, di) => (
                  <div key={day.id} className="relative border-l min-w-0 transition-colors" style={{ borderColor: "rgba(26,26,46,0.10)", background: hover && hover.day === di && hover.min !== null ? "rgba(26,26,46,0.04)" : undefined }}>
                    {hours.map((h) => (
                      <div key={h} className="absolute left-0 right-0" style={{ top: (h - HOUR_START) * PX_PER_HOUR, borderTop: "1px solid rgba(26,26,46,0.06)" }} />
                    ))}
                    {placed.map((b) => {
                      const c = byId.get(b.id); if (!c) return null;
                      const note = isNote(c);
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
                          className={`absolute rounded-[6px] overflow-hidden cursor-grab ${selectedCard?.id === c.id || hoveredId === c.id ? "ring-1 ring-[#B0541F]" : ""}`}
                          style={{
                            top: b.top, height: b.height,
                            left: `calc(${b.lane * laneW}% + 3px)`, width: `calc(${laneW}% - 6px)`,
                            background: note ? "#F3EFE4" : "#FFFFFF",
                            border: `1px ${noEnd ? "dashed" : "solid"} rgba(26,26,46,0.10)`,
                            borderLeft: `3px solid ${note ? "rgba(26,26,46,0.4)" : "#1A1A2E"}`,
                            boxShadow: isGhost ? "0 10px 24px rgba(26,26,46,0.22)" : "0 1px 2px rgba(26,26,46,0.05)",
                            opacity: isGhost ? 0.9 : 1, zIndex: isGhost ? 6 : 1,
                            padding: short ? "2px 6px" : "4px 6px",
                          }}
                        >
                          <div className="text-[11px] font-medium leading-tight truncate pointer-events-none">{cardTitle(c)}</div>
                          {!short && (
                            <div className="text-[9.5px] text-activity/60 truncate tabular-nums pointer-events-none">
                              {isGhost && ghost?.min !== null && ghost ? fmt12(ghost.min) : t.start ? fmt12(toMin(t.start)) : ""}
                              {isGhost && ghost?.endMin != null ? ` – ${fmt12(ghost.endMin)}` : t.end ? ` – ${fmt12(toMin(t.end))}` : " · no end yet"}
                            </div>
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
      <div ref={mapPanelRef} className={mapWide ? "block flex-1 min-w-0 h-full" : "hidden lg:block w-[380px] xl:w-[440px] flex-shrink-0 h-full"}>
        <WeekMap
          onPinDragStart={onPinDragStart}
          hot={overMap}
          wide={mapWide}
          onToggleWide={() => setMapWide((w) => !w)}
          trip={trip}
          days={days}
          cards={pinCards}
          hoveredId={hoveredId}
          activeDayId={activeDayId}
          onHover={setHoveredId}
          onCardUpdate={mapCardUpdate}
          onCardCreated={mapCardCreated}
          onCardDelete={mapCardDelete}
        />
      </div>

      {selectedCard && (
        <CardBottomSheet
          card={selectedCard}
          onClose={() => setSelectedCard(null)}
          onCardUpdate={handleCardUpdate}
          onCardDelete={handleCardDelete}
          onCardCopied={handleCardCopied}
          days={days}
          tripDestination={trip.destination}
        />
      )}
    </div>
  );
}
