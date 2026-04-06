"use client";

import { useState } from "react";
import { SectionLabel } from "./FieldRow";

// ── ArrayField ─────────────────────────────────────────────────
// Array of plain strings.  Each item is independently editable.
// "+" adds a new item. "×" removes one.
// If onSave is undefined the list is read-only.

interface Props {
  label: string;
  items: string[];
  placeholder?: string;
  newItemPlaceholder?: string;
  onSave?: (items: string[]) => void;
  /** Tailwind bg class for the bullet dot, e.g. "bg-activity" */
  bulletClass?: string;
  /** When true, renders nothing if items is empty. */
  hideWhenEmpty?: boolean;
}

export default function ArrayField({
  label,
  items,
  placeholder = "Nothing added yet",
  newItemPlaceholder = "Add item…",
  onSave,
  bulletClass = "bg-gray-300",
  hideWhenEmpty = false,
}: Props) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState("");

  if (hideWhenEmpty && items.length === 0) return null;

  const commitEdit = (i: number) => {
    setEditIdx(null);
    const trimmed = editVal.trim();
    if (!trimmed) {
      onSave?.(items.filter((_, idx) => idx !== i));
    } else if (trimmed !== items[i]) {
      const next = [...items];
      next[i] = trimmed;
      onSave?.(next);
    }
  };

  const commitAdd = () => {
    setAdding(false);
    setNewVal("");
    const trimmed = newVal.trim();
    if (trimmed) onSave?.([...items, trimmed]);
  };

  const remove = (i: number) => {
    onSave?.(items.filter((_, idx) => idx !== i));
  };

  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${bulletClass} mt-1.5 flex-shrink-0`}
            />
            {editIdx === i ? (
              <input
                autoFocus
                value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onBlur={() => commitEdit(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitEdit(i); }
                  if (e.key === "Escape") setEditIdx(null);
                }}
                className="flex-1 text-sm text-gray-800 bg-gray-50 rounded px-2 py-0.5 outline-none border border-gray-200 focus:border-blue-300"
              />
            ) : (
              <span
                onClick={() => {
                  if (onSave) { setEditIdx(i); setEditVal(item); }
                }}
                className={`flex-1 text-sm text-gray-700 leading-snug ${onSave ? "cursor-pointer hover:text-gray-900" : ""}`}
              >
                {item}
              </span>
            )}
            {onSave && editIdx !== i && (
              <button
                onClick={() => remove(i)}
                className="flex-shrink-0 text-gray-200 hover:text-gray-500 text-xl leading-none mt-0.5"
                aria-label="Remove"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {items.length === 0 && !adding && (
          <p className="text-sm text-gray-300 italic pl-4">{placeholder}</p>
        )}

        {adding && (
          <div className="flex items-start gap-2.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${bulletClass} mt-1.5 flex-shrink-0`}
            />
            <input
              autoFocus
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              placeholder={newItemPlaceholder}
              onBlur={commitAdd}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitAdd(); }
                if (e.key === "Escape") { setAdding(false); setNewVal(""); }
              }}
              className="flex-1 text-sm text-gray-800 bg-gray-50 rounded px-2 py-0.5 outline-none border border-gray-200 focus:border-blue-300 placeholder:text-gray-300"
            />
          </div>
        )}
      </div>

      {onSave && (
        <button
          onClick={() => { setAdding(true); setNewVal(""); }}
          className="mt-3 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 pl-4"
        >
          <span className="font-bold text-sm leading-none">+</span> Add
        </button>
      )}
    </div>
  );
}
