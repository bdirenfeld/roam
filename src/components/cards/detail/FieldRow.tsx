"use client";

import { useState, useEffect } from "react";

// ── Shared section heading ─────────────────────────────────────
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.08em] mb-3">
      {children}
    </p>
  );
}

// ── FieldRow ───────────────────────────────────────────────────
// Consistent labelled row with tap-to-edit.
// - Single-line: blur or Return commits
// - Multiline:   blur commits (Shift+Enter = newline still works)
// - If onSave is undefined the field is read-only.
// - Empty fields show a greyed italic placeholder.

interface FieldRowProps {
  icon?: React.ReactNode;
  /** Optional label rendered in small caps above the value. */
  label?: string;
  value?: string | null;
  placeholder?: string;
  onSave?: (value: string) => void;
  multiline?: boolean;
  /** When true, renders nothing if the value is empty. */
  hideWhenEmpty?: boolean;
}

export default function FieldRow({
  icon,
  label,
  value,
  placeholder = "Add…",
  onSave,
  multiline = false,
  hideWhenEmpty = false,
}: FieldRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  // Sync when value is changed externally (optimistic revert, etc.)
  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (onSave && trimmed !== (value ?? "")) {
      onSave(trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setDraft(value ?? "");
      setEditing(false);
    }
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  const canEdit = !!onSave;
  const isEmpty = !value;

  if (hideWhenEmpty && isEmpty) return null;

  return (
    <div className="flex items-start gap-3">
      {icon != null && (
        <span className="flex-shrink-0 w-5 text-center text-base mt-0.5 leading-none">
          {icon}
        </span>
      )}
      <div className="flex-1 min-w-0">
        {label && (
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
            {label}
          </p>
        )}
        {editing ? (
          multiline ? (
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              rows={4}
              className="w-full text-sm text-gray-800 leading-relaxed bg-gray-50 rounded-md px-2 py-1.5 resize-none outline-none border border-gray-200 focus:border-blue-300 focus:ring-0"
            />
          ) : (
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={handleKeyDown}
              className="w-full text-sm text-gray-800 bg-gray-50 rounded-md px-2 py-1 outline-none border border-gray-200 focus:border-blue-300 focus:ring-0"
            />
          )
        ) : (
          <p
            onClick={() => canEdit && setEditing(true)}
            className={[
              "text-sm rounded-md transition-colors",
              multiline ? "leading-relaxed" : "leading-snug",
              isEmpty ? "text-gray-300 italic" : "text-gray-800 font-medium",
              canEdit ? "cursor-pointer hover:bg-gray-50 -mx-1 px-1 py-0.5" : "",
            ].join(" ")}
          >
            {isEmpty ? placeholder : value}
          </p>
        )}
      </div>
    </div>
  );
}
