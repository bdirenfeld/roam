"use client";

import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import type { Card } from "@/types/database";
import { getIconSVG, PIN_COLORS } from "@/lib/mapPins";
import { createClient } from "@/lib/supabase/client";

export type PlacementFilter = "all" | "placed" | "unplaced";

// ── Sub-type groups shown in the sidebar ─────────────────────
interface SubTypeRow {
  label: string;
  subTypes: string[];
}

interface Group {
  label: string;
  color: string;
  rows: SubTypeRow[];
}

const GROUPS: Group[] = [
  {
    label: "Activity",
    color: "#0D9488",
    rows: [
      { label: "Guided",    subTypes: ["guided", "hosted"] },
      { label: "Wellness",  subTypes: ["wellness"] },
      { label: "Challenge", subTypes: ["challenge"] },
      { label: "Event",     subTypes: ["event"] },
    ],
  },
  {
    label: "Food",
    color: "#F59E0B",
    rows: [
      { label: "Restaurant",   subTypes: ["restaurant", "fine_dining", "street_food"] },
      { label: "Coffee",       subTypes: ["coffee", "coffee_dessert"] },
      { label: "Cocktail Bar", subTypes: ["cocktail_bar", "drinks"] },
    ],
  },
  {
    label: "Logistics",
    color: "#64748B",
    rows: [
      { label: "Hotel",  subTypes: ["hotel"] },
      { label: "Flight", subTypes: ["flight_arrival", "flight_departure"] },
    ],
  },
];

interface Props {
  cards: Card[];
  activeSubTypes: Set<string>;
  setActiveSubTypes: (next: Set<string>) => void;
  placementFilter: PlacementFilter;
  setPlacementFilter: (f: PlacementFilter) => void;
  onCardSelect: (card: Card) => void;
  onCardDelete?: (cardId: string) => void;
}

export default function MapSidebar({
  cards,
  activeSubTypes,
  setActiveSubTypes,
  placementFilter,
  setPlacementFilter,
  onCardSelect,
  onCardDelete,
}: Props) {
  const supabase = createClient();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // Reactive: filter cards by placement before computing counts + lists
  const filteredCards = cards.filter((c) => {
    if (placementFilter === "placed")   return c.status === "in_itinerary";
    if (placementFilter === "unplaced") return c.status === "interested";
    return true;
  });

  function cardsForRow(row: SubTypeRow): Card[] {
    return filteredCards.filter((c) => c.sub_type && row.subTypes.includes(c.sub_type));
  }

  const PLACEMENT_OPTIONS: { value: PlacementFilter; label: string }[] = [
    { value: "all",      label: "All" },
    { value: "placed",   label: "Placed" },
    { value: "unplaced", label: "Unplaced" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* ── Placement filter ── */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Status</p>
        <div className="flex rounded-xl overflow-hidden border border-gray-100">
          {PLACEMENT_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPlacementFilter(value)}
              className={`flex-1 py-2 text-[12px] font-semibold transition-colors ${
                placementFilter === value
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Layer groups ── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {GROUPS.map((group) => {
          const sectionCollapsed = collapsedSections.has(group.label);
          return (
            <div key={group.label}>
              {/* Collapsible section header */}
              <button
                className="flex items-center gap-2 mb-3 w-full hover:opacity-70 transition-opacity"
                onClick={() => toggleSection(group.label)}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: group.color }} />
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide flex-1 text-left">
                  {group.label}
                </p>
                <ChevronDown
                  className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${sectionCollapsed ? "-rotate-90" : ""}`}
                />
              </button>

              {/* Sub-type rows */}
              {!sectionCollapsed && (
                <div className="space-y-0.5">
                  {group.rows.map((row) => {
                    const on       = isRowOn(row);
                    const rowCards = cardsForRow(row);
                    const count    = rowCards.length;
                    const expanded = expandedRows.has(row.label);

                    return (
                      <div key={row.label} className="py-0.5">
                        {/* Row header — entire row is clickable to toggle */}
                        <button
                          className="w-full flex items-center gap-2.5 px-1 py-1.5 rounded-lg hover:bg-gray-50 transition-colors text-left"
                          onClick={() => {
                            toggleRow(row);
                            // If toggling on and has cards, keep expanded state unchanged
                            // If clicking the chevron area, expand — handled by separate chevron button
                          }}
                        >
                          {/* Dot indicator */}
                          <span
                            className="flex-shrink-0 w-3 h-3 rounded-full transition-colors duration-200"
                            style={{ background: on ? group.color : "#D1D5DB" }}
                          />

                          {/* Label */}
                          <span
                            className="flex-1 text-[13px] font-medium truncate transition-colors duration-200"
                            style={{ color: on ? "#111827" : "#9CA3AF" }}
                          >
                            {row.label}
                          </span>

                          {/* Count badge */}
                          {count > 0 && (
                            <span
                              className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0"
                              style={{
                                background: on ? `${group.color}18` : "#F3F4F6",
                                color: on ? group.color : "#9CA3AF",
                              }}
                            >
                              {count}
                            </span>
                          )}

                          {/* Expand chevron — stops propagation so it doesn't toggle the layer */}
                          {count > 0 && (
                            <span
                              role="button"
                              onClick={(e) => { e.stopPropagation(); toggleExpandRow(row.label); }}
                              className="flex-shrink-0 p-0.5 rounded hover:bg-gray-100 transition-colors"
                            >
                              <ChevronDown
                                className={`w-3 h-3 text-gray-300 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
                              />
                            </span>
                          )}
                        </button>

                        {/* Expanded card list */}
                        {expanded && (
                          <div className="mt-0.5 space-y-px pl-1 pr-1">
                            {rowCards.map((card) => {
                              const typeKey  = card.type as keyof typeof PIN_COLORS;
                              const iconColor = PIN_COLORS[typeKey] ?? group.color;
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
                                    <div className="flex items-center rounded-lg hover:bg-gray-50 transition-colors">
                                      <button
                                        onClick={() => onCardSelect(card)}
                                        className="flex-1 flex items-center gap-2 px-2 py-1.5 text-left min-w-0"
                                      >
                                        <span
                                          className="flex-shrink-0 opacity-80"
                                          // eslint-disable-next-line react/no-danger
                                          dangerouslySetInnerHTML={{ __html: getIconSVG(card.sub_type, iconColor, 14) }}
                                        />
                                        <span className="flex-1 text-[12px] text-gray-700 truncate leading-snug">
                                          {card.title}
                                        </span>
                                      </button>
                                      {/* Trash icon — visible on hover */}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
