"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Card, CardAttachment } from "@/types/database";

// ── Helpers ───────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.startsWith("image/"))  return "IMG";
  return "FILE";
}

// ── Field mapping by card sub_type ───────────────────────────
const FLIGHT_DETAIL_MAP: Record<string, string> = {
  outbound_flight_number:       "flight_number",
  outbound_origin_airport:      "origin_airport",
  outbound_destination_airport: "arriving_at",
  outbound_departure_time:      "departure_time",
  outbound_arrival_time:        "arrival_time",
  outbound_origin_terminal:     "terminal",
  supplier:                     "airline",
  confirmation:                 "confirmation",
  outbound_duration:            "duration",
  outbound_seat:                "seat",
  outbound_aircraft:            "aircraft",
};

const HOTEL_DETAIL_MAP: Record<string, string> = {
  confirmation:   "confirmation",
  check_in_date:  "check_in",
  check_in_time:  "check_in_time",
  check_out_date: "check_out",
  check_out_time: "check_out_time",
  phone:          "phone",
  address:        "address",
  notes:          "notes",
};

const GENERIC_HOTEL_TITLES = ["check-in", "hotel", "accommodation", "stay", "arrival"];

function remapParsedFields(
  parsed: Record<string, unknown>,
  card: Card,
): { details: Record<string, unknown>; topLevel: Record<string, unknown> } {
  const subType = card.sub_type;
  const details: Record<string, unknown> = {};
  const topLevel: Record<string, unknown> = {};

  if (subType === "flight_arrival" || subType === "flight_departure") {
    for (const [src, dst] of Object.entries(FLIGHT_DETAIL_MAP)) {
      if (parsed[src] != null) details[dst] = parsed[src];
    }
    // Populate the card's top-level start_time from departure time
    if (parsed.outbound_departure_time != null) {
      topLevel.start_time = parsed.outbound_departure_time;
    }
  } else if (subType === "hotel") {
    for (const [src, dst] of Object.entries(HOTEL_DETAIL_MAP)) {
      if (parsed[src] != null) details[dst] = parsed[src];
    }
    // supplier → name only when the card title is a generic placeholder
    if (parsed.supplier != null) {
      const titleLower = (card.title ?? "").toLowerCase();
      if (GENERIC_HOTEL_TITLES.some((t) => titleLower.includes(t))) {
        details.name = parsed.supplier;
      }
    }
  } else {
    // All other card types: pass parsed fields through unchanged
    Object.assign(details, parsed);
  }

  return { details, topLevel };
}

// ── AttachmentRow sub-component ───────────────────────────────
function AttachmentRow({
  attachment,
  isExpanded,
  onToggleExpand,
  onApply,
}: {
  attachment: CardAttachment;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApply: () => void;
}) {
  const hasParsed = attachment.parse_status === "parsed" && attachment.parsed_data;
  const isParsing = attachment.parse_status === "parsing";

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      {/* Row header */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-gray-50">
        {/* File type badge */}
        <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] font-bold text-gray-500">{fileTypeLabel(attachment.file_type)}</span>
        </div>

        {/* Name + size */}
        <div className="flex-1 min-w-0">
          <a
            href={attachment.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[12px] font-semibold text-gray-800 truncate hover:underline"
          >
            {attachment.file_name}
          </a>
          <p className="text-[10px] text-gray-400">{formatBytes(attachment.file_size)}</p>
        </div>

        {/* Parse status indicator */}
        {isParsing && (
          <svg className="animate-spin flex-shrink-0 text-gray-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
          </svg>
        )}
        {attachment.parse_status === "failed" && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" className="flex-shrink-0">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        )}

        {/* "Parsed info" toggle */}
        {hasParsed && (
          <button
            onClick={onToggleExpand}
            className="text-[10px] font-semibold text-activity bg-teal-50 px-2 py-0.5 rounded-full hover:bg-teal-100 transition-colors flex-shrink-0"
          >
            {isExpanded ? "Hide" : "Parsed info"}
          </button>
        )}
      </div>

      {/* Parsed data section */}
      {isExpanded && hasParsed && (
        <div className="px-3 py-3 border-t border-gray-100">
          <div className="flex flex-col gap-1.5 mb-3">
            {Object.entries(attachment.parsed_data as Record<string, unknown>)
              .filter(([, v]) => v != null && v !== "")
              .map(([k, v]) => (
                <div key={k} className="flex gap-2 items-baseline">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-28 flex-shrink-0">
                    {k.replace(/_/g, " ")}
                  </span>
                  <span className="text-[12px] text-gray-700 flex-1 break-words">
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
          </div>
          <button
            onClick={onApply}
            className="w-full py-2 rounded-lg bg-activity text-white text-[12px] font-semibold hover:bg-teal-700 transition-colors"
          >
            Apply to card
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────
interface Props {
  card: Card;
  onClose: () => void;
  onCardUpdate?: (card: Card) => void;
}

export default function AttachmentsPanel({ card, onClose, onCardUpdate }: Props) {
  const supabase    = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachments, setAttachments]   = useState<CardAttachment[]>([]);
  const [isLoading,   setIsLoading]     = useState(true);
  const [isUploading, setIsUploading]   = useState(false);
  const [uploadError, setUploadError]   = useState<string | null>(null);
  const [expandedId,  setExpandedId]    = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);

  // confirmApply: pending merge that has overwrite conflicts
  const [confirmApply, setConfirmApply] = useState<{
    data:          Record<string, unknown>;
    topLevel:      Record<string, unknown>;
    overwriteKeys: string[];
  } | null>(null);

  // ── Fetch attachments ───────────────────────────────────────
  const fetchAttachments = useCallback(async () => {
    const { data } = await supabase
      .from("card_attachments")
      .select("*")
      .eq("card_id", card.id)
      .order("created_at", { ascending: false });
    setAttachments((data ?? []) as CardAttachment[]);
    setIsLoading(false);
  }, [card.id, supabase]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  // ── File upload ─────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setIsUploading(true);
    setUploadError(null);

    const form = new FormData();
    form.append("file",    file);
    form.append("card_id", card.id);
    form.append("trip_id", card.trip_id);

    try {
      const res  = await fetch("/api/attachments/upload", { method: "POST", body: form });
      const json = await res.json() as { attachment?: CardAttachment; error?: string };
      if (!res.ok || !json.attachment) {
        setUploadError(json.error ?? "Upload failed — please try again.");
      } else {
        setAttachments((prev) => [json.attachment!, ...prev]);
        // Auto-expand if parsed
        if (json.attachment.parse_status === "parsed") {
          setExpandedId(json.attachment.id);
        }
      }
    } catch {
      setUploadError("Upload failed — please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  // ── Apply parsed data to card ───────────────────────────────
  const handleApplyRequest = (attachment: CardAttachment) => {
    const parsed = attachment.parsed_data;
    if (!parsed) return;

    const { details: mappedDetails, topLevel } = remapParsedFields(
      parsed as Record<string, unknown>,
      card,
    );

    const current        = (card.details ?? {}) as Record<string, unknown>;
    const overwriteKeys: string[] = [];

    for (const [key, val] of Object.entries(mappedDetails)) {
      if (val != null && current[key] != null) overwriteKeys.push(key);
    }

    if (overwriteKeys.length > 0) {
      setConfirmApply({ data: mappedDetails, topLevel, overwriteKeys });
    } else {
      doApply(mappedDetails, topLevel, []);
    }
  };

  const doApply = useCallback(
    async (
      data:     Record<string, unknown>,
      topLevel: Record<string, unknown>,
      skipKeys: string[],
    ) => {
      const current = (card.details ?? {}) as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...current };

      for (const [k, v] of Object.entries(data)) {
        if (skipKeys.includes(k)) continue;
        if (v != null) merged[k] = v;
      }

      // Build top-level column updates — only set if currently null/undefined
      const topLevelUpdate: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(topLevel)) {
        if (v != null && (card as unknown as Record<string, unknown>)[k] == null) {
          topLevelUpdate[k] = v;
        }
      }

      const { error } = await supabase
        .from("cards")
        .update({ details: merged, ...topLevelUpdate })
        .eq("id", card.id);

      if (!error) {
        onCardUpdate?.({ ...card, details: merged as typeof card.details, ...topLevelUpdate } as typeof card);
        setApplySuccess(true);
        setTimeout(() => setApplySuccess(false), 2500);
      }
      setConfirmApply(null);
    },
    [card, onCardUpdate, supabase],
  );

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 z-10 bg-white rounded-t-2xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
        <h3 className="text-[16px] font-bold text-gray-900">Attachments</h3>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          aria-label="Close attachments"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Upload area */}
      <div className="px-5 pt-4 pb-3 flex-shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-[13px] font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors disabled:opacity-60"
        >
          {isUploading ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
              </svg>
              Uploading…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              Upload file
            </>
          )}
        </button>

        {uploadError && (
          <p className="text-[11px] text-red-500 mt-1.5 text-center">{uploadError}</p>
        )}
        {applySuccess && (
          <p className="text-[11px] text-green-600 mt-1.5 text-center font-medium">Applied to card ✓</p>
        )}
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">PDF, JPG, PNG accepted</p>
      </div>

      {/* Attachment list */}
      <div className="flex-1 overflow-y-auto px-5 pb-5">
        {isLoading ? (
          <p className="text-[13px] text-gray-400 text-center py-8">Loading…</p>
        ) : attachments.length === 0 ? (
          <div className="text-center py-10">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <p className="text-[13px] text-gray-400">No attachments yet</p>
            <p className="text-[11px] text-gray-300 mt-0.5">Upload a booking confirmation to get started</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {attachments.map((att) => (
              <AttachmentRow
                key={att.id}
                attachment={att}
                isExpanded={expandedId === att.id}
                onToggleExpand={() => setExpandedId(expandedId === att.id ? null : att.id)}
                onApply={() => handleApplyRequest(att)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Overwrite confirmation overlay */}
      {confirmApply && (
        <div className="absolute inset-0 bg-black/30 z-20 flex items-end">
          <div className="bg-white w-full rounded-t-2xl px-5 pt-5 pb-6">
            <p className="text-[15px] font-bold text-gray-900 mb-1">Overwrite existing fields?</p>
            <p className="text-[12px] text-gray-500 mb-3">
              These fields already have values and would be replaced:
            </p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {confirmApply.overwriteKeys.map((k) => (
                <span
                  key={k}
                  className="text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full"
                >
                  {k.replace(/_/g, " ")}
                </span>
              ))}
            </div>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setConfirmApply(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-[13px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => doApply(confirmApply.data, confirmApply.topLevel, [])}
                className="flex-1 py-2.5 rounded-xl bg-activity text-white text-[13px] font-semibold hover:bg-teal-700 transition-colors"
              >
                Overwrite all
              </button>
            </div>
            <button
              onClick={() => doApply(confirmApply.data, confirmApply.topLevel, confirmApply.overwriteKeys)}
              className="w-full py-2 text-[12px] text-gray-500 hover:text-gray-700 transition-colors"
            >
              Apply new fields only (keep {confirmApply.overwriteKeys.length} existing)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
