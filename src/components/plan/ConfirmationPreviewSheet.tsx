"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardStatus, DayWithCards, Place } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { queuedInsert } from "@/lib/offline/queuedWrite";
import { confirmationDetails, closingEvent, openingTitle, type ParsedConfirmation } from "@/lib/confirmations/toCards";
import { resolvePlace } from "@/lib/confirmations/resolvePlace";

// ── ParsedConfirmation — matches API response (lib/confirmations/toCards) ──
export type { ParsedConfirmation };


interface Props {
  items:           ParsedConfirmation[];
  fileName:        string;
  fileType:        string;
  days:            DayWithCards[];
  tripId:          string;
  onClose:         () => void;
  onCardsCreated:  (cards: Card[], deletedIds: string[]) => void;
  /** Replaces "Confirmation parsed" — e.g. the rest of an attached package. */
  heading?:        string;
}

const TYPE_LABEL: Record<string, string> = {
  flight_arrival:   "Outbound Flight",
  flight_departure: "Return Flight",
  hotel:            "Hotel",
  car_rental:       "Rental car",
  restaurant:       "Restaurant",
  activity:         "Activity",
};

function findMatchingDay(days: DayWithCards[], date: string | null): string | null {
  if (!date) return null;
  return days.find((d) => d.date === date)?.id ?? null;
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
  items, fileName, fileType, days, tripId, onClose, onCardsCreated, heading,
}: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY    = useRef(0);
  const dragging = useRef(false);

  // Shared confirmation number (usually same for round-trip)
  const [confNo, setConfNo] = useState(items[0]?.confirmation_number ?? "");

  // One draft per parsed item
  const [drafts, setDrafts] = useState<ItemDraft[]>(() =>
    items.map((p) => ({
      title:   p.title ?? "",
      dayId:   findMatchingDay(days, p.date) ?? (days[0]?.id ?? ""),
      time:    p.time ?? "",
      endTime: p.end_time ?? "",
      address: p.address ?? "",
      notes:   p.notes ?? "",
      outDayId: p.type === "hotel" ? (findMatchingDay(days, p.check_out_date ?? null) ?? "") : p.type === "car_rental" ? (findMatchingDay(days, p.drop_off_date ?? null) ?? "") : "",
    }))
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
    const canSave = drafts.every((d) => d.title.trim() && d.dayId);
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);

    // The stored session, not a network call: this has to work on a bad signal.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { setSaving(false); setSaveError("You're signed out. Sign in and try again."); return; }

    // Each booking's real place, looked up together; a miss stays a note.
    const places = await Promise.all(items.map((p) => resolvePlace(p)));

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
      confirmed:    false,
      created_at:   new Date().toISOString(),
      place_id:     place?.id ?? null,
      place,
    });
    const hhmm = (t: string) => (t.trim() ? `${t.trim().slice(0, 5)}:00` : null);
    const createdCards: Card[] = drafts.flatMap((draft, i) => {
      const parsed = items[i];
      const place = places[i];
      const details = confirmationDetails(parsed, { title: openingTitle(parsed, draft.title.trim()), notes: draft.notes, confirmation: confNo });
      const twoPart = parsed.type === "hotel" || parsed.type === "car_rental";
      const outDay = twoPart ? days.find((d) => d.id === draft.outDayId) : undefined;
      if (outDay?.date) details[parsed.type === "hotel" ? "check_out" : "drop_off"] = outDay.date;
      const main = card(draft.dayId, hhmm(draft.time), twoPart ? null : hhmm(draft.endTime), details, place);
      // A stay is two events, check-in and check-out; a car, pick-up and drop-off.
      const close = outDay ? closingEvent({ ...parsed, check_out_date: outDay.date, drop_off_date: outDay.date }, place?.title ?? draft.title.trim()) : null;
      if (!outDay || !close) return [main];
      return [main, card(outDay.id, close.time, null, { ...details, title: close.title }, place)];
    });

    // The columns the insert has always written — not the display-only fields.
    const rows = createdCards.map((c) => ({
      id: c.id, day_id: c.day_id, trip_id: c.trip_id, start_time: c.start_time, end_time: c.end_time,
      position: c.position, status: c.status, source_url: null, details: c.details, ai_generated: false, place_id: c.place_id,
    }));
    const { error } = await queuedInsert("cards", rows);
    if (error) {
      console.error("[ConfirmationPreviewSheet] import refused:", error);
      setSaving(false);
      setSaveError("Couldn't add these to the plan. Nothing was added — tap to try again.");
      return;
    }
    const deletedIds: string[] = [];

    // Save document record — best-effort, never blocks card creation
    const documentType = items[0]?.type.startsWith("flight") ? "flight"
                       : items[0]?.type ?? "activity";
    const { error: docError } = await queuedInsert("documents", {
      id:            crypto.randomUUID(),
      trip_id:       tripId,
      user_id:       user.id,
      file_name:     fileName,
      file_type:     fileType,
      document_type: documentType,
      parsed_data:   items,
      card_ids:      createdCards.map((c) => c.id),
    });
    if (docError) console.error("[ConfirmationPreviewSheet] Failed to save document record:", docError);

    setSaving(false);
    onCardsCreated(createdCards, deletedIds);
  }, [drafts, items, confNo, days, tripId, fileName, fileType, saving, supabase, onCardsCreated]);

  // ── Derived ──────────────────────────────────────────────────
  const isRoundTrip = items.length === 2 &&
    items[0].type === "flight_arrival" && items[1].type === "flight_departure";

  const sheetTitle = isRoundTrip
    ? "Round-trip flight · 2 cards"
    : (TYPE_LABEL[items[0]?.type ?? "activity"] ?? "Confirmation");

  const canSave = drafts.every((d) => d.title.trim() && d.dayId) && !saving;

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
          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide">
              {heading ?? "Confirmation parsed"}
            </p>
            <h3 className="text-[16px] font-bold text-gray-900">{sheetTitle}</h3>
          </div>
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

          {/* One section per parsed item */}
          {items.map((parsed, idx) => {
            const draft = drafts[idx];
            const label = TYPE_LABEL[parsed.type] ?? "Booking";
            return (
              <div key={idx} className={idx > 0 ? "border-t border-gray-100" : ""}>
                {/* Section label (only if multiple items) */}
                {items.length > 1 && (
                  <div className="px-5 pt-4 pb-1">
                    <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                      {label}
                    </p>
                  </div>
                )}

                <div className="px-5 py-4 space-y-4">
                  {/* Title */}
                  <div>
                    <label htmlFor={`conf-${idx}-title`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Title
                    </label>
                    <input
                      type="text"
                      id={`conf-${idx}-title`}
                      value={draft.title}
                      onChange={(e) => patchDraft(idx, { title: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors"
                    />
                  </div>

                  {/* Day assignment */}
                  <div>
                    <label htmlFor={`conf-${idx}-day`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {parsed.type === "hotel" ? "Check in" : parsed.type === "car_rental" ? "Pick up" : "Day"}
                      {parsed.date && (
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
                  </div>

                  {/* Hotels: the day you leave, read from the booking */}
                  {(parsed.type === "hotel" || parsed.type === "car_rental") && (
                    <div>
                      <label htmlFor={`conf-${idx}-out`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type === "hotel" ? "Check out" : "Drop off"}
                        {(parsed.type === "hotel" ? parsed.check_out_date : parsed.drop_off_date) && (
                          <span className="ml-1 font-normal normal-case text-gray-400">({parsed.type === "hotel" ? parsed.check_out_date : parsed.drop_off_date})</span>
                        )}
                      </label>
                      <select
                        id={`conf-${idx}-out`}
                        value={draft.outDayId}
                        onChange={(e) => patchDraft(idx, { outDayId: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 appearance-none"
                      >
                        <option value="">After the trip&apos;s last day</option>
                        {days.filter((d) => d.date > (days.find((x) => x.id === draft.dayId)?.date ?? "")).map((d) => (
                          <option key={d.id} value={d.id}>
                            Day {d.day_number}{d.date ? ` — ${fmtDate(d.date)}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Times */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label htmlFor={`conf-${idx}-start`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type.startsWith("flight") ? "Departs" : parsed.type === "hotel" ? "Check-in time" : parsed.type === "car_rental" ? "Pick-up time" : "Start time"}
                      </label>
                      <input
                        type="time"
                        id={`conf-${idx}-start`}
                      value={draft.time}
                        onChange={(e) => patchDraft(idx, { time: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300"
                      />
                    </div>
                    {parsed.type !== "hotel" && parsed.type !== "car_rental" && <div className="flex-1">
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
                  </div>

                  {/* Address */}
                  {(draft.address || parsed.type !== "flight_arrival" && parsed.type !== "flight_departure") && (
                    <div>
                      <label htmlFor={`conf-${idx}-address`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type.startsWith("flight") ? "Airport" : "Address / Venue"}
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
                  {(draft.notes || parsed.type.startsWith("flight")) && (
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
                </div>
              </div>
            );
          })}

          {/* Shared confirmation number */}
          <div className="px-5 pb-4 border-t border-gray-100 pt-4 space-y-4">
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
          </div>
        </div>

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
            {saving
              ? "Adding to plan…"
              : items.length > 1
                ? `Add ${items.length} cards to plan`
                : "Add to plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
