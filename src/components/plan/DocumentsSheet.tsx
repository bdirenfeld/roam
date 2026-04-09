"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Document } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { X, FileText, Trash, CircleNotch, AirplaneTilt, Buildings, ForkKnife } from "@phosphor-icons/react";

interface Props {
  tripId:  string;
  onClose: () => void;
}

const DOC_LABEL: Record<string, string> = {
  flight:     "Flight",
  hotel:      "Hotel",
  restaurant: "Restaurant",
  activity:   "Activity",
};

function DocTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "flight":      return <AirplaneTilt size={16} weight="light" />;
    case "hotel":       return <Buildings size={16} weight="light" />;
    case "restaurant":  return <ForkKnife size={16} weight="light" />;
    default:            return <FileText size={16} weight="light" />;
  }
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function DocumentsSheet({ tripId, onClose }: Props) {
  const supabase = createClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragY    = useRef(0);
  const dragging = useRef(false);

  const [docs,    setDocs]    = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Scroll lock
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

  // Fetch documents
  useEffect(() => {
    supabase
      .from("documents")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setDocs((data ?? []) as Document[]);
        setLoading(false);
      });
  }, [tripId, supabase]);

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

  const handleDelete = useCallback(async (docId: string) => {
    setDeleting(docId);
    await supabase.from("documents").delete().eq("id", docId);
    setDocs((prev) => prev.filter((d) => d.id !== docId));
    setDeleting(null);
  }, [supabase]);

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
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-[15px] font-bold text-gray-900">Documents</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Uploaded confirmations</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <X size={13} weight="light" color="#6B7280" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-[13px] text-gray-400">Loading…</p>
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <FileText size={18} weight="light" color="#9CA3AF" />
              </div>
              <p className="text-[13px] font-medium text-gray-500">No documents yet</p>
              <p className="text-[12px] text-gray-400 mt-1">
                Upload a flight or hotel confirmation to get started.
              </p>
            </div>
          ) : (
            docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-start gap-3 px-5 py-4 border-b border-gray-50"
              >
                {/* Icon */}
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-500 mt-0.5">
                  <DocTypeIcon type={doc.document_type} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">
                    {doc.file_name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[11px] font-medium text-gray-500">
                      {DOC_LABEL[doc.document_type] ?? doc.document_type}
                    </span>
                    <span className="text-gray-200 text-[11px]">·</span>
                    <span className="text-[11px] text-gray-400">{fmtDate(doc.created_at)}</span>
                  </div>
                  {doc.card_ids.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {doc.card_ids.length} card{doc.card_ids.length !== 1 ? "s" : ""} created
                    </p>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(doc.id)}
                  disabled={deleting === doc.id}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-40"
                  aria-label="Delete document"
                >
                  {deleting === doc.id ? (
                    <CircleNotch size={13} weight="light" className="animate-spin" />
                  ) : (
                    <Trash size={13} weight="light" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
