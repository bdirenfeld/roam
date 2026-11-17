"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { Card, CardStatus, DayWithCards, Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { queuedInsert, queuedUpdate } from "@/lib/offline/queuedWrite";
import { expandAll } from "@/lib/confirmations/agenda";
import { confirmationDetails, closingDetails, closingEvent, openingTitle, type ParsedConfirmation } from "@/lib/confirmations/toCards";
import { resolvePlace } from "@/lib/confirmations/resolvePlace";
import { bookingOutside, dayFor, shortDay } from "@/lib/confirmations/outsideDates";
import { extendJourney } from "@/lib/confirmations/extendJourney";
import { whenLine, type FileRef } from "@/lib/confirmations/batch";
import { existingFor, fillFrom, type DayCard } from "@/lib/confirmations/fillPlaceholder";
import { blankBooking, flightTitle, flightAirport, type HandKind } from "@/lib/confirmations/byHand";
import StayDatesSheet, { dayLabel } from "@/components/cards/StayDatesSheet";

// ── ParsedConfirmation — matches API response (lib/confirmations/toCards) ──
export type { ParsedConfirmation };


interface Props {
  items:           ParsedConfirmation[];
  fileName:        string;
  fileType:        string;
  days:            DayWithCards[];
  tripId:          string;
  onClose:         () => void;
  /** docIds: the documents rows written with them, so an Undo can take those back too. */
  onCardsCreated:  (cards: Card[], deletedIds: string[], docIds?: string[], count?: number) => void;
  /** Several files read at once (6 Oct 2026, taps audit): each booking's file, by index into `files`. */
  files?:          FileRef[];
  fileOf?:         number[];
  /** Files that could not be read, each listed with a short reason. */
  failures?:       { name: string; reason: string }[];
  /** Replaces "Confirmation parsed" — e.g. the rest of an attached package. */
  heading?:        string;
  /** After "Extend the trip": the host's days are stale. Default reloads the page once the sheet is done. */
  onDaysChanged?:  () => void;
  /** A file that could not be read at all (17 Nov 2026): the sheet opens empty under "Your bookings", naming it in one grey line. */
  failedFile?:     string | null;
}

const TYPE_LABEL: Record<string, string> = {
  flight_arrival:   "Outbound Flight",
  flight_departure: "Return Flight",
  hotel:            "Hotel",
  car_rental:       "Rental car",
  cruise:           "Cruise",
  restaurant:       "Restaurant",
  activity:         "Activity",
};

/** Adding by hand (17 Nov 2026): the four buttons, and each row's words. */
const HAND_KINDS: { kind: HandKind; label: string }[] = [
  { kind: "flight", label: "Flight" }, { kind: "hotel", label: "Hotel" }, { kind: "car", label: "Car" }, { kind: "cruise", label: "Cruise" },
];
const HAND_LABEL: Record<string, string> = { flight_arrival: "Flight", flight_departure: "Flight", hotel: "Hotel", car_rental: "Car", cruise: "Cruise" };
const TITLE_LABEL: Record<string, string> = { hotel: "Hotel", car_rental: "Pick up at", cruise: "Ship" };

// A booking's day: its own date, else the nearest first or last day (3 Oct
// 2026). It used to fall back to Day 1 for anything it could not find, so a
// flight home the day after the end landed on the first morning.
function findMatchingDay(days: DayWithCards[], date: string | null | undefined): string | null {
  return dayFor(days, date)?.id ?? null;
}

function fmtDate(dateStr: string): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

// ── Per-item editable state ───────────────────────────────────
interface ItemDraft {
  title:   string;
  dayId:   string;
  time:    string;
  endTime: string;
  address: string;
  notes:   string;
  /** Hotels: the day you leave ("" = none). */
  outDayId: string;
}

export default function ConfirmationPreviewSheet({
  items: rawItems, fileName, fileType, days: hostDays, tripId, onClose: hostClose, onCardsCreated: hostCreated, heading, onDaysChanged,
  files, fileOf: rawFileOf, failures = [], failedFile = null,
}: Props) {
  // A conference with an agenda becomes one booking per event day, each with
  // that day's times and schedule (6 Oct 2026, "conference agenda", approved).
  const { items, fileOf } = useMemo(() => expandAll(rawItems, rawFileOf), [rawItems, rawFileOf]);
  // Several bookings (6 Oct 2026, taps audit): one compact row each, its own
  // fields behind Edit, so five bookings read as a list rather than a form.
  // Bookings added by hand (17 Nov 2026, approved flow): Flight / Hotel / Car /
  // Cruise each add a row after what the file gave, several of each. A removed
  // row keeps its index (drafts stay aligned) and is skipped everywhere.
  const [added, setAdded] = useState<ParsedConfirmation[]>([]);
  // Edits to a booking's own fields (a hand flight's number, a hotel's check-out time), by row.
  const [over, setOver] = useState<Record<number, Partial<ParsedConfirmation>>>({});
  const all = useMemo(() => [...items, ...added].map((p, i) => (over[i] ? { ...p, ...over[i] } : p)), [items, added, over]);
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());
  const kept = all.map((_, i) => i).filter((i) => !removed.has(i));
  const isAdded = (idx: number) => idx >= items.length;
  const compact = all.length > 1 || items.length === 0;
  const manyFiles = (files?.length ?? 1) > 1;
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set());
  const toggleRow = (idx: number) => setOpenRows((prev) => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
  // The journey's days, widened in place when "Extend the trip" is tapped.
  const [days, setDays] = useState<DayWithCards[]>(hostDays);
  const extended = useRef(false);
  const daysChanged = useCallback(() => {
    if (!extended.current) return;
    if (onDaysChanged) onDaysChanged(); else window.location.reload();
  }, [onDaysChanged]);
  const onClose = useCallback(() => { hostClose(); daysChanged(); }, [hostClose, daysChanged]);
  const onCardsCreated = useCallback((cards: Card[], deletedIds: string[], docIds?: string[], count?: number) => { hostCreated(cards, deletedIds, docIds, count); daysChanged(); }, [hostCreated, daysChanged]);
  const sorted = [...days].filter((d) => d.date).sort((a, b) => a.date.localeCompare(b.date));
  const tripStart = sorted[0]?.date ?? null;
  const tripEnd = sorted[sorted.length - 1]?.date ?? null;
  const [extending, setExtending] = useState<number | null>(null);
  const [extendError, setExtendError] = useState<{ idx: number; text: string } | null>(null);
  const [extendedTo, setExtendedTo] = useState<string | null>(null);
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY    = useRef(0);
  const dragging = useRef(false);

  // Shared confirmation number (usually same for round-trip)
  const [confNo, setConfNo] = useState(items[0]?.confirmation_number ?? "");

  // One draft per parsed item
  const draftFor = (p: ParsedConfirmation): ItemDraft => ({
    title:   p.title ?? "",
    dayId:   findMatchingDay(days, p.date) ?? (days[0]?.id ?? ""),
    time:    p.time ?? "",
    endTime: p.end_time ?? "",
    address: p.address ?? "",
    notes:   p.notes ?? "",
    outDayId: p.type === "hotel" || p.type === "cruise" ? (findMatchingDay(days, p.check_out_date ?? null) ?? "") : p.type === "car_rental" ? (findMatchingDay(days, p.drop_off_date ?? null) ?? "") : "",
  });
  const [drafts, setDrafts] = useState<ItemDraft[]>(() => items.map(draftFor));
  const addBooking = (kind: HandKind) => {
    const p = blankBooking(kind, kept.map((i) => all[i]), tripStart ?? "", tripEnd ?? "");
    const idx = all.length;
    setAdded((a) => [...a, p]);
    setDrafts((d) => [...d, draftFor(p)]);
    setOpenRows((o) => new Set(o).add(idx));
  };
  const removeBooking = (idx: number) => setRemoved((r) => new Set(r).add(idx));
  const [stayFor, setStayFor] = useState<number | null>(null);
  // A hand-added flight is filled as number, from and to; its title and airport follow.
  const patchFlight = (idx: number, patch: Partial<ParsedConfirmation>) => {
    const p = { ...all[idx], ...patch };
    setOver((o) => ({ ...o, [idx]: { ...o[idx], ...patch } }));
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, title: flightTitle(p), address: flightAirport(p) ?? "" } : d)));
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const extend = async (idx: number, start: string, end: string) => {
    if (extending !== null) return;
    setExtending(idx);
    setExtendError(null);
    const out = await extendJourney(supabase, tripId, start, end);
    setExtending(null);
    if ("error" in out) { setExtendError({ idx, text: out.error }); return; }
    extended.current = true;
    const next = out.days.map((d) => ({ ...(days.find((x) => x.id === d.id) ?? { cards: [] as Card[] }), ...d })) as DayWithCards[];
    setDays(next);
    setDrafts((prev) => prev.map((dr, i) => {
      const p = items[i];
      const own = next.find((d) => d.date === p.date)?.id;
      const outDate = p.type === "hotel" ? p.check_out_date : p.type === "car_rental" ? p.drop_off_date : null;
      const out = outDate ? next.find((d) => d.date === outDate)?.id : undefined;
      return { ...dr, ...(own ? { dayId: own } : {}), ...(out ? { outDayId: out } : {}) };
    }));
    setExtendedTo(`${shortDay(start)} – ${shortDay(end)}`);
  };

  const patchDraft = (idx: number, patch: Partial<ItemDraft>) =>
    setDrafts((prev) => prev.map((d, i) => i === idx ? { ...d, ...patch } : d));

  // ── Scroll lock ──────────────────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // ── Drag-to-dismiss ──────────────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current = e.touches[0].clientY; dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    sheetRef.current.style.transform  = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;
    const dy = e.changedTouches[0].clientY - dragY.current;
    if (dy > 120) {
      sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.transform  = "translateY(100%)";
      setTimeout(onClose, 240);
    } else {
      sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
      sheetRef.current.style.transform  = "translateY(0)";
    }
  }, [onClose]);

  // ── Save all cards ───────────────────────────────────────────
  // All the cards from one confirmation go in ONE insert, so they land
  // together or not at all. It used to insert them one by one, log a failure
  // to the console, and close the sheet as if everything had imported — a
  // round trip could come back as the outbound flight alone (audit, 23 Sep
  // 2026). queuedInsert also holds the write when the phone has no signal and
  // sends it when it's back, the same as every other add in Roam. Only a real
  // refusal keeps the sheet open, with everything still filled in.
  //
  // Gone too: a step that deleted template "skeleton" cards by title. Cards
  // have no title column, so that query failed on every import — and the day
  // template it cleaned up after was removed on 7 Sep 2026.
  const handleSave = useCallback(async () => {
    const canSave = kept.length > 0 && kept.every((i) => drafts[i].title.trim() && drafts[i].dayId);
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);

    // The stored session, not a network call: this has to work on a bad signal.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setSaving(false); setSaveError("You're signed out. Sign in and try again."); return; }

    // Each booking's real place, looked up together; a miss stays a note.
    // Looked up once per distinct place: a conference split into days asked
    // twice at once and the second came back empty, so Day 2 landed as a note
    // with no place (7 Oct 2026, his Irving summit).
    const lookups = new Map<string, Promise<Place | null>>();
    const places = await Promise.all(kept.map((i) => all[i]).map((p) => {
      const key = `${(p.title ?? "").trim().toLowerCase()}|${(p.address ?? "").trim().toLowerCase()}`;
      if (!lookups.has(key)) lookups.set(key, resolvePlace(p));
      return lookups.get(key)!;
    }));

    const nextPos = new Map<string, number>();
    const posOn = (dayId: string) => {
      const dayCards = days.find((d) => d.id === dayId)?.cards ?? [];
      const pos = nextPos.get(dayId) ?? dayCards.reduce((m, c) => Math.max(m, c.position), 0) + 1;
      nextPos.set(dayId, pos + 1);
      return pos;
    };
    const card = (dayId: string, start: string | null, end: string | null, details: Record<string, unknown>, place: Place | null): Card => ({
      id:           crypto.randomUUID(),
      day_id:       dayId,
      list_id:      null,
      trip_id:      tripId,
      start_time:   start,
      end_time:     end,
      position:     posOn(dayId),
      status:       "in_itinerary" as CardStatus,
      source_url:   null,
      details:      details as Card["details"],
      ai_generated: false,
      // Anything read from a confirmation is booked (6 Oct 2026, Brennan): check-in
      // AND check-out, both flights, pick-up and drop-off, every event day.
      confirmed:    true,
      created_at:   new Date().toISOString(),
      place_id:     place?.id ?? null,
      place,
    });
    const hhmm = (t: string) => (t.trim() ? `${t.trim().slice(0, 5)}:00` : null);
    // Which booking each card came from, so each file's documents row names its own cards.
    const cardItem: number[] = [];
    const createdCards: Card[] = kept.flatMap((i, n) => {
      const draft = drafts[i];
      const parsed = all[i];
      const place = places[n];
      // Several files: each booking keeps its own confirmation number; one shared box would stamp the first on all.
      // A hand-added booking has none to share (17 Nov 2026).
      const details = confirmationDetails(parsed, { title: openingTitle(parsed, draft.title.trim()), notes: draft.notes, confirmation: manyFiles || isAdded(i) ? (parsed.confirmation_number ?? "") : confNo });
      const twoPart = parsed.type === "hotel" || parsed.type === "car_rental" || parsed.type === "cruise";
      const outDay = twoPart ? days.find((d) => d.id === draft.outDayId) : undefined;
      if (outDay?.date && parsed.type !== "cruise") details[parsed.type === "hotel" ? "check_out" : "drop_off"] = outDay.date;
      const main = card(draft.dayId, hhmm(draft.time), twoPart ? null : hhmm(draft.endTime), details, place);
      // A stay is two events, check-in and check-out; a car, pick-up and drop-off.
      const close = outDay ? closingEvent({ ...parsed, check_out_date: outDay.date, drop_off_date: outDay.date }, parsed.type === "cruise" ? draft.title.trim() : place?.title ?? draft.title.trim()) : null;
      if (!outDay || !close) { cardItem.push(i); return [main]; }
      cardItem.push(i, i);
      return [main, card(outDay.id, close.time, null, closingDetails(details, close.title), place)];
    });

    // Already on the days (same day, same place): mark that card booked instead
    // of adding a second copy (6 Oct 2026). A placeholder that is not booked yet
    // (a copied journey's "to book" flight or hotel) takes the booking's times
    // and details; a flight matches by kind and airport whatever its number
    // (7 Oct 2026, lib/confirmations/fillPlaceholder). Booked cards keep only
    // a missing time filled, as before.
    const flipped: { id: string; patch: Record<string, unknown> }[] = [];
    const finalId = new Map<string, string>();
    const taken = new Set<string>();
    const fresh = createdCards.filter((c, k) => {
      if (!c.place_id) return true;
      const dayCards = (days.find((d) => d.id === c.day_id)?.cards ?? []).filter((x) => !taken.has(x.id)) as unknown as DayCard[];
      const there = existingFor({ ...c, details: c.details as Record<string, unknown> }, all[cardItem[k]].type, dayCards);
      if (!there) return true;
      taken.add(there.id);
      finalId.set(c.id, there.id);
      flipped.push({ id: there.id, patch: fillFrom(there, { ...c, details: c.details as Record<string, unknown> }).patch });
      return false;
    });
    for (const f of flipped) {
      const { error: flipError } = await queuedUpdate("cards", { id: f.id }, f.patch);
      if (flipError) console.error("[ConfirmationPreviewSheet] could not mark booked:", flipError);
    }

    // The columns the insert has always written — not the display-only fields.
    const rows = fresh.map((c) => ({
      id: c.id, day_id: c.day_id, trip_id: c.trip_id, start_time: c.start_time, end_time: c.end_time,
      position: c.position, status: c.status, source_url: null, details: c.details, ai_generated: false, place_id: c.place_id,
      confirmed: true,
    }));
    const { error } = rows.length ? await queuedInsert("cards", rows) : { error: null };
    if (error) {
      console.error("[ConfirmationPreviewSheet] import refused:", error);
      setSaving(false);
      setSaveError("Couldn't add these to the plan. Nothing was added — tap to try again.");
      return;
    }
    const deletedIds: string[] = [];

    // Save document record — best-effort, never blocks card creation.
    // One per file read (6 Oct 2026, taps audit): each names its own bookings and cards.
    const sources: FileRef[] = files?.length ? files : [{ name: fileName, type: fileType }];
    const docIds: string[] = [];
    for (let f = 0; f < sources.length; f++) {
      const mine = items.map((_, i) => i).filter((i) => !removed.has(i) && (fileOf?.[i] ?? 0) === f);
      if (!mine.length) continue;
      const first = items[mine[0]];
      const documentType = first?.type.startsWith("flight") ? "flight" : first?.type ?? "activity";
      const id = crypto.randomUUID();
      const { error: docError } = await queuedInsert("documents", {
        id,
        trip_id:       tripId,
        user_id:       user.id,
        file_name:     sources[f].name,
        file_type:     sources[f].type,
        document_type: documentType,
        parsed_data:   mine.map((i) => items[i]),
        card_ids:      createdCards.filter((_, k) => mine.includes(cardItem[k])).map((c) => finalId.get(c.id) ?? c.id),
      });
      if (docError) console.error("[ConfirmationPreviewSheet] Failed to save document record:", docError);
      else docIds.push(id);
    }

    setSaving(false);
    if (flipped.length) extended.current = true; // the host reloads its days, so the flipped cards show booked
    onCardsCreated(fresh, deletedIds, docIds, kept.length);
  }, [drafts, items, all, kept, removed, confNo, days, tripId, fileName, fileType, files, fileOf, manyFiles, saving, supabase, onCardsCreated]);

  // ── Derived ──────────────────────────────────────────────────
  const isRoundTrip = items.length === 2 && added.length === 0 && removed.size === 0 &&
    items[0].type === "flight_arrival" && items[1].type === "flight_departure";

  const sheetTitle = isRoundTrip && !manyFiles
    ? "Round-trip flight · out and back"
    : compact
      ? `${kept.length} ${kept.length === 1 ? "booking" : "bookings"}`
      : (TYPE_LABEL[items[0]?.type ?? "activity"] ?? "Confirmation");
  const readCount = (files?.length ?? 1) + failures.length;
  const eyebrow = heading ?? (readCount > 1 ? `${readCount} files read` : "Here’s what we read");

  const canSave = kept.length > 0 && kept.every((i) => drafts[i].title.trim() && drafts[i].dayId) && !saving;
  // Nothing was read (a file that failed, or "Add one yourself"): "Your bookings".
  const byHand = items.length === 0;

  return (
    <div
      className="fixed inset-0 z-60 flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-200" />

      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[92dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0 cursor-grab">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
          {byHand ? (
            <div className="min-w-0">
              <h3 className="text-[20px] font-semibold text-gray-900">Your bookings</h3>
              {failedFile && <p data-testid="failed-file" className="text-[13px] text-gray-500 truncate">We couldn&apos;t read {failedFile}</p>}
            </div>
          ) : (
          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">
              {eyebrow}
            </p>
            <h3 className="text-[16px] font-bold text-gray-900">{sheetTitle}</h3>
          </div>
          )}
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-28">

          {/* One section per parsed item; several are compact rows (6 Oct 2026, taps audit). */}
          {kept.length === 0 && (
            <p data-testid="nothing-yet" className="text-center text-[14.5px] text-gray-400 pt-8 pb-4">Nothing added yet</p>
          )}
          {all.map((parsed, idx) => {
            if (removed.has(idx)) return null;
            const draft = drafts[idx];
            const handFlight = isAdded(idx) && parsed.type.startsWith("flight");
            const label = TYPE_LABEL[parsed.type] ?? "Booking";
            // A row that can't be saved as it stands opens itself.
            const open = !compact || openRows.has(idx) || !draft.title.trim() || !draft.dayId;
            const inDay = days.find((d) => d.id === draft.dayId);
            const outDay = days.find((d) => d.id === draft.outDayId);
            return (
              <div key={idx} data-testid="booking-row" className={idx > kept[0] ? "border-t border-gray-100" : ""}>
                {compact && (
                  <div className="flex items-start gap-3 px-5 pt-3.5 pb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-wide">{isAdded(idx) ? HAND_LABEL[parsed.type] ?? label : label}</p>
                      <p className="text-[14.5px] font-semibold text-gray-900 truncate">{draft.title.trim() || "Untitled booking"}</p>
                      <p className="text-[12.5px] text-gray-500 truncate">
                        {whenLine(parsed.type, { dayNumber: inDay?.day_number ?? null, date: inDay?.date ?? null, time: draft.time, endTime: draft.endTime, outDate: outDay?.date ?? null })}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRow(idx)}
                      aria-expanded={open}
                      aria-label={`${open ? "Done editing" : "Edit"} ${draft.title.trim() || label}`}
                      className="min-h-[44px] min-w-[44px] -my-2 -mr-2 px-2 text-[13px] text-gray-500 underline underline-offset-2"
                    >
                      {open ? "Done" : "Edit"}
                    </button>
                  </div>
                )}

                <div className={compact ? (open ? "px-5 pb-4 space-y-4" : "px-5") : "px-5 py-4 space-y-4"}>
                  {/* Dated outside the journey (3 Oct 2026): kept, on the nearest day, one plain line. */}
                  {(() => {
                    const note = bookingOutside(parsed, tripStart, tripEnd);
                    if (!note) return null;
                    return (
                      <div data-testid="outside-note">
                        <p className="text-[13px] leading-snug text-[#B0541F]">{note.line}</p>
                        <button
                          type="button"
                          onClick={() => void extend(idx, note.start, note.end)}
                          disabled={extending !== null}
                          className="mt-1 min-h-[36px] text-[13px] font-medium text-[#B0541F] underline underline-offset-2 disabled:opacity-50"
                        >
                          {extending === idx ? "Extending the trip…" : note.button}
                        </button>
                        {extendError?.idx === idx && <p className="text-[13px] text-gray-500">{extendError.text}</p>}
                      </div>
                    );
                  })()}
                  {extendedTo && idx === 0 && (
                    <p data-testid="extended-note" className="text-[13px] text-gray-500">The trip now runs {extendedTo}.</p>
                  )}

                  {open && (<>

                  {/* A hand-added flight: number, from, to (17 Nov 2026); the title and the airport follow. */}
                  {handFlight && (
                    <div className="space-y-3">
                      <div>
                        <label htmlFor={`conf-${idx}-flight`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Flight</label>
                        <input id={`conf-${idx}-flight`} type="text" value={parsed.flight_number ?? ""} placeholder="e.g. AC 890"
                          onChange={(e) => patchFlight(idx, { flight_number: e.target.value })}
                          className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white" />
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1 min-w-0">
                          <label htmlFor={`conf-${idx}-from`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">From</label>
                          <input id={`conf-${idx}-from`} type="text" value={parsed.origin_airport ?? ""} placeholder="Toronto YYZ"
                            onChange={(e) => patchFlight(idx, { origin_airport: e.target.value })}
                            className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label htmlFor={`conf-${idx}-to`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">To</label>
                          <input id={`conf-${idx}-to`} type="text" value={parsed.arriving_at ?? ""} placeholder="Reykjavík KEF"
                            onChange={(e) => patchFlight(idx, { arriving_at: e.target.value })}
                            className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Title */}
                  {!handFlight && <div>
                    <label htmlFor={`conf-${idx}-title`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {isAdded(idx) ? TITLE_LABEL[parsed.type] ?? "Title" : "Title"}
                    </label>
                    <input
                      type="text"
                      id={`conf-${idx}-title`}
                      value={draft.title}
                      onChange={(e) => patchDraft(idx, { title: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors"
                    />
                  </div>}

                  {/* A hotel's stay is one calendar (17 Nov 2026), the hotel picker on its card. */}
                  {parsed.type === "hotel" && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Stay</p>
                      <button type="button" onClick={() => setStayFor(idx)} data-testid="stay-dates-button"
                        className="w-full mt-1 px-3 py-2 text-left text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl">
                        {inDay?.date ? `${dayLabel(inDay.date)} → ${outDay?.date ? dayLabel(outDay.date) : "…"}` : "Pick the dates"}
                        {inDay?.date && outDay?.date ? ` · ${Math.round((Date.parse(outDay.date) - Date.parse(inDay.date)) / 86_400_000)} nights` : ""}
                      </button>
                    </div>
                  )}

                  {/* Day assignment */}
                  {parsed.type !== "hotel" && <div>
                    <label htmlFor={`conf-${idx}-day`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {parsed.type === "car_rental" ? "Pick up" : parsed.type === "cruise" ? "Board" : "Day"}
                      {parsed.date && !isAdded(idx) && (
                        <span className="ml-1 font-normal normal-case text-gray-400">
                          ({parsed.date})
                        </span>
                      )}
                    </label>
                    <select
                      id={`conf-${idx}-day`}
                      value={draft.dayId}
                      onChange={(e) => patchDraft(idx, { dayId: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 appearance-none"
                    >
                      {days.map((d) => (
                        <option key={d.id} value={d.id}>
                          Day {d.day_number}{d.date ? ` — ${fmtDate(d.date)}` : ""}
                          {d.day_name ? ` (${d.day_name})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>}

                  {/* The day you leave: a car's drop-off, a cruise's last morning. */}
                  {(parsed.type === "car_rental" || parsed.type === "cruise") && (
                    <div>
                      <label htmlFor={`conf-${idx}-out`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type === "cruise" ? "Leave the ship" : "Drop off"}
                        {!isAdded(idx) && (parsed.type === "cruise" ? parsed.check_out_date : parsed.drop_off_date) && (
                          <span className="ml-1 font-normal normal-case text-gray-400">({parsed.type === "cruise" ? parsed.check_out_date : parsed.drop_off_date})</span>
                        )}
                      </label>
                      <select
                        id={`conf-${idx}-out`}
                        value={draft.outDayId}
                        onChange={(e) => patchDraft(idx, { outDayId: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 appearance-none"
                      >
                        <option value="">After the trip&apos;s last day</option>
                        {days.filter((d) => d.date >= (days.find((x) => x.id === draft.dayId)?.date ?? "")).map((d) => (
                          <option key={d.id} value={d.id}>
                            Day {d.day_number}{d.date ? ` — ${fmtDate(d.date)}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Times (a hotel's are in its calendar) */}
                  {parsed.type !== "hotel" && <div className="flex gap-3">
                    <div className="flex-1">
                      <label htmlFor={`conf-${idx}-start`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type.startsWith("flight") ? "Departs" : parsed.type === "car_rental" ? "Pick-up time" : parsed.type === "cruise" ? "Boarding time" : "Start time"}
                      </label>
                      <input
                        type="time"
                        id={`conf-${idx}-start`}
                      value={draft.time}
                        onChange={(e) => patchDraft(idx, { time: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300"
                      />
                    </div>
                    {parsed.type !== "car_rental" && parsed.type !== "cruise" && <div className="flex-1">
                      <label htmlFor={`conf-${idx}-end`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type.startsWith("flight") ? "Arrives" : "End time"}
                      </label>
                      <input
                        type="time"
                        id={`conf-${idx}-end`}
                      value={draft.endTime}
                        onChange={(e) => patchDraft(idx, { endTime: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300"
                      />
                    </div>}
                  </div>}

                  {/* Address */}
                  {!handFlight && (draft.address || parsed.type !== "flight_arrival" && parsed.type !== "flight_departure") && (
                    <div>
                      <label htmlFor={`conf-${idx}-address`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type.startsWith("flight") ? "Airport" : parsed.type === "cruise" ? "Boarding port" : "Address / Venue"}
                      </label>
                      <input
                        type="text"
                        id={`conf-${idx}-address`}
                      value={draft.address}
                        onChange={(e) => patchDraft(idx, { address: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors"
                      />
                    </div>
                  )}

                  {/* Notes — flight number, seat, etc. */}
                  {(draft.notes || (parsed.type.startsWith("flight") && !handFlight)) && (
                    <div>
                      <label htmlFor={`conf-${idx}-notes`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Notes
                      </label>
                      <textarea
                        id={`conf-${idx}-notes`}
                      value={draft.notes}
                        onChange={(e) => patchDraft(idx, { notes: e.target.value })}
                        placeholder={parsed.type.startsWith("flight") ? "Flight number, seat, duration…" : "Notes…"}
                        rows={2}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-700 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors resize-none placeholder-gray-300"
                      />
                    </div>
                  )}
                  {compact && (
                    <div className="text-right">
                      <button type="button" onClick={() => removeBooking(idx)} className="min-h-[36px] text-[13px] text-gray-500 underline underline-offset-2">Remove</button>
                    </div>
                  )}
                  </>)}
                </div>
              </div>
            );
          })}

          {/* Add one by hand (17 Nov 2026): after a good read too, for anything it missed. */}
          <div className="px-5 pt-3 pb-1 grid grid-cols-4 gap-2" data-testid="add-by-hand">
            {HAND_KINDS.map((k) => (
              <button key={k.kind} type="button" onClick={() => addBooking(k.kind)} aria-label={`Add a ${k.label.toLowerCase()}`}
                className="h-10 rounded-full text-[14px] font-medium flex items-center justify-center gap-1"
                style={{ color: "#1A1A2E", boxShadow: "inset 0 0 0 1.5px rgba(26,26,46,0.16)" }}>
                <span aria-hidden="true">+</span>{k.label}
              </button>
            ))}
          </div>

          {/* A file that could not be read: named, with why. The rest still go on. */}
          {failures.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 space-y-1.5" data-testid="read-failures">
              {failures.map((f, i) => (
                <p key={i} className="text-[13px] leading-snug text-[#B0541F]">
                  <span className="font-medium">{f.name}</span> · {f.reason}
                </p>
              ))}
            </div>
          )}

          {/* Shared confirmation number: one file only; several keep their own. */}
          {!manyFiles && !byHand && <div className="px-5 pb-4 border-t border-gray-100 pt-4 space-y-4">
            <div>
              <label htmlFor="conf-number" className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Confirmation #
              </label>
              <input
                type="text"
                id="conf-number"
                value={confNo}
                onChange={(e) => setConfNo(e.target.value)}
                placeholder="e.g. B24EDV"
                className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors placeholder-gray-300"
              />
            </div>
          </div>}
        </div>

        {stayFor !== null && tripStart && tripEnd && (() => {
          const d = drafts[stayFor];
          const inDate = days.find((x) => x.id === d.dayId)?.date ?? tripStart;
          const outDate = days.find((x) => x.id === d.outDayId)?.date ?? null;
          const p = all[stayFor];
          return (
            <StayDatesSheet
              title={d.title.trim() || "Hotel"}
              tripStart={tripStart}
              tripEnd={tripEnd}
              initial={{ checkIn: inDate, checkOut: outDate, start: d.time || null, end: p.check_out_time ?? null }}
              otherNights={{}}
              onSave={(v) => {
                patchDraft(stayFor, { dayId: days.find((x) => x.date === v.checkIn)?.id ?? d.dayId, outDayId: v.checkOut ? days.find((x) => x.date === v.checkOut)?.id ?? "" : "", time: v.start ?? "" });
                setOver((o) => ({ ...o, [stayFor]: { ...o[stayFor], check_out_time: v.end, check_out_date: v.checkOut } }));
              }}
              onClose={() => setStayFor(null)}
            />
          );
        })()}

        {/* Save — sticky bottom */}
        <div className="absolute bottom-0 left-0 right-0 px-5 py-4 bg-white border-t border-gray-100">
          {saveError && (
            <p role="alert" className="text-[13px] mb-2.5 text-center" style={{ color: "#A8372B" }}>
              {saveError}
            </p>
          )}
          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`w-full py-3.5 rounded-xl text-[15px] font-bold transition-all ${
              canSave
                ? "bg-logistics text-white active:scale-[0.98] shadow-sm"
                : "bg-gray-100 text-gray-300 cursor-not-allowed"
            }`}
          >
            {/* "Add to my days" (2 Oct 2026, the video review): plainer than
                "Add to plan", and the toast after it says "Added to your days". */}
            {saving
              ? "Adding to your days…"
              : kept.length > 1
                ? `Add ${kept.length} to my days`
                : "Add to my days"}
          </button>
        </div>
      </div>
    </div>
  );
}
