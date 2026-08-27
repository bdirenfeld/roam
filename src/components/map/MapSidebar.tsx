"use client";

import { useState, useCallback } from "react";
import type { Card, CardType } from "@/types/database";
import { getMaterialIconHTML, PIN_COLORS } from "@/lib/mapPins";
import { createClient } from "@/lib/supabase/client";

// ── Sub-type groups shown in the sidebar ─────────────────────
interface SubTypeRow {
  label: string;
  subTypes: string[];
}

interface Group {
  label: string;
  color: string;
  typeKey: CardType;
  rows: SubTypeRow[];
}

const GROUPS: Group[] = [
  {
    label: "Activity",
    color: "#0D9488",
    typeKey: "activity",
    rows: [
      { label: "Guided",        subTypes: ["guided", "hosted"]  },
      { label: "Self-Directed", subTypes: ["self_directed"]     },
      { label: "Wellness",      subTypes: ["wellness"]          },
      { label: "Event",         subTypes: ["event"]             },
      { label: "Beach",         subTypes: ["beach"]             },
    ],
  },
  {
    label: "Food",
    color: "#7C3AED",
    typeKey: "food",
    rows: [
      { label: "Restaurant", subTypes: ["restaurant", "fine_dining", "street_food"] },
      { label: "Coffee",     subTypes: ["coffee", "coffee_dessert"]                  },
      { label: "Dessert",    subTypes: ["dessert"]                                   },
      { label: "Bar",        subTypes: ["bar", "cocktail_bar", "drinks"]             },
    ],
  },
  {
    label: "Logistics",
    color: "#111827",
    typeKey: "logistics",
    rows: [
      { label: "Hotel",            subTypes: ["hotel"]            },
      { label: "Flight Arrival",   subTypes: ["flight_arrival"]   },
      { label: "Flight Departure", subTypes: ["flight_departure"] },
      { label: "Transit",          subTypes: ["transit"]          },
      { label: "Grocery",          subTypes: ["grocery"]          },
      { label: "Medical",          subTypes: ["medical"]          },
    ],
  },
];

/**
 * Every sub-type the sidebar puts behind a row toggle, flattened.
 *
 * FullMapClient derives its CONTROLLED_SUB_TYPES from this so the two lists
 * can't drift: before, aliases like `coffee_dessert`, `fine_dining` and
 * `cocktail_bar` sat in a sidebar row but not in the controlled set, so
 * switching "Coffee" off left the coffee-dessert pins sitting on the map.
 */
export const SIDEBAR_SUB_TYPES: string[] = GROUPS.flatMap((g) =>
  g.rows.flatMap((r) => r.subTypes),
);

interface Props {
  cards: Card[];
  activeSubTypes: Set<string>;  activeTypes: Set<CardType>;
  setActiveTypes: (next: Set<CardType>) => void;
  activeStatuses: Set<string>;
  setActiveStatuses: (next: Set<string>) => void;
  onCardSelect: (card: Card) => void;
  onCardDelete?: (cardId: string) => void;
}

// ── Pill toggle (28×16 px) ────────────────────────────────────
function PillToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      className="flex-shrink-0"
    >
      <div
        className="relative rounded-full transition-colors duration-200"
        style={{ width: 28, height: 16, background: on ? "#1A1A2E" : "#D1D5DB" }}
      >
        <div
          className="absolute top-0.5 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{
            width: 12, height: 12,
            transform: on ? "translateX(14px)" : "translateX(2px)",
          }}
        />
      </div>
    </button>
  );
}

export default function MapSidebar({
  cards,
  activeSubTypes,  activeTypes,
  setActiveTypes,
  activeStatuses,
  setActiveStatuses,
  onCardSelect,
  onCardDelete,
}: Props) {
  const supabase = createClient();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [expandedRows,      setExpandedRows]      = useState<Set<string>>(new Set());
  const [confirmDeleteId,   setConfirmDeleteId]   = useState<string | null>(null);
  const [deletingId,        setDeletingId]        = useState<string | null>(null);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);
  const [focusedCardId,     setFocusedCardId]     = useState<string | null>(null);

  const handleDeleteCard = useCallback(async (cardId: string) => {
    setDeletingId(cardId);
    const { error } = await supabase.from("cards").delete().eq("id", cardId);
    setDeletingId(null);
    if (error) {
      setConfirmDeleteId(null);
      setDeleteError("Couldn't delete — try again.");
      setTimeout(() => setDeleteError(null), 3000);
      return;
    }
    setConfirmDeleteId(null);
    onCardDelete?.(cardId);
  }, [onCardDelete, supabase]);

  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }

  function toggleExpandRow(key: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }

  function toggleTopLevelType(typeKey: CardType) {
    const next = new Set(activeTypes);
    if (next.has(typeKey)) { next.delete(typeKey); } else { next.add(typeKey); }
    setActiveTypes(next);
  }

  function isRowOn(row: SubTypeRow): boolean {
    return row.subTypes.some((st) => activeSubTypes.has(st));
  }

  function cardsForRow(row: SubTypeRow): Card[] {
    return cards.filter(
      (c) => c.place?.sub_type != null && row.subTypes.includes(c.place.sub_type) && c.place.lat != null && c.place.lng != null,
    );
  }

  function handleCardClick(card: Card) {
    setFocusedCardId((prev) => (prev === card.id ? null : card.id));
    onCardSelect(card);
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#FAF7F2" }}>
      <div className="flex-1 overflow-y-auto" style={{ padding: "14px 18px" }}>

        {/* ── Status filter pills ── */}
        <p className="text-[9.5px] tracking-[0.18em] uppercase font-semibold mb-2.5" style={{ color: "rgba(26,26,46,0.55)" }}>Status</p>
        <div className="flex items-center gap-2 mb-1">
          {(
            [
              { status: "interested",   label: "Interested", hollow: true  },
              { status: "in_itinerary", label: "Scheduled",  hollow: false },
            ] as Array<{ status: string; label: string; hollow: boolean }>
          ).map(({ status, label, hollow }) => {
            const isActive = activeStatuses.has(status);
            return (
              <button
                key={status}
                onClick={() => {
                  const next = new Set(activeStatuses);
                  if (isActive) next.delete(status); else next.add(status);
                  setActiveStatuses(next);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition-all border"
                style={
                  isActive
                    ? { background: "#6B728015", color: "#374151", borderColor: "#6B7280" }
                    : { background: "transparent", color: "#9CA3AF", borderColor: "#D1D5DB" }
                }
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0,
                  ...(isActive
                    ? (hollow ? { border: "1.5px solid #6B7280" } : { background: "#6B7280" })
                    : { background: "#D1D5DB" }
                  ),
                }} />
                {label}
              </button>
            );
          })}
        </div>

        <hr className="my-3" style={{ borderTopColor: "rgba(26,26,46,0.10)" }} />

        {/* ── Category groups ── */}
        {GROUPS.map((group, index) => {
          const sectionCollapsed = collapsedSections.has(group.label);
          const typeOn           = activeTypes.has(group.typeKey);

          return (
            <div key={group.label}>
              {/* Category header: caret+label expands/collapses; PillToggle on right */}
              <div className="flex items-center gap-2 mb-1">
                <button
                  type="button"
                  className="flex items-center gap-1.5 flex-1 min-w-0 py-1.5 text-left"
                  onClick={() => toggleSection(group.label)}
                  aria-expanded={!sectionCollapsed}
                  aria-label={`${group.label} categories`}
                >
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round"
                    aria-hidden="true"
                    className="flex-shrink-0 transition-transform duration-200"
                    style={{ transform: sectionCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span className="text-[9.5px] tracking-[0.18em] uppercase font-semibold" style={{ color: "rgba(26,26,46,0.55)" }}>
                    {group.label}
                  </span>
                </button>
                <PillToggle
                  on={typeOn}
                  onToggle={() => toggleTopLevelType(group.typeKey)}
                  label={`${typeOn ? "Hide" : "Show"} all ${group.label} pins`}
                />
              </div>

              {/* Subcategory rows */}
              {!sectionCollapsed && (
                <div
                  className={`mb-2 rounded-lg overflow-hidden transition-opacity duration-200 ${typeOn ? "" : "opacity-40 pointer-events-none"}`}
                >
                  {group.rows.map((row) => {
                    const on       = isRowOn(row);
                    const rowCards = cardsForRow(row);
                    const count    = rowCards.length;
                    const expanded = expandedRows.has(row.label);

                    return (
                      <div key={row.label}>
                        {/* Sub-category row = navigation, nothing else. Tap it
                            to see the places under it. Visibility lives at the
                            top of the sidebar (status pills + the three type
                            toggles) — putting a switch on every line turned a
                            list you read into a control panel you fight. */}
                        <div className="w-full flex items-center pl-2 py-2 select-none">
                          <button
                            type="button"
                            onClick={() => toggleExpandRow(row.label)}
                            disabled={count === 0}
                            aria-expanded={count > 0 ? expanded : undefined}
                            aria-label={`${row.label} — ${count} ${count === 1 ? "place" : "places"}`}
                            className="flex-1 min-w-0 flex items-center gap-2 pr-2 text-left disabled:cursor-default"
                          >
                            <svg
                              width="10" height="10" viewBox="0 0 24 24" fill="none"
                              stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round"
                              aria-hidden="true"
                              className="flex-shrink-0 transition-transform duration-200"
                              style={{
                                transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                                opacity: count > 0 ? 1 : 0,
                              }}
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>

                            {/* Label */}
                            <span
                              title={row.label}
                              className="flex-1 min-w-0 truncate text-[13px] transition-opacity duration-200"
                              style={{ color: "#1A1A2E", opacity: on ? 1 : 0.25 }}
                            >
                              {row.label}
                            </span>

                            {/* Count badge */}
                            {count > 0 && (
                              <span
                                className="text-[12px] flex-shrink-0 transition-opacity duration-200"
                                style={{ color: "rgba(26,26,46,0.45)", opacity: on ? 1 : 0.25 }}
                              >
                                {count}
                              </span>
                            )}
                          </button>
                        </div>

                        {/* Expanded card list — deep level */}
                        {expanded && (
                          <div className="pb-2 space-y-px">
                            {rowCards.map((card) => {
                              const typeKey_     = card.place!.type as keyof typeof PIN_COLORS;
                              const iconColor    = PIN_COLORS[typeKey_] ?? group.color;
                              const isConfirming = confirmDeleteId === card.id;
                              const isDeleting_  = deletingId === card.id;
                              const isFocused    = focusedCardId === card.id;
                              return (
                                <div key={card.id} className="group relative">
                                  {isConfirming ? (
                                    <div className="flex items-center gap-1.5 pl-12 pr-3 py-1.5 rounded-lg bg-red-50">
                                      <span className="flex-1 text-[11px] text-red-600 font-medium truncate">
                                        {isDeleting_ ? "Deleting…" : "Delete this card?"}
                                      </span>
                                      {!isDeleting_ && (
                                        <>
                                          <button
                                            onClick={() => handleDeleteCard(card.id)}
                                            className="text-[11px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-md flex-shrink-0"
                                          >
                                            Delete
                                          </button>
                                          <button
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="text-[11px] text-gray-500 flex-shrink-0"
                                          >
                                            Cancel
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ) : (
                                    // The selected place is marked by lifting IT,
                                    // never by dimming everything else — greying
                                    // out the whole list to point at one row
                                    // punishes the other 20 for not being tapped.
                                    <div
                                      className="flex items-center rounded-lg transition-colors duration-200"
                                      style={{
                                        background: isFocused ? "#FFFFFF" : undefined,
                                        boxShadow: isFocused
                                          ? "inset 0 0 0 1px rgba(26,26,46,0.12)"
                                          : undefined,
                                      }}
                                    >
                                      <button
                                        onClick={() => handleCardClick(card)}
                                        className="flex-1 flex items-center gap-2 pl-12 pr-2 py-1.5 text-left min-w-0 rounded-lg hover:bg-white/60 transition-colors duration-200"
                                      >
                                        <span
                                          className="flex-shrink-0"
                                          style={{ color: iconColor, opacity: isFocused ? 1 : 0.7 }}
                                          // eslint-disable-next-line react/no-danger
                                          dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(card.place!.sub_type, 12) }}
                                        />
                                        <span
                                          className="flex-1 text-[11px] italic truncate leading-snug"
                                          style={{
                                            color: isFocused ? "#1A1A2E" : "#4B5563",
                                            fontWeight: isFocused ? 600 : 400,
                                          }}
                                        >
                                          {card.place!.title}
                                        </span>
                                      </button>
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(card.id); }}
                                        className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-red-50 transition-all mr-1"
                                        aria-label="Delete card"
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="3 6 5 6 21 6" />
                                          <path d="M19 6l-1 14H6L5 6" />
                                          <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                                        </svg>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {deleteError && (
                              <p className="text-[11px] text-red-500 pl-12 py-1">{deleteError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {index < GROUPS.length - 1 && (
                <hr className="my-3" style={{ borderTopColor: "rgba(26,26,46,0.10)" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* The old "Enrich all cards" repair button is gone (Brennan, Aug 26) —
          /api/places/enrich-trip still exists for manual repairs if ever needed. */}
    </div>
  );
}
