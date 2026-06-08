"use client";

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import type { Card, CardType, DayWithCards } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { scheduleCardOnDay } from "@/lib/scheduleCard";

/**
 * Two modes share this sheet:
 *  - "link":   update an existing card's place_id (legacy behavior, untouched).
 *  - "create": Door 1 — show the trip's saved places and place one onto a day
 *              as a NEW in_itinerary card (the interested card is never touched).
 */
interface LinkModeProps {
  mode:     "link";
  tripId:   string;
  /** The card's declared type. `null` (e.g. a fresh Note card) shows every saved place. */
  cardType: CardType | null;
  onLink:   (place: Card) => void;
  onClose:  () => void;
}
interface CreateModeProps {
  mode:    "create";
  tripId:  string;
  day:     DayWithCards;
  /** place_ids already scheduled anywhere on the trip — drives the quiet check. */
  scheduledPlaceIds: Set<string>;
  onClose:  () => void;
  onAdded?: (cards: Card[]) => void;
}
type Props = LinkModeProps | CreateModeProps;

// Display order for the type-level groups.
const TYPE_ORDER: CardType[] = ["food", "activity", "logistics"];

const TYPE_LABEL: Record<CardType, string> = {
  food:      "Food",
  activity:  "Activity",
  logistics: "Logistics",
};

// Create-mode group headers match the map filter rail wording.
const CREATE_LABEL: Record<CardType, string> = {
  food:      "Food",
  activity:  "Activities",
  logistics: "Logistics",
};

const TYPE_COLOR: Record<CardType, string> = {
  food:      "#7C3AED",
  activity:  "#0D9488",
  logistics: "#111827",
};

// ── Create-mode (editorial) tokens — match the design mockups ──
const DM       = "'DM Sans', system-ui, sans-serif";
const PF       = "'Playfair Display', Georgia, serif";
const INK      = "#1A1A2E";
const CAP      = "rgba(26,26,46,0.55)";
const CAP_SOFT = "rgba(26,26,46,0.40)";
const RULE     = "rgba(26,26,46,0.10)";
const SMALL_CAPS: CSSProperties = { fontFamily: DM, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase" };

// Simple sub-type icons (SVG paths) — used for each place's row glyph.
function SubTypeIcon({ subType, color }: { subType: string; color: string }) {
  const s = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (subType) {
    case "restaurant":
      return (
        <svg {...s}>
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" /><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
      );
    case "coffee":
    case "coffee_dessert":
      return (
        <svg {...s}>
          <path d="M17 8h1a4 4 0 0 1 0 8h-1" />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
          <line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" />
        </svg>
      );
    case "dessert":
      return (
        <svg {...s}>
          <circle cx="12" cy="10" r="4" />
          <path d="M10 14-1 7h6l-1-7" />
        </svg>
      );
    case "cocktail_bar":
    case "drinks":
    case "bar":
      return (
        <svg {...s}>
          <path d="M8 22h8" /><path d="M12 11v11" />
          <path d="m19 3-7 8-7-8Z" />
        </svg>
      );
    case "guided":
    case "hosted":
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" />
        </svg>
      );
    case "self_directed":
      return (
        <svg {...s}>
          <circle cx="12" cy="5" r="1" fill={color} stroke="none" />
          <path d="m9 20 3-6 3 6" /><path d="m6 8 6 2 6-2" /><path d="M12 10v4" />
        </svg>
      );
    case "wellness":
      return (
        <svg {...s}>
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      );
    case "event":
      return (
        <svg {...s}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "challenge":
      return (
        <svg {...s}>
          <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
        </svg>
      );
    case "hotel":
      return (
        <svg {...s}>
          <path d="M2 20V8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12" />
          <path d="M2 20h20" /><path d="M7 20v-5h10v5" />
          <path d="M9 9h1" /><path d="M14 9h1" />
        </svg>
      );
    case "flight_arrival":
    case "flight_departure":
      return (
        <svg {...s}>
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-.7 0-1.5.3-2 .8L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
        </svg>
      );
    case "transit":
      return (
        <svg {...s}>
          <rect x="1" y="3" width="15" height="13" rx="2" />
          <path d="M16 8h4l3 3v5h-7V8z" />
          <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      );
  }
}

// One saved-place row in create mode: tap toggles selection; the footer commits.
function CreateRow({
  card, scheduled, selected, last, onToggle,
}: {
  card: Card; scheduled: boolean; selected: boolean; last: boolean; onToggle: (c: Card) => void;
}) {
  const place = card.place!;
  const meta = [
    place.address,
    place.rating != null ? `★ ${place.rating.toFixed(1)}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <button
      onClick={() => onToggle(card)}
      className="w-full flex items-center gap-3 py-3 text-left active:opacity-70 transition-opacity"
      style={{ borderBottom: last ? "none" : `1px solid ${RULE}` }}
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: selected ? "#F2EDE3" : "#F7F3EA", boxShadow: `inset 0 0 0 1px ${RULE}` }}>
        <SubTypeIcon subType={place.sub_type ?? ""} color={INK} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate" style={{ fontFamily: DM, fontWeight: 500, fontSize: "14px", color: INK, letterSpacing: "-0.005em" }}>{place.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {meta && <span className="truncate" style={{ fontFamily: DM, fontSize: "11.5px", color: CAP, letterSpacing: "-0.005em" }}>{meta}</span>}
          {scheduled && (
            <span className="inline-flex items-center gap-1 flex-shrink-0">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={CAP} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              <span style={{ ...SMALL_CAPS, fontSize: "9px", fontWeight: 500, color: CAP }}>Scheduled</span>
            </span>
          )}
        </div>
      </div>
      {/* Selection ring → ink fill + check */}
      {selected ? (
        <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center flex-shrink-0" style={{ background: INK }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FAF7F2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </span>
      ) : (
        <span className="w-[22px] h-[22px] rounded-full flex-shrink-0" style={{ boxShadow: "inset 0 0 0 1.4px rgba(26,26,46,0.20)" }} />
      )}
    </button>
  );
}

export default function LinkPlaceSheet(props: Props) {
  const { tripId, onClose } = props;
  const isCreate = props.mode === "create";
  // Create mode shows every saved place (no type filter); link mode filters.
  const cardType = props.mode === "link" ? props.cardType : null;

  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY    = useRef(0);
  const dragging = useRef(false);

  const [places,  setPlaces]  = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");

  // Link mode: forward the picked place to the caller (unchanged behavior).
  const handleLinkClick = (card: Card) => { if (props.mode === "link") props.onLink(card); };

  // Create mode (WS2, multi-select): tapping a row toggles selection; the
  // footer "Add N" button commits. Selection is keyed by card.id and survives
  // search filtering.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleToggle = (card: Card) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(card.id)) next.delete(card.id); else next.add(card.id);
      return next;
    });
  };

  // Commit places one new in_itinerary card per selection — in SHEET ORDER
  // (group order, then in-group order), never tap order. Inserts run
  // sequentially so each reads the prior's row when computing the live max,
  // keeping positions contiguous. The saved cards are never touched.
  const handleCommit = useCallback(async () => {
    if (props.mode !== "create" || selectedIds.size === 0) return;
    const ordered = TYPE_ORDER.flatMap((type) =>
      places.filter((p) => p.place!.type === type && selectedIds.has(p.id)));
    const created: Card[] = [];
    for (const card of ordered) {
      if (!card.place_id) continue;
      const newCard = await scheduleCardOnDay(supabase, {
        tripId, dayId: props.day.id, placeId: card.place_id, place: card.place,
      });
      if (newCard) created.push(newCard);
    }
    if (created.length) props.onAdded?.(created);
    onClose();
  }, [props, selectedIds, places, supabase, tripId, onClose]);

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

  // Fetch this trip's interested cards that have a linked place, then filter by
  // the card's declared type CLIENT-SIDE — at the TYPE level only (never
  // sub_type). A card with no type shows every saved place. Trip card counts
  // are small, so this sidesteps PostgREST embedded-filter syntax entirely.
  useEffect(() => {
    supabase
      .from("cards")
      .select(`
        *,
        place:places (
          id, title, type, sub_type, lat, lng, address, google_place_id, cover_image_url, rating, price_level
        )
      `)
      .eq("trip_id", tripId)
      .eq("status", "interested")
      .not("place_id", "is", null)
      .then(({ data }) => {
        const raw   = ((data ?? []) as Card[]).filter((c) => c.place);
        const typed = cardType ? raw.filter((c) => c.place!.type === cardType) : raw;
        // Dedupe by place_id; prefer the card that already has a cover image.
        const seen = new Map<string, Card>();
        for (const card of typed) {
          const key      = card.place_id!;
          const existing = seen.get(key);
          if (!existing || (card.place!.cover_image_url && !existing.place!.cover_image_url)) {
            seen.set(key, card);
          }
        }
        setPlaces(Array.from(seen.values()));
        setLoading(false);
      });
  }, [tripId, cardType, supabase]);

  // Drag-to-dismiss
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

  // Group lightly by type, in display order. Create mode applies the text filter.
  const q = search.trim().toLowerCase();
  const visible = isCreate && q
    ? places.filter((p) =>
        (p.place!.title ?? "").toLowerCase().includes(q) ||
        (p.place!.address ?? "").toLowerCase().includes(q))
    : places;

  const grouped = TYPE_ORDER
    .map((type) => ({ type, cards: visible.filter((p) => p.place!.type === type) }))
    .filter((g) => g.cards.length > 0);

  const subtitle = cardType
    ? `Showing ${TYPE_LABEL[cardType].toLowerCase()} places`
    : "Showing all saved places";

  const emptyCopy = isCreate
    ? (q ? "No saved places match your search" : "No places saved yet — find them on the Map")
    : cardType
      ? `No ${TYPE_LABEL[cardType].toLowerCase()} places saved yet`
      : "No places saved yet — find them on the Map";

  // Create-mode header data.
  const scheduledIds = props.mode === "create" ? props.scheduledPlaceIds : null;
  const createDow = props.mode === "create" && props.day.date
    ? new Date(props.day.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" })
    : null;
  const createDayLabel = props.mode === "create"
    ? `Day ${props.day.day_number}${createDow ? ` · ${createDow}` : ""}`
    : "";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" />

      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[75dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform", ...(isCreate ? { background: "#FAF7F2" } : null) }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0">
          <div className={`w-9 h-[3px] rounded-full ${isCreate ? "" : "bg-gray-200"}`} style={isCreate ? { background: "rgba(26,26,46,0.20)" } : undefined} />
        </div>

        {/* Header */}
        {isCreate ? (
          <div className="px-5 pt-3 pb-4 flex-shrink-0" style={{ borderBottom: `1px solid ${RULE}` }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p style={{ ...SMALL_CAPS, fontSize: "9.5px", color: CAP }}>{createDayLabel}</p>
                <h3 style={{ fontFamily: PF, fontStyle: "italic", fontWeight: 500, fontSize: "23px", color: INK, letterSpacing: "-0.01em", marginTop: "6px" }}>Add from saved</h3>
              </div>
              <button onClick={onClose} className="p-1 -mr-1 mt-0.5" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={CAP} strokeWidth="1.6" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            {/* Search — client-side filter over the loaded list only */}
            <div className="flex items-center gap-2.5 mt-3.5 px-3.5 py-2.5 rounded-full" style={{ background: "#F2EDE3" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={CAP} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search saved places…"
                className="flex-1 bg-transparent outline-none text-[13px] text-[#1A1A2E] placeholder:text-[rgba(26,26,46,0.40)]"
                style={{ fontFamily: DM, letterSpacing: "-0.005em" }}
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
            <div>
              <h3 className="text-[15px] font-bold text-gray-900">Link place from map</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>
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
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className={`text-[13px] ${isCreate ? "" : "text-gray-400"}`} style={isCreate ? { color: CAP_SOFT } : undefined}>Loading…</p>
            </div>
          ) : (isCreate ? visible.length === 0 : places.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <p className={`text-[13px] font-medium ${isCreate ? "" : "text-gray-500"}`} style={isCreate ? { color: CAP } : undefined}>{emptyCopy}</p>
            </div>
          ) : isCreate ? (
            <div className="px-5">
              {grouped.map(({ type, cards }) => (
                <div key={type}>
                  <div className="pt-4 pb-1.5">
                    <span style={{ ...SMALL_CAPS, fontSize: "9.5px", color: CAP_SOFT }}>{CREATE_LABEL[type]}</span>
                  </div>
                  {cards.map((card, i) => (
                    <CreateRow
                      key={card.id}
                      card={card}
                      scheduled={scheduledIds?.has(card.place_id!) ?? false}
                      selected={selectedIds.has(card.id)}
                      last={i === cards.length - 1}
                      onToggle={handleToggle}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            grouped.map(({ type, cards }) => {
              const color = TYPE_COLOR[type];
              return (
                <div key={type}>
                  {/* Type header */}
                  <div className="flex items-center gap-2 px-5 py-2 bg-gray-50 border-b border-gray-100">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                      {TYPE_LABEL[type]}
                    </span>
                  </div>

                  {cards.map((card) => {
                    const rating = card.place!.rating;
                    return (
                      <button
                        key={card.id}
                        onClick={() => handleLinkClick(card)}
                        className="w-full flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                      >
                        {/* Colored icon dot */}
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: `${color}15` }}
                        >
                          <SubTypeIcon subType={card.place!.sub_type ?? ""} color={color} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">{card.place!.title}</p>
                          {card.place!.address && (
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">{card.place!.address}</p>
                          )}
                          {rating !== null && (
                            <p className="text-[11px] text-amber-500 font-medium mt-0.5">★ {rating.toFixed(1)}</p>
                          )}
                        </div>

                        {/* Chevron */}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Commit bar — create mode only */}
        {isCreate && (
          <div className="flex items-center gap-4 px-5 py-4 flex-shrink-0" style={{ borderTop: `1px solid ${RULE}`, background: "#F7F3EA" }}>
            <span className="flex-1" style={{ fontFamily: PF, fontStyle: "italic", fontSize: "13.5px", color: CAP }}>
              {selectedIds.size === 0 ? "Select places to place on this day." : "The saved pile keeps its copy."}
            </span>
            <button
              onClick={handleCommit}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5"
              style={selectedIds.size === 0
                ? { background: "#F2EDE3", boxShadow: `inset 0 0 0 1px ${RULE}`, color: CAP_SOFT, fontFamily: DM, fontWeight: 600, fontSize: "14px" }
                : { background: INK, color: "#FAF7F2", fontFamily: DM, fontWeight: 600, fontSize: "14px" }}
            >
              {selectedIds.size === 0 ? "Add" : `Add ${selectedIds.size}`}
              {selectedIds.size > 0 && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FAF7F2" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
