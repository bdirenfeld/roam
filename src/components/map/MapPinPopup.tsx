"use client";

import { useState, useCallback, type ReactNode } from "react";
import { PencilSimple, Trash, BookmarkSimple, Heart } from "@phosphor-icons/react";
import type { Card, CardType, Day } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { scheduleCardOnDay } from "@/lib/scheduleCard";
import { PIN_COLORS } from "@/lib/mapPins";
import { readRecommendedBy, recommendedByLine } from "@/lib/recommendedBy";
import PlacePhotoGallery from "@/components/cards/PlacePhotoGallery";

/**
 * "https://vt.tiktok.com/ZSVWDnuF8/" → "TikTok".
 *
 * The domain is the part you recognise; the subdomain and the path are noise on
 * a chip this size. Named sites get their own capitalisation because "Tiktok"
 * and "Youtube" look like typos.
 */
function sourceLabel(url: string): string {
  const KNOWN: Record<string, string> = {
    tiktok: "TikTok",
    instagram: "Instagram",
    youtube: "YouTube",
    reddit: "Reddit",
    lonelyplanet: "Lonely Planet",
    tripadvisor: "Tripadvisor",
    airbnb: "Airbnb",
  };
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    if (!name) return "Source";
    return KNOWN[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // A stored value that isn't a URL still deserves a working chip.
    return "Source";
  }
}

// ── Constants ────────────────────────────────────────────────
const SUB_TYPE_LABEL: Record<string, string> = {
  restaurant:       "Restaurant",
  fine_dining:      "Restaurant",
  street_food:      "Restaurant",
  coffee:           "Coffee",
  coffee_dessert:   "Coffee",
  dessert:          "Dessert",
  bar:              "Bar",
  cocktail_bar:     "Bar",
  drinks:           "Bar",
  guided:           "Guided",
  hosted:           "Guided",
  self_directed:    "Self-Directed",
  wellness:         "Wellness",
  challenge:        "Challenge",
  beach:            "Beach",
  event:            "Event",
  hotel:            "Hotel",
  transit:          "Transit",
  grocery:          "Grocery",
  medical:          "Medical",
  flight_arrival:   "Flight Arrival",
  flight_departure: "Flight Departure",
};

const TYPE_OPTIONS: { type: CardType; label: string }[] = [
  { type: "activity",  label: "Activity" },
  { type: "food",      label: "Food"     },
  { type: "logistics", label: "Logistics" },
];

const SUB_TYPE_OPTIONS: Record<CardType, { label: string; value: string }[]> = {
  activity:  [
    { label: "Guided",        value: "guided"        },
    { label: "Self-directed", value: "self_directed"  },
    { label: "Wellness",      value: "wellness"       },
    { label: "Event",         value: "event"          },
    { label: "Beach",         value: "beach"          },
  ],
  food:      [
    { label: "Restaurant", value: "restaurant" },
    { label: "Coffee",     value: "coffee"     },
    { label: "Dessert",    value: "dessert"    },
    { label: "Bar",        value: "bar"        },
  ],
  logistics: [
    { label: "Hotel",   value: "hotel"          },
    { label: "Flight",  value: "flight_arrival" },
    { label: "Transit", value: "transit"        },
    { label: "Grocery", value: "grocery"        },
    { label: "Medical", value: "medical"        },
  ],
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

  // Find the sub-type option that matches current place.sub_type (fall back to first option)
  function initSubType(type: CardType): string {
    const opts = SUB_TYPE_OPTIONS[type] ?? [];
    return opts.find((o) => o.value === card.place!.sub_type)?.value ?? opts[0]?.value ?? "";
  }

  const [editType,       setEditType]       = useState<CardType>(card.place!.type);
  const [editSubType,    setEditSubType]    = useState<string>(initSubType(card.place!.type));
  const [saving,         setSaving]         = useState(false);

  // Picking a type only narrows the sub-type row; nothing is written until a
  // sub-type is tapped, so a mis-tap on the type pill costs nothing.
  function pickType(t: CardType) {
    setEditType(t);
    const opts = SUB_TYPE_OPTIONS[t] ?? [];
    setEditSubType(opts[0]?.value ?? "");
  }

  // Commit on selection. Category lives on the PLACE, so this is one update
  // and the popup restyles through onSaved; the card's details are untouched.
  const commit = useCallback(async (t: CardType, st: string) => {
    if (saving || !card.place_id) return;
    setSaving(true);
    const { error } = await supabase
      .from("places")
      .update({ type: t, sub_type: st })
      .eq("id", card.place_id);
    setSaving(false);
    if (!error && card.place) {
      onSaved({ ...card, place: { ...card.place, type: t, sub_type: st } });
    }
  }, [saving, card, supabase, onSaved]);

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
              onClick={() => { setEditSubType(value); void commit(editType, value); }}
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

      {/* No Save row: picking a sub-type commits, the way the card sheet's
          picker already does, so a category change is two taps from the pin
          instead of four. The recommended-by field that used to sit here is
          now edited on the popup itself (DetailsField). */}
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-gray-400">{saving ? "Saving…" : "Tap a sub-type to save"}</span>
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

// ── Tap-to-edit detail (notes, recommended by) ───────────────
// One field, one write. Both "who told you about this" and "what you wanted
// to remember" used to be reachable only from the card sheet or, for the
// recommender, buried inside the type editor behind a pencil labelled "Edit
// type". On the map you're looking at the pin, so the pin is where you edit.
// Each save merges a single key into `details` and hands the card back up so
// the pin restyles (recommended pins draw differently) without a reload.
function DetailsField({
  card,
  fieldKey,
  value,
  render,
  emptyLabel,
  placeholder,
  multiline,
  accent,
  onSaved,
}: {
  card: Card;
  fieldKey: "notes" | "recommended_by";
  value: string | null;
  render: (v: string) => ReactNode;
  emptyLabel: string;
  placeholder: string;
  multiline?: boolean;
  accent: string;
  onSaved?: (updated: Card) => void;
}) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? "");
  const [saving, setSaving]   = useState(false);
  const [failed, setFailed]   = useState(false);

  const open = () => { setDraft(value ?? ""); setFailed(false); setEditing(true); };

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const prev = (card.details as Record<string, unknown> | null) ?? {};
    const next = { ...prev };
    const trimmed = draft.trim();
    if (trimmed) next[fieldKey] = trimmed;
    else delete next[fieldKey];
    const { error } = await supabase.from("cards").update({ details: next }).eq("id", card.id);
    setSaving(false);
    if (error) {
      console.error(`[Roam] Saving ${fieldKey} failed:`, error.message);
      setFailed(true);
      return;
    }
    onSaved?.({ ...card, details: next });
    setEditing(false);
  }, [saving, draft, fieldKey, card, supabase, onSaved]);

  if (editing) {
    const shared = "w-full px-2 py-1 text-[11px] text-gray-700 bg-white border border-gray-200 rounded-lg placeholder-gray-400 focus:outline-none focus:border-gray-300 transition-colors";
    return (
      <div className="mt-1.5 mb-1">
        {multiline ? (
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            className={`${shared} resize-none leading-snug`}
          />
        ) : (
          <input
            autoFocus
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
            placeholder={placeholder}
            className={shared}
          />
        )}
        {failed && <p className="text-[11px] text-red-600 mt-1">Couldn&apos;t save — try again.</p>}
        <div className="flex gap-2 mt-1.5">
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-1 rounded-lg text-[11px] font-semibold text-white transition-colors disabled:opacity-60"
            style={{ background: accent }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1 rounded-lg text-[11px] font-medium text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Read-only viewers (shared journeys) see the value and no affordance.
  if (!onSaved) return value ? <>{render(value)}</> : null;

  return value ? (
    <button onClick={open} className="block w-full text-left group" aria-label={`Edit ${fieldKey === "notes" ? "note" : "recommender"}`}>
      {render(value)}
      <span className="sr-only">Tap to edit</span>
    </button>
  ) : (
    <button
      onClick={open}
      className="mt-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors underline decoration-dotted underline-offset-2"
    >
      {emptyLabel}
    </button>
  );
}

// ── Shared card body ─────────────────────────────────────────
function CardBody({
  card,
  onClose,
  onCardUpdate,
  onCardDelete,
  onCardCreated,
  days,
  tripId,
}: {
  card: Card;
  onClose: () => void;
  onCardUpdate?: (updated: Card) => void;
  onCardDelete?: (cardId: string) => void;
  onCardCreated?: (created: Card) => void;
  days?: Day[];
  tripId?: string;
}) {
  const supabase         = createClient();
  const place            = card.place!;
  const details          = card.details as Record<string, unknown> | null;

  // "We loved this" lives on the PLACE, so every card pointing at it inherits
  // the mark. Optimistic; the card reverts if the write is refused. Setting it
  // was previously only possible from the card sheet, which made the map — the
  // screen you're actually on when you remember loving somewhere — a dead end.
  const toggleLoved = useCallback(async () => {
    if (!card.place_id || !onCardUpdate) return;
    const next = !place.loved;
    const lovedAt = next ? new Date().toISOString() : null;
    onCardUpdate({ ...card, place: { ...place, loved: next, loved_at: lovedAt } });
    const { error } = await supabase
      .from("places")
      .update({ loved: next, loved_at: lovedAt })
      .eq("id", card.place_id);
    if (error) {
      console.error("[Roam] Saving loved failed:", error.message);
      onCardUpdate({ ...card, place });
    }
  }, [card, place, onCardUpdate, supabase]);
  // Prefer the embedded place (world facts); fall back to card.details for
  // cards saved before the place row carried these fields (transitional).
  const phone            = place?.phone ?? (details?.phone as string | undefined) ?? undefined;
  const rating           = place.rating ?? undefined;
  const userRatingsTotal = details?.userRatingsTotal as number | undefined;
  const website          = place?.website ?? (details?.website as string | undefined) ?? undefined;
  const recommendedBy    = readRecommendedBy(details);
  const notesRaw         = details?.notes;
  const notes            = typeof notesRaw === "string" && notesRaw.trim() ? notesRaw.trim() : null;
  const subTypeLabel     = place.sub_type ? (SUB_TYPE_LABEL[place.sub_type] ?? place.sub_type) : null;

  const [isEditing, setIsEditing]               = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showItineraryMsg, setShowItineraryMsg]   = useState(false);
  const [isDeleting, setIsDeleting]               = useState(false);
  const [deleteError, setDeleteError]             = useState<string | null>(null);
  const [showDayList, setShowDayList]             = useState(false);
  const [scheduling, setScheduling]               = useState(false);

  // Door 2: place this pin onto a day as a new in_itinerary card via the shared
  // helper. The interested card behind the pin is untouched.
  const canAddToDay = !!(days && days.length > 0 && tripId && card.place_id);

  const handleAddToDay = useCallback(async (day: Day) => {
    if (!tripId || !card.place_id || scheduling) return;
    setScheduling(true);
    const newCard = await scheduleCardOnDay(supabase, {
      tripId, dayId: day.id, placeId: card.place_id, place: card.place,
    });
    setScheduling(false);
    if (newCard) {
      // Hand the scheduled card back so its pin lands on the map now, in the
      // filled "scheduled" styling — not on the next page load.
      onCardCreated?.(newCard);
      onClose();
    }
  }, [tripId, card.place_id, card.place, scheduling, supabase, onCardCreated, onClose]);

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
      {/* Cover photo — swipeable gallery. Keyed on places.id (a uuid), NOT the
          Google place id: every image goes through the authenticated proxy,
          which resolves the photo reference server-side so no API key ever
          reaches the browser. */}
      <PlacePhotoGallery
        key={place.id}
        placeId={place.id}
        hasGooglePhotos={!!place.google_place_id}
        fallbackLat={place.lat}
        fallbackLng={place.lng}
        title={place.title}
        height={160}
      />

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
          <Trash size={11} weight="light" color="white" />
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
              <PencilSimple size={11} weight="light" color="#9CA3AF" />
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

        {/* Title + the heart. Loving a place from the map was previously
            impossible — you could see the mark here but only set it from the
            card sheet, which is a dead end for anyone living on the map tab. */}
        <div className="flex items-start gap-2">
          <h2 className="flex-1 min-w-0 text-[15px] font-bold text-gray-900 leading-snug">{place.title}</h2>
          {onCardUpdate && card.place_id && (
            <button
              onClick={toggleLoved}
              aria-pressed={place.loved === true}
              aria-label={place.loved ? "We loved this — tap to unset" : "We loved this"}
              title="We loved this"
              className="flex-shrink-0 -mt-0.5 p-1"
            >
              <Heart
                size={15}
                weight={place.loved ? "fill" : "light"}
                color={place.loved ? "#C4622D" : "#9CA3AF"}
              />
            </button>
          )}
        </div>

        {rating !== undefined && (
          <div className="flex items-center gap-1.5 mt-1">
            <StarRating rating={rating} />
            <span className="text-[12px] font-semibold text-gray-700">{rating.toFixed(1)}</span>
            {userRatingsTotal && (
              <span className="text-[11px] text-gray-400">({userRatingsTotal.toLocaleString()})</span>
            )}
          </div>
        )}
        {/* Who told you, and what you wanted to remember — both editable
            right here. Tap the line to change it; the quiet dotted link
            appears only when the field is empty and you can write. */}
        <DetailsField
          card={card}
          fieldKey="recommended_by"
          value={recommendedBy}
          accent={PIN_COLORS[place.type]}
          onSaved={onCardUpdate}
          emptyLabel="Who recommended it?"
          placeholder="Recommended by…"
          render={(v) => (
            <p className="text-[11px] text-gray-400 mt-1 leading-snug">
              <span className="text-amber-400">★</span> {recommendedByLine(v)}
            </p>
          )}
        />
        <DetailsField
          card={card}
          fieldKey="notes"
          value={notes}
          multiline
          accent={PIN_COLORS[place.type]}
          onSaved={onCardUpdate}
          emptyLabel="Add a note"
          placeholder="What you wanted to remember about this place…"
          render={(v) => (
            <p
              className="text-[12px] text-gray-600 mt-1.5 leading-snug whitespace-pre-line"
              style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            >
              {v}
            </p>
          )}
        />
        {notes && notes.length > 200 && (
          <p className="text-[10px] text-gray-400 mt-0.5">Tap the note to read or edit all of it.</p>
        )}

        {showDayList && canAddToDay ? (
          /* Day list — replaces the action area; popup width is unchanged */
          <div className="mt-3">
            <div className="flex items-center gap-1.5 px-1 pb-2">
              <button onClick={() => setShowDayList(false)} className="p-0.5 flex" aria-label="Back">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.55)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,26,46,0.40)" }}>
                Add to which day
              </span>
            </div>
            <div className="overflow-y-auto rounded-[10px]" style={{ maxHeight: 168, boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.10)" }}>
              {days!.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => handleAddToDay(d)}
                  disabled={scheduling}
                  className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left bg-white active:bg-gray-50 transition-colors disabled:opacity-60"
                  style={{ borderBottom: i < days!.length - 1 ? "1px solid rgba(26,26,46,0.10)" : "none" }}
                >
                  <span style={{ fontWeight: 600, fontSize: "13.5px", color: "#1A1A2E", letterSpacing: "-0.005em" }}>Day {d.day_number}</span>
                  <span style={{ color: "rgba(26,26,46,0.40)", fontSize: "11px" }}>·</span>
                  <span className="flex-1" style={{ fontSize: "13px", color: "rgba(26,26,46,0.55)", letterSpacing: "-0.005em" }}>
                    {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(26,26,46,0.40)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Compact pill action buttons */}
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {place.lat != null && place.lng != null && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`}
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
              {website && (
                <a
                  href={website}
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

              {/* Where the place came from, named — "TikTok", not "Website".
                  It used to be shown only when the place had no site of its
                  own, and labelled as the site: a restaurant with a homepage
                  silently swallowed the reel you found it in. Remembering why
                  a place is on the list is most of what a saved link is for. */}
              {card.source_url && card.source_url !== website && (
                <a
                  href={card.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
                    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
                  </svg>
                  {sourceLabel(card.source_url)}
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

            {/* Door 2 — Add to day */}
            {canAddToDay && (
              <button
                onClick={() => setShowDayList(true)}
                className="mt-2.5 w-full flex items-center justify-center gap-2 rounded-[10px] px-3.5 py-2.5 active:opacity-70 transition-opacity"
                style={{ background: "#F2EDE3", boxShadow: "inset 0 0 0 1px rgba(26,26,46,0.10)", fontWeight: 600, fontSize: "13.5px", color: "#1A1A2E", letterSpacing: "-0.005em" }}
              >
                <BookmarkSimple size={14} weight="light" color="#1A1A2E" />
                Add to day
              </button>
            )}
          </>
        )}

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
  /** Fired with the new in_itinerary card when this pin is added to a day. */
  onCardCreated?: (created: Card) => void;
  days?: Day[];
  tripId?: string;
}

export default function MapPinPopup({ card, anchorPos, onClose, onCardUpdate, onCardDelete, onCardCreated, days, tripId }: Props) {
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
          <CardBody card={card} onClose={onClose} onCardUpdate={onCardUpdate} onCardDelete={onCardDelete} onCardCreated={onCardCreated} days={days} tripId={tripId} />
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
        <CardBody card={card} onClose={onClose} onCardUpdate={onCardUpdate} onCardDelete={onCardDelete} onCardCreated={onCardCreated} days={days} tripId={tripId} />
      </div>
    </div>
  );
}
