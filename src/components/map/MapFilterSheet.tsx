"use client";

// ── The map's filter, on a phone ──────────────────────────────────────────
// Two things this fixes, both Brennan's, 10 Sept 2026.
//
// 1. "When you press something it turns it off. If you press Food it doesn't
//    just show you everything food-related." Right: tapping a filter should
//    narrow to it. So a tap ISOLATES — Food shows the food and nothing else —
//    a second tap on the last thing selected goes back to everything, and
//    tapping a second group adds it. The old behaviour needed two taps to
//    isolate and read backwards.
//
// 2. The sheet is SHORT (42dvh) and applies live, so the pins change while
//    you are choosing. A filter you cannot watch is a filter you apply
//    blind and then reveal.
//
// The rows, the groups and their counts are the desktop sidebar's, so the
// two doors show one state. Kinds with nothing on this journey are not
// listed: a row reading "Medical 0" is furniture.

import { useState } from "react";
import { Heart } from "@phosphor-icons/react";
import type { Card, CardType } from "@/types/database";
import { useEscapeKey } from "@/hooks/useEscapeKey";

const INK = "#1A1A2E";
const SIENNA = "#B0541F";
const CAPTION = "rgba(26,26,46,0.62)";

interface Row { label: string; subTypes: string[] }
interface Group { label: string; color: string; typeKey: CardType; rows: Row[] }

/** Mirrors MapSidebar's GROUPS — same labels, same sub-type sets. */
const GROUPS: Group[] = [
  {
    label: "Activity", color: "#0D9488", typeKey: "activity",
    rows: [
      { label: "Tour", subTypes: ["guided", "hosted"] },
      { label: "Race", subTypes: ["challenge"] },
      { label: "Explore", subTypes: ["self_directed"] },
      { label: "Wellness", subTypes: ["wellness"] },
      { label: "Event", subTypes: ["event"] },
      { label: "Beach", subTypes: ["beach"] },
    ],
  },
  {
    label: "Food", color: "#7C3AED", typeKey: "food",
    rows: [
      { label: "Restaurant", subTypes: ["restaurant", "fine_dining", "street_food"] },
      { label: "Coffee", subTypes: ["coffee", "coffee_dessert"] },
      { label: "Dessert", subTypes: ["dessert"] },
      { label: "Bar", subTypes: ["bar", "cocktail_bar", "drinks"] },
    ],
  },
  {
    label: "Logistics", color: "#111827", typeKey: "logistics",
    rows: [
      { label: "Hotel", subTypes: ["hotel", "accommodation"] },
      { label: "Flight Arrival", subTypes: ["flight_arrival"] },
      { label: "Flight Departure", subTypes: ["flight_departure"] },
      { label: "Transit", subTypes: ["transit"] },
      { label: "Grocery", subTypes: ["grocery"] },
      { label: "Pet care", subTypes: ["pet_care"] },
      { label: "Medical", subTypes: ["medical"] },
    ],
  },
];

const ALL_TYPES: CardType[] = ["activity", "food", "logistics"];
const ALL_SUB_TYPES = GROUPS.flatMap((g) => g.rows.flatMap((r) => r.subTypes));
const ALL_STATUSES = ["interested", "in_itinerary"];

export interface FilterState {
  activeTypes: Set<CardType>;
  activeSubTypes: Set<string>;
  activeStatuses: Set<string>;
  lovedOnly: boolean;
}

/** How many kinds the map is narrowed to; 0 when everything shows. */
export function narrowedCount(s: FilterState): number {
  let n = 0;
  if (s.activeTypes.size < ALL_TYPES.length) n += ALL_TYPES.length - s.activeTypes.size;
  const rowsOff = GROUPS.flatMap((g) => g.rows).filter(
    (r) => !r.subTypes.some((st) => s.activeSubTypes.has(st)),
  ).length;
  n += rowsOff;
  if (s.activeStatuses.size < ALL_STATUSES.length) n += ALL_STATUSES.length - s.activeStatuses.size;
  if (s.lovedOnly) n += 1;
  return n;
}

interface Props {
  cards: Card[];
  state: FilterState;
  onTypes: (next: Set<CardType>) => void;
  onSubTypes: (next: Set<string>) => void;
  onStatuses: (next: Set<string>) => void;
  onLoved: (next: boolean) => void;
  onClose: () => void;
}

export default function MapFilterSheet({ cards, state, onTypes, onSubTypes, onStatuses, onLoved, onClose }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  useEscapeKey(onClose);

  const visible = cards.filter((c) => c.place?.lat != null && c.place?.lng != null);
  const countFor = (subTypes: string[]) =>
    visible.filter((c) => c.place?.sub_type != null && subTypes.includes(c.place.sub_type) && (!state.lovedOnly || c.place.loved === true)).length;
  const countForType = (t: CardType) =>
    visible.filter((c) => c.place?.type === t && (!state.lovedOnly || c.place?.loved === true)).length;

  const groups = GROUPS.map((g) => ({
    ...g,
    rows: g.rows.map((r) => ({ ...r, count: countFor(r.subTypes) })).filter((r) => r.count > 0),
    count: countForType(g.typeKey),
  })).filter((g) => g.count > 0);

  const allTypesOn = state.activeTypes.size >= ALL_TYPES.length;
  const rowOn = (r: Row) => r.subTypes.some((st) => state.activeSubTypes.has(st));

  /** A tap narrows to this group; the last one selected, tapped again, shows everything. */
  function tapGroup(g: CardType) {
    if (allTypesOn) { onTypes(new Set([g])); return; }
    const next = new Set(state.activeTypes);
    if (next.has(g)) {
      if (next.size === 1) { onTypes(new Set(ALL_TYPES)); onSubTypes(new Set(ALL_SUB_TYPES)); return; }
      next.delete(g);
    } else {
      next.add(g);
    }
    onTypes(next);
  }

  /** A tap on a kind narrows to that kind; tapping it again opens the group back up. */
  function tapRow(group: Group & { rows: (Row & { count: number })[] }, row: Row) {
    const groupSubs = group.rows.flatMap((r) => r.subTypes);
    const onRows = group.rows.filter(rowOn);
    const isolated = onRows.length === 1 && onRows[0].label === row.label;
    const next = new Set(state.activeSubTypes);
    if (isolated) {
      groupSubs.forEach((st) => next.add(st));            // back to the whole group
    } else if (onRows.length === group.rows.length) {
      groupSubs.forEach((st) => next.delete(st));         // narrow to this kind
      row.subTypes.forEach((st) => next.add(st));
      onTypes(new Set([group.typeKey]));
    } else if (rowOn(row)) {
      row.subTypes.forEach((st) => next.delete(st));      // drop it from the few showing
    } else {
      row.subTypes.forEach((st) => next.add(st));         // add it back
    }
    onSubTypes(next);
  }

  function tapStatus(s: string) {
    const cur = state.activeStatuses;
    if (cur.size >= ALL_STATUSES.length) { onStatuses(new Set([s])); return; }
    const next = new Set(cur);
    if (next.has(s)) {
      if (next.size === 1) { onStatuses(new Set(ALL_STATUSES)); return; }
      next.delete(s);
    } else next.add(s);
    onStatuses(next);
  }

  function showAll() {
    onTypes(new Set(ALL_TYPES));
    onSubTypes(new Set(ALL_SUB_TYPES));
    onStatuses(new Set(ALL_STATUSES));
    onLoved(false);
  }

  const narrowed = narrowedCount(state);

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex items-end justify-center pointer-events-none" role="dialog" aria-label="Filter">
      <div
        className="relative w-full max-w-mobile bg-white rounded-t-2xl shadow-sheet flex flex-col pointer-events-auto"
        style={{ maxHeight: "42dvh" }}
      >
        <div className="flex justify-center pt-2.5 pb-1 flex-shrink-0">
          <span className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>
        <div className="flex items-center justify-between px-5 pb-2 flex-shrink-0">
          <h2 className="font-display italic" style={{ fontSize: 21, fontWeight: 500, color: INK }}>Filter</h2>
          <div className="flex items-center gap-3">
            {narrowed > 0 && (
              <button type="button" onClick={showAll} className="text-[13px] font-medium" style={{ color: CAPTION }}>Show all</button>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pb-5">
          <div className="flex gap-2 px-5 pb-3">
            {[{ s: "interested", label: "Saved" }, { s: "in_itinerary", label: "Scheduled" }].map(({ s, label }) => {
              const on = state.activeStatuses.has(s) && state.activeStatuses.size < ALL_STATUSES.length;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => tapStatus(s)}
                  aria-pressed={on}
                  className="h-9 px-3.5 rounded-full text-[13px] font-medium"
                  style={on ? { background: INK, color: "#fff" } : { color: INK, border: "1px solid rgba(26,26,46,0.2)" }}
                >
                  {label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onLoved(!state.lovedOnly)}
              aria-pressed={state.lovedOnly}
              className="h-9 px-3.5 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5"
              style={state.lovedOnly ? { background: SIENNA, color: "#fff" } : { color: INK, border: "1px solid rgba(26,26,46,0.2)" }}
            >
              <Heart size={13} weight={state.lovedOnly ? "fill" : "light"} />
              Loved
            </button>
          </div>

          {groups.map((g) => {
            const typeOn = state.activeTypes.has(g.typeKey);
            const narrowedToIt = typeOn && !allTypesOn;
            const expanded = open === g.label;
            return (
              <div key={g.label}>
                <div className="flex items-center gap-3 px-5 h-11 border-t" style={{ borderColor: "rgba(26,26,46,0.07)" }}>
                  <button
                    type="button"
                    onClick={() => tapGroup(g.typeKey)}
                    aria-pressed={narrowedToIt}
                    className="flex-1 flex items-center gap-2.5 text-left"
                    style={{ opacity: typeOn ? 1 : 0.4 }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: g.color }} />
                    <span className="text-[15px]" style={{ color: INK, fontWeight: narrowedToIt ? 600 : 400 }}>{g.label}</span>
                    <span className="text-[13px] tabular-nums" style={{ color: CAPTION }}>{g.count}</span>
                  </button>
                  {g.rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : g.label)}
                      aria-expanded={expanded}
                      aria-label={`${g.label} kinds`}
                      className="w-9 h-9 inline-flex items-center justify-center"
                      style={{ color: CAPTION }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: expanded ? "none" : "rotate(-90deg)", transition: "transform 150ms" }}>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                  )}
                </div>
                {expanded && g.rows.map((r) => {
                  const on = rowOn(r) && typeOn;
                  const onRows = g.rows.filter(rowOn);
                  const isolated = typeOn && !allTypesOn && onRows.length === 1 && onRows[0].label === r.label;
                  return (
                    <button
                      key={r.label}
                      type="button"
                      onClick={() => tapRow(g, r)}
                      aria-pressed={isolated}
                      className="w-full flex items-center gap-2.5 pl-11 pr-5 h-11 text-left border-t"
                      style={{ borderColor: "rgba(26,26,46,0.05)", opacity: on ? 1 : 0.4 }}
                    >
                      <span className="flex-1 text-[14px]" style={{ color: INK, fontWeight: isolated ? 600 : 400 }}>{r.label}</span>
                      <span className="text-[13px] tabular-nums" style={{ color: CAPTION }}>{r.count}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
