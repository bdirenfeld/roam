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
      { label: "Bar",        subTypes: ["bar", "cocktail_bar", "drinks"]              },
    ],
  },
  {
    label: "Stay",
    color: "#111827",
    typeKey: "logistics",
    rows: [
      { label: "Hotel",            subTypes: ["hotel"]              },
      { label: "Flight Arrival",   subTypes: ["flight_arrival"]     },
      { label: "Flight Departure", subTypes: ["flight_departure"]   },
    ],
  },
];

interface Props {
  tripId: string;
  cards: Card[];
  activeSubTypes: Set<string>;
  setActiveSubTypes: (next: Set<string>) => void;
  activeTypes: Set<CardType>;
  setActiveTypes: (next: Set<CardType>) => void;
  activeStatuses: Set<string>;
  setActiveStatuses: (next: Set<string>) => void;
  onCardSelect: (card: Card) => void;
  onCardDelete?: (cardId: string) => void;
}

// ── Pill toggle (28×16 px) ────────────────────────────────────
function PillToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-pressed={on}
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

// ── Checkbox ──────────────────────────────────────────────────
function Checkbox({ on }: { on: boolean }) {
  return (
    <div
      className="w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors duration-200 flex-shrink-0"
      style={{ background: on ? "#1A1A2E" : "white", borderColor: on ? "#1A1A2E" : "#D1D5DB" }}
    >
      {on && (
        <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

export default function MapSidebar({
  tripId,
  cards,
  activeSubTypes,
  setActiveSubTypes,
  activeTypes,
  setActiveTypes,
  activeStatuses,
  setActiveStatuses,
  onCardSelect,
  onCardDelete,
}: Props) {
  const supabase = createClient();
  // Categories start expanded (not in collapsedSections)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [expandedRows,      setExpandedRows]      = useState<Set<string>>(new Set());
  const [confirmDeleteId,   setConfirmDeleteId]   = useState<string | null>(null);
  const [deletingId,        setDeletingId]        = useState<string | null>(null);
  const [deleteError,       setDeleteError]       = useState<string | null>(null);

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

  function toggleRow(row: SubTypeRow) {
    const next = new Set(activeSubTypes);
    if (isRowOn(row)) {
      row.subTypes.forEach((st) => next.delete(st));
    } else {
      row.subTypes.forEach((st) => next.add(st));
    }
    setActiveSubTypes(next);
  }

  function cardsForRow(row: SubTypeRow): Card[] {
    return cards.filter(
      (c) => c.sub_type && row.subTypes.includes(c.sub_type) && c.lat != null && c.lng != null,
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 py-4">

        {/* ── Status filter pills ── */}
        <p className="text-[9px] tracking-[0.14em] uppercase font-medium text-gray-400 mb-2">Status</p>
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

        <hr className="border-t border-gray-100 my-3" />

        {/* ── Category groups ── */}
        {GROUPS.map((group, index) => {
          const sectionCollapsed = collapsedSections.has(group.label);
          const typeOn           = activeTypes.has(group.typeKey);

          return (
            <div key={group.label}>
              {/* Category header row */}
              <div className="flex items-center gap-2 mb-1">
                {/* Left: caret + label — clicking expands/collapses */}
                <button
                  className="flex items-center gap-1.5 flex-1 min-w-0 py-1.5 text-left"
                  onClick={() => toggleSection(group.label)}
                >
                  <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round"
                    className="flex-shrink-0 transition-transform duration-200"
                    style={{ transform: sectionCollapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  <span className="text-[9px] tracking-[0.14em] uppercase font-medium text-gray-500">
                    {group.label}
                  </span>
                </button>

                {/* Right: pill toggle — turns category on/off */}
                <PillToggle on={typeOn} onToggle={() => toggleTopLevelType(group.typeKey)} />
              </div>

              {/* Subcategory rows */}
              {!sectionCollapsed && (
                <div
                  className={`mb-2 rounded-lg overflow-hidden transition-opacity duration-200 ${typeOn ? "" : "opacity-40 pointer-events-none"}`}
                  style={{ background: "#F9FAFB" }}
                >
                  {group.rows.map((row) => {
                    const on       = isRowOn(row);
                    const rowCards = cardsForRow(row);
                    const count    = rowCards.length;
                    const expanded = expandedRows.has(row.label);

                    return (
                      <div key={row.label}>
                        {/* Sub-category row — tap row to expand/collapse, checkbox toggles visibility */}
                        <button
                          className="w-full flex items-center gap-2 pl-6 pr-3 py-2 text-left"
                          onClick={() => count > 0 && toggleExpandRow(row.label)}
                        >
                          {/* Left caret — only shown when row has cards */}
                          <svg
                            width="10" height="10" viewBox="0 0 24 24" fill="none"
                            stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round"
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
                            className="flex-1 text-sm transition-colors duration-200"
                            style={{ color: on ? "#111827" : "#9CA3AF" }}
                          >
                            {row.label}
                          </span>

                          {/* Count badge */}
                          {count > 0 && (
                            <span className="text-[10px] text-gray-400 flex-shrink-0 mr-1">{count}</span>
                          )}

                          {/* Checkbox — stopPropagation so it doesn't expand/collapse */}
                          <span onClick={(e) => { e.stopPropagation(); toggleRow(row); }}>
                            <Checkbox on={on} />
                          </span>
                        </button>

                        {/* Expanded card list */}
                        {expanded && (
                          <div className="pl-8 pr-3 pb-2 space-y-px">
                            {rowCards.map((card) => {
                              const typeKey_     = card.type as keyof typeof PIN_COLORS;
                              const iconColor    = PIN_COLORS[typeKey_] ?? group.color;
                              const isConfirming = confirmDeleteId === card.id;
                              const isDeleting_  = deletingId === card.id;
                              return (
                                <div key={card.id} className="group relative">
                                  {isConfirming ? (
                                    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-red-50">
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
                                    <div className="flex items-center rounded-lg hover:bg-gray-100 transition-colors">
                                      <button
                                        onClick={() => onCardSelect(card)}
                                        className="flex-1 flex items-center gap-2 px-2 py-1.5 text-left min-w-0"
                                      >
                                        <span
                                          className="flex-shrink-0 opacity-80"
                                          style={{ color: iconColor }}
                                          // eslint-disable-next-line react/no-danger
                                          dangerouslySetInnerHTML={{ __html: getMaterialIconHTML(card.sub_type, 14) }}
                                        />
                                        <span className="flex-1 text-[12px] text-gray-700 truncate leading-snug">
                                          {card.title}
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
                              <p className="text-[11px] text-red-500 px-2 py-1">{deleteError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {index < GROUPS.length - 1 && (
                <hr className="border-t border-gray-100 my-2" />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Enrich button (temporary utility) ── */}
      <button
        onClick={async () => {
          const res = await fetch("/api/places/enrich-trip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tripId }),
          });
          const data = await res.json() as { enriched: number; total: number };
          alert(`Enriched ${data.enriched} of ${data.total} cards`);
        }}
        className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 border-t border-gray-100 mt-2 flex-shrink-0"
      >
        Enrich all cards
      </button>
    </div>
  );
}
