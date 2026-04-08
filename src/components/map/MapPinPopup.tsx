"use client";

import { useState, useCallback } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Card, CardType } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { PIN_COLORS } from "@/lib/mapPins";

// ── Constants ────────────────────────────────────────────────
const SUB_TYPE_LABEL: Record<string, string> = {
  restaurant:       "Restaurant",
  fine_dining:      "Fine Dining",
  street_food:      "Street Food",
  coffee:           "Coffee",
  coffee_dessert:   "Coffee",
  dessert:          "Dessert",
  cocktail_bar:     "Cocktail Bar",
  drinks:           "Bar",
  guided:           "Guided",
  wellness:         "Wellness",
  hotel:            "Hotel",
  flight_arrival:   "Flight Arrival",
  flight_departure: "Flight Departure",
};

const TYPE_OPTIONS: { type: CardType; label: string }[] = [
  { type: "activity",  label: "Activity" },
  { type: "food",      label: "Food"     },
  { type: "logistics", label: "Stay"     },
];

const SUB_TYPE_OPTIONS: Record<CardType, { label: string; value: string }[]> = {
  activity:  [
    { label: "Guided",        value: "guided"        },
    { label: "Self-directed", value: "self_directed"  },
    { label: "Wellness",      value: "wellness"       },
    { label: "Event",         value: "event"          },
    { label: "Challenge",     value: "challenge"      },
  ],
  food:      [
    { label: "Restaurant",  value: "restaurant"   },
    { label: "Coffee",      value: "coffee"       },
    { label: "Dessert",     value: "dessert"      },
    { label: "Cocktail Bar", value: "cocktail_bar" },
    { label: "Fine Dining", value: "fine_dining"  },
  ],
  logistics: [{ label: "Hotel", value: "hotel" }, { label: "Flight", value: "flight_arrival" }],
};

const POPUP_W = 300;
const PIN_R   = 14;
const ARROW_H = 8;
const GAP     = 4;

// ── StarRating ───────────────────────────────────────────────
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24"
          fill={rating >= i - 0.25 ? "#F59E0B" : "none"}
          stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

// ── Inline type/sub-type editor ──────────────────────────────
function TypeEditor({
  card,
  onSaved,
  onCancel,
}: {
  card: Card;
  onSaved: (updated: Card) => void;
  onCancel: () => void;
}) {
  const supabase = createClient();

  // Find the sub-type option that matches current card.sub_type (fall back to first option)
  function initSubType(type: CardType): string {
    const opts = SUB_TYPE_OPTIONS[type] ?? [];
    return opts.find((o) => o.value === card.sub_type)?.value ?? opts[0]?.value ?? "";
  }

  const initDetails    = card.details as Record<string, unknown> | null;
  const [editType,       setEditType]       = useState<CardType>(card.type);
  const [editSubType,    setEditSubType]    = useState<string>(initSubType(card.type));
  const [editRecommendedBy, setEditRecommendedBy] = useState<string>((initDetails?.recommended_by as string | undefined) ?? "");
  const [saving,         setSaving]         = useState(false);

  function pickType(t: CardType) {
    setEditType(t);
    const opts = SUB_TYPE_OPTIONS[t] ?? [];
    setEditSubType(opts[0]?.value ?? "");
  }

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const prevDetails = (card.details as Record<string, unknown> | null) ?? {};
    const updatedDetails = { ...prevDetails };
    if (editRecommendedBy.trim()) {
      updatedDetails.recommended_by = editRecommendedBy.trim();
    } else {
      delete updatedDetails.recommended_by;
    }
    const { error } = await supabase
      .from("cards")
      .update({ type: editType, sub_type: editSubType, details: updatedDetails })
      .eq("id", card.id);
    setSaving(false);
    if (!error) onSaved({ ...card, type: editType, sub_type: editSubType, details: updatedDetails });
  }, [saving, editType, editSubType, editRecommendedBy, card, supabase, onSaved]);

  const typeColor = PIN_COLORS[editType];

  return (
    <div className="mt-1.5 mb-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
      {/* Type pills */}
      <div className="flex gap-1.5 mb-2">
        {TYPE_OPTIONS.map(({ type: t, label }) => {
          const sel   = editType === t;
          const color = PIN_COLORS[t];
          return (
            <button
              key={t}
              onClick={() => pickType(t)}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all"
              style={sel
                ? { background: color, color: "white", border: `1px solid ${color}` }
                : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Sub-type pills */}
      <div className="flex gap-1.5 flex-wrap mb-2.5">
        {(SUB_TYPE_OPTIONS[editType] ?? []).map(({ label, value }) => {
          const sel = editSubType === value;
          return (
            <button
              key={value}
              onClick={() => setEditSubType(value)}
              className="px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all"
              style={sel
                ? { background: typeColor, color: "white", border: `1px solid ${typeColor}` }
                : { background: "transparent", color: "#6B7280", border: "1px solid #E5E7EB" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Recommended by */}
      <input
        type="text"
        value={editRecommendedBy}
        onChange={(e) => setEditRecommendedBy(e.target.value)}
        placeholder="Recommended by…"
        className="w-full px-2 py-1 text-[11px] text-gray-700 bg-white border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:border-gray-300 transition-colors mb-2.5"
      />

      {/* Save / Cancel */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-1 rounded-lg text-[11px] font-semibold text-white transition-colors"
          style={{ background: typeColor }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1 rounded-lg text-[11px] font-medium text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Shared card body ─────────────────────────────────────────
function CardBody({
  card,
  onClose,
  onCardUpdate,
  onCardDelete,
}: {
  card: Card;
  onClose: () => void;
  onCardUpdate?: (updated: Card) => void;
  onCardDelete?: (cardId: string) => void;
}) {
  const supabase         = createClient();
  const details          = card.details as Record<string, unknown> | null;
  const phone            = details?.phone as string | undefined;
  const rating           = details?.rating as number | undefined;
  const userRatingsTotal = details?.userRatingsTotal as number | undefined;
  const website          = details?.website as string | undefined;
  const recommendedBy    = details?.recommended_by as string | undefined;
  const subTypeLabel     = card.sub_type ? (SUB_TYPE_LABEL[card.sub_type] ?? card.sub_type) : null;
  const hasPhoto         = !!card.cover_image_url;

  const [isEditing, setIsEditing]               = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showItineraryMsg, setShowItineraryMsg]   = useState(false);
  const [isDeleting, setIsDeleting]               = useState(false);
  const [deleteError, setDeleteError]             = useState<string | null>(null);

  function handleTrashClick() {
    if (card.status === "in_itinerary") {
      setShowItineraryMsg(true);
      setTimeout(() => setShowItineraryMsg(false), 3500);
    } else {
      setShowDeleteConfirm(true);
    }
  }

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    const { error } = await supabase.from("cards").delete().eq("id", card.id);
    setIsDeleting(false);
    if (error) {
      setDeleteError("Couldn't remove — please try again.");
      setTimeout(() => setDeleteError(null), 3000);
      return;
    }
    onCardDelete?.(card.id);
    onClose();
  }, [card.id, onCardDelete, onClose, supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Cover photo */}
      {hasPhoto ? (
        <div className="w-full h-[120px] flex-shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.cover_image_url!} alt={card.title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div
          className="w-full h-[120px] flex-shrink-0 flex items-center justify-center"
          style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#86EFAC" strokeWidth="1.5" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
      )}

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"
        style={{ backdropFilter: "blur(8px)" }}
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {/* Trash button */}
      {onCardDelete && (
        <button
          onClick={handleTrashClick}
          className="absolute top-2 right-10 w-6 h-6 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"
          style={{ backdropFilter: "blur(8px)" }}
          aria-label="Delete place"
        >
          <Trash2 size={11} color="white" />
        </button>
      )}

      {/* Content */}
      <div className="px-3 pt-3 pb-3 overflow-y-auto flex-1">

        {/* Type badge + pencil */}
        <div className="flex items-center gap-1 mb-1">
          {subTypeLabel && (
            <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {subTypeLabel}
            </span>
          )}
          {onCardUpdate && (
            <button
              onClick={() => setIsEditing((v) => !v)}
              className="p-0.5 rounded hover:bg-gray-100 transition-colors"
              aria-label="Edit type"
            >
              <Pencil size={11} className="text-gray-400" />
            </button>
          )}
        </div>

        {/* Inline editor */}
        {isEditing && onCardUpdate && (
          <TypeEditor
            card={card}
            onSaved={(updated) => { onCardUpdate(updated); setIsEditing(false); }}
            onCancel={() => setIsEditing(false)}
          />
        )}

        <h2 className="text-[15px] font-bold text-gray-900 leading-snug">{card.title}</h2>

        {rating !== undefined && (
          <div className="flex items-center gap-1.5 mt-1">
            <StarRating rating={rating} />
            <span className="text-[12px] font-semibold text-gray-700">{rating.toFixed(1)}</span>
            {userRatingsTotal && (
              <span className="text-[11px] text-gray-400">({userRatingsTotal.toLocaleString()})</span>
            )}
          </div>
        )}
        {recommendedBy && (
          <p className="text-[11px] text-gray-400 mt-1 leading-snug">
            <span className="text-amber-400">★</span> Recommended by {recommendedBy}
          </p>
        )}

        {/* Compact pill action buttons */}
        <div className="flex gap-1.5 mt-3 flex-wrap">
          {card.lat != null && card.lng != null && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${card.lat},${card.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-blue-200 bg-blue-50 text-[11px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Maps
            </a>
          )}
          {(website || card.source_url) && (
            <a
              href={(website || card.source_url)!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Website
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.09 6.09l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              Call
            </a>
          )}
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="mt-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <p className="text-[12px] font-medium text-gray-800 mb-2.5">Remove this place from your map?</p>
            {deleteError && <p className="text-[11px] text-red-600 mb-2">{deleteError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60"
              >
                {isDeleting ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        )}

        {/* In-itinerary message */}
        {showItineraryMsg && (
          <div className="mt-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <p className="text-[12px] text-amber-700">This place is in your itinerary — remove it from your day plan first.</p>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main export ───────────────────────────────────────────────
interface Props {
  card: Card;
  anchorPos?: { x: number; y: number } | null;
  onClose: () => void;
  onCardUpdate?: (updated: Card) => void;
  onCardDelete?: (cardId: string) => void;
}

export default function MapPinPopup({ card, anchorPos, onClose, onCardUpdate, onCardDelete }: Props) {
  if (anchorPos) {
    const vw        = typeof window !== "undefined" ? window.innerWidth : 800;
    const rawLeft   = anchorPos.x - POPUP_W / 2;
    const left      = Math.max(8, Math.min(rawLeft, vw - POPUP_W - 8));
    const arrowLeft = Math.max(16, Math.min(POPUP_W - 16, anchorPos.x - left));
    const bottomY   = anchorPos.y - PIN_R - GAP;

    return (
      <div
        style={{
          position: "fixed",
          left,
          top: bottomY,
          transform: "translateY(-100%)",
          width: POPUP_W,
          zIndex: 50,
          paddingBottom: ARROW_H,
          pointerEvents: "auto",
        }}
      >
        <div
          className="bg-white rounded-2xl overflow-hidden flex flex-col"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.20)", maxHeight: "65vh" }}
        >
          <CardBody card={card} onClose={onClose} onCardUpdate={onCardUpdate} onCardDelete={onCardDelete} />
        </div>

        {/* Downward triangle */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: arrowLeft,
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: `${ARROW_H}px solid transparent`,
            borderRight: `${ARROW_H}px solid transparent`,
            borderTop: `${ARROW_H}px solid white`,
          }}
        />
      </div>
    );
  }

  // Fallback: centered modal
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-150" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl overflow-hidden w-full max-w-sm animate-in zoom-in-95 duration-200 max-h-[85dvh] flex flex-col"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
      >
        <CardBody card={card} onClose={onClose} onCardUpdate={onCardUpdate} onCardDelete={onCardDelete} />
      </div>
    </div>
  );
}
