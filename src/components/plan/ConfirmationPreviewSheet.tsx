"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardStatus, DayWithCards } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { queuedInsert } from "@/lib/offline/queuedWrite";

// ── ParsedConfirmation — matches API response ─────────────────
export interface ParsedConfirmation {
  type:                "flight_arrival" | "flight_departure" | "hotel" | "restaurant" | "activity";
  title:               string;
  confirmation_number: string | null;
  date:                string | null;
  time:                string | null;
  end_time:            string | null;
  address:             string | null;
  phone:               string | null;
  website:             string | null;
  notes:               string | null;
}

interface Props {
  items:           ParsedConfirmation[];
  fileName:        string;
  fileType:        string;
  days:            DayWithCards[];
  tripId:          string;
  onClose:         () => void;
  onCardsCreated:  (cards: Card[], deletedIds: string[]) => void;
}

const TYPE_LABEL: Record<string, string> = {
  flight_arrival:   "Outbound Flight",
  flight_departure: "Return Flight",
  hotel:            "Hotel",
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
}

export default function ConfirmationPreviewSheet({
  items, fileName, fileType, days, tripId, onClose, onCardsCreated,
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

    const nextPos = new Map<string, number>();
    const createdCards: Card[] = drafts.map((draft, i) => {
      const parsed = items[i];
      const dayCards = days.find((d) => d.id === draft.dayId)?.cards ?? [];
      const pos = nextPos.get(draft.dayId) ?? dayCards.reduce((m, c) => Math.max(m, c.position), 0) + 1;
      nextPos.set(draft.dayId, pos + 1);

      const details: Record<string, unknown> = { title: draft.title.trim() };
      if (confNo.trim())       details.confirmation = confNo.trim();
      if (parsed.phone)        details.phone        = parsed.phone;
      if (parsed.website)      details.website      = parsed.website;
      if (draft.notes.trim())  details.notes        = draft.notes.trim();

      return {
        id:           crypto.randomUUID(),
        day_id:       draft.dayId,
        list_id:      null,
        trip_id:      tripId,
        start_time:   draft.time.trim()    ? `${draft.time.trim().slice(0, 5)}:00`    : null,
        end_time:     draft.endTime.trim() ? `${draft.endTime.trim().slice(0, 5)}:00` : null,
        position:     pos,
        status:       "in_itinerary" as CardStatus,
        source_url:   null,
        details:      details as Card["details"],
        ai_generated: false,
        confirmed:    false,
        created_at:   new Date().toISOString(),
        place_id:     null,
        place:        null,
      };
    });

    // The columns the insert has always written — not the display-only fields.
    const rows = createdCards.map((c) => ({
      id: c.id, day_id: c.day_id, trip_id: c.trip_id, start_time: c.start_time, end_time: c.end_time,
      position: c.position, status: c.status, source_url: null, details: c.details, ai_generated: false, place_id: null,
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
              Confirmation parsed
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
                      Day
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

                  {/* Times */}
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label htmlFor={`conf-${idx}-start`} className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type.startsWith("flight") ? "Departs" : "Start time"}
                      </label>
                      <input
                        type="time"
                        id={`conf-${idx}-start`}
                      value={draft.time}
                        onChange={(e) => patchDraft(idx, { time: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300"
                      />
                    </div>
                    <div className="flex-1">
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
                    </div>
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
