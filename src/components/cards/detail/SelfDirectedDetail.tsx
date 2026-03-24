"use client";

import { useState } from "react";
import type { Card } from "@/types/database";
import FieldRow, { SectionLabel } from "./FieldRow";
import ArrayField from "./ArrayField";

interface Props {
  card: Card;
  onSaveDetails?: (field: string, value: unknown) => void;
}

export default function SelfDirectedDetail({ card, onSaveDetails }: Props) {
  const d = card.details;
  const save = (field: string) =>
    onSaveDetails ? (v: string) => onSaveDetails(field, v || null) : undefined;

  // flow: plain string[] — do NOT split items
  const rawFlow = d.flow;
  const flow: string[] = Array.isArray(rawFlow)
    ? (rawFlow as unknown[]).map((item) =>
        typeof item === "string" ? item : String(item)
      )
    : [];

  // tips: plain string[]
  const rawTips = d.tips;
  const tips: string[] = Array.isArray(rawTips)
    ? (rawTips as string[])
    : [];

  return (
    <div className="space-y-6">
      {/* THE PLAN — timeline */}
      <div>
        <SectionLabel>The Plan</SectionLabel>
        {flow.length > 0 ? (
          <div className="space-y-0 mt-1">
            {flow.map((step, i) => (
              <div key={i} className="flex gap-3">
                {/* Timeline spine */}
                <div className="flex flex-col items-center w-5 flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-activity mt-1 flex-shrink-0" />
                  {i < flow.length - 1 && (
                    <div
                      className="w-px flex-1 bg-gray-100 mt-1"
                      style={{ minHeight: 20 }}
                    />
                  )}
                </div>
                {/* Content */}
                <div className="pb-3 flex-1 min-w-0">
                  {onSaveDetails ? (
                    <FlowItemEdit
                      value={step}
                      onSave={(v) => {
                        const next = [...flow];
                        if (v.trim()) {
                          next[i] = v.trim();
                        } else {
                          next.splice(i, 1);
                        }
                        onSaveDetails("flow", next);
                      }}
                    />
                  ) : (
                    <p className="text-sm text-gray-800 leading-snug">{step}</p>
                  )}
                </div>
                {onSaveDetails && (
                  <button
                    onClick={() => {
                      const next = flow.filter((_, idx) => idx !== i);
                      onSaveDetails("flow", next);
                    }}
                    className="text-gray-200 hover:text-gray-500 text-xl leading-none mt-0.5 flex-shrink-0"
                    aria-label="Remove step"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-300 italic">No plan added yet…</p>
        )}
        {onSaveDetails && (
          <button
            onClick={() => onSaveDetails("flow", [...flow, "New step"])}
            className="mt-2 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 pl-5"
          >
            <span className="font-bold text-sm leading-none">+</span> Add step
          </button>
        )}
      </div>

      {/* TIPS */}
      <ArrayField
        label="Tips"
        items={tips}
        placeholder="No tips added yet…"
        newItemPlaceholder="Add a tip…"
        onSave={
          onSaveDetails ? (items) => onSaveDetails("tips", items) : undefined
        }
        bulletClass="bg-activity"
      />

      {/* NOTES */}
      <div>
        <SectionLabel>Notes</SectionLabel>
        <FieldRow
          value={d.notes as string | undefined}
          placeholder="Add notes…"
          onSave={save("notes")}
          multiline
        />
      </div>
    </div>
  );
}

// ── Inline edit for a single flow step ────────────────────────
function FlowItemEdit({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  return editing ? (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
      }}
      className="w-full text-sm text-gray-800 bg-gray-50 rounded px-2 py-0.5 outline-none border border-gray-200 focus:border-blue-300"
    />
  ) : (
    <p
      onClick={() => setEditing(true)}
      className="text-sm text-gray-800 leading-snug cursor-pointer hover:text-gray-600"
    >
      {value || <span className="text-gray-300 italic">Empty step</span>}
    </p>
  );
}
