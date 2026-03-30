"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Card, CardType, CardStatus, DayWithCards } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

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

// ── Map parsed type → Card type + sub_type ────────────────────
function cardTypeFromParsed(type: string): { cardType: CardType; sub_type: string } {
  switch (type) {
    case "flight_arrival":   return { cardType: "logistics", sub_type: "flight_arrival"   };
    case "flight_departure": return { cardType: "logistics", sub_type: "flight_departure" };
    case "hotel":            return { cardType: "logistics", sub_type: "hotel"            };
    case "restaurant":       return { cardType: "food",      sub_type: "restaurant"       };
    case "activity":
    default:                 return { cardType: "activity",  sub_type: "guided"           };
  }
}

const TYPE_LABEL: Record<string, string> = {
  flight_arrival:   "Outbound Flight",
  flight_departure: "Return Flight",
  hotel:            "Hotel",
  restaurant:       "Restaurant",
  activity:         "Activity",
};

const SKELETON_TITLES = ["Arrival", "Departure", "Flight", "Morning Coffee", "Check-in"];

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
  const handleSave = useCallback(async () => {
    const canSave = drafts.every((d) => d.title.trim() && d.dayId);
    if (!canSave || saving) return;
    setSaving(true);

    const createdCards: Card[] = [];
    const deletedIds:   string[] = [];

    for (let i = 0; i < items.length; i++) {
      const parsed = items[i];
      const draft  = drafts[i];
      const { cardType, sub_type } = cardTypeFromParsed(parsed.type);

      // Fix 3 — delete skeleton cards on the same day (empty details only)
      const { data: skeletons } = await supabase
        .from("cards")
        .select("id")
        .eq("day_id", draft.dayId)
        .in("title", SKELETON_TITLES)
        .eq("details", {});

      const skelIds = (skeletons ?? []).map((r: { id: string }) => r.id);
      if (skelIds.length) {
        await supabase.from("cards").delete().in("id", skelIds);
        deletedIds.push(...skelIds);
      }

      // Compute position after skeleton removal
      const dayCards = days.find((d) => d.id === draft.dayId)?.cards ?? [];
      const remaining = dayCards.filter((c) => !skelIds.includes(c.id));
      const endPos = remaining.reduce((m, c) => Math.max(m, c.position), 0) + 1;

      // Build details
      const details: Record<string, unknown> = {};
      if (confNo.trim())       details.confirmation = confNo.trim();
      if (parsed.phone)        details.phone        = parsed.phone;
      if (parsed.website)      details.website      = parsed.website;
      if (draft.notes.trim())  details.notes        = draft.notes.trim();

      const newCard: Card = {
        id:              crypto.randomUUID(),
        day_id:          draft.dayId,
        trip_id:         tripId,
        type:            cardType,
        sub_type,
        title:           draft.title.trim(),
        start_time:      draft.time.trim()    ? draft.time.trim()    + ":00" : null,
        end_time:        draft.endTime.trim() ? draft.endTime.trim() + ":00" : null,
        position:        endPos,
        status:          "in_itinerary" as CardStatus,
        source_url:      null,
        cover_image_url: null,
        lat:             null,
        lng:             null,
        address:         draft.address.trim() || null,
        details:         details as Card["details"],
        ai_generated:    false,
        created_at:      new Date().toISOString(),
      };

      const { error } = await supabase.from("cards").insert({
        id:              newCard.id,
        day_id:          newCard.day_id,
        trip_id:         newCard.trip_id,
        type:            newCard.type,
        sub_type:        newCard.sub_type,
        title:           newCard.title,
        start_time:      newCard.start_time,
        end_time:        newCard.end_time,
        position:        newCard.position,
        status:          newCard.status,
        source_url:      null,
        cover_image_url: null,
        lat:             null,
        lng:             null,
        address:         newCard.address,
        details:         newCard.details,
        ai_generated:    false,
      });

      if (!error) createdCards.push(newCard);
    }

    // Fix 5 — save document record
    const documentType = items[0]?.type.startsWith("flight") ? "flight"
                       : items[0]?.type ?? "activity";
    await supabase.from("documents").insert({
      trip_id:       tripId,
      file_name:     fileName,
      file_type:     fileType,
      document_type: documentType,
      parsed_data:   items,
      card_ids:      createdCards.map((c) => c.id),
    });

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
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Title
                    </label>
                    <input
                      type="text"
                      value={draft.title}
                      onChange={(e) => patchDraft(idx, { title: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors"
                    />
                  </div>

                  {/* Day assignment */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      Day
                      {parsed.date && (
                        <span className="ml-1 font-normal normal-case text-gray-400">
                          ({parsed.date})
                        </span>
                      )}
                    </label>
                    <select
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
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type.startsWith("flight") ? "Departs" : "Start time"}
                      </label>
                      <input
                        type="time"
                        value={draft.time}
                        onChange={(e) => patchDraft(idx, { time: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type.startsWith("flight") ? "Arrives" : "End time"}
                      </label>
                      <input
                        type="time"
                        value={draft.endTime}
                        onChange={(e) => patchDraft(idx, { endTime: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300"
                      />
                    </div>
                  </div>

                  {/* Address */}
                  {(draft.address || parsed.type !== "flight_arrival" && parsed.type !== "flight_departure") && (
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        {parsed.type.startsWith("flight") ? "Airport" : "Address / Venue"}
                      </label>
                      <input
                        type="text"
                        value={draft.address}
                        onChange={(e) => patchDraft(idx, { address: e.target.value })}
                        className="w-full mt-1 px-3 py-2 text-[14px] text-gray-900 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-300 focus:bg-white transition-colors"
                      />
                    </div>
                  )}

                  {/* Notes — flight number, seat, etc. */}
                  {(draft.notes || parsed.type.startsWith("flight")) && (
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        Notes
                      </label>
                      <textarea
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
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                Confirmation #
              </label>
              <input
                type="text"
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
