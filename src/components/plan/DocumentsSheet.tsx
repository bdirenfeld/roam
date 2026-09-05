"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Document } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useSheetDrag } from "@/hooks/useSheetDrag";

interface Props {
  tripId:  string;
  onClose: () => void;
  /** Opens the host's file picker — the same parse → preview → cards flow. */
  onImport?: () => void;
}

interface CardFile {
  id: string;
  cardId: string;
  fileName: string;
  fileType: string | null;
  fileUrl: string | null;
  createdAt: string;
  cardTitle: string;
}

const DOC_LABEL: Record<string, string> = {
  flight:     "Flight",
  hotel:      "Hotel",
  restaurant: "Restaurant",
  activity:   "Activity",
};

function DocTypeIcon({ type }: { type: string }) {
  const s = {
    width: 16, height: 16, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor",
    strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "flight":
      return (
        <svg {...s}>
          <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19 4c-.7 0-1.5.3-2 .8L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
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
    case "restaurant":
      return (
        <svg {...s}>
          <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <path d="M7 2v20" />
          <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </svg>
      );
    default:
      return (
        <svg {...s}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default function DocumentsSheet({ tripId, onClose, onImport }: Props) {
  const supabase = createClient();
  const { toast } = useToast();
  const listRef  = useRef<HTMLDivElement>(null);
  const drag     = useSheetDrag(onClose, listRef);

  const [docs,    setDocs]    = useState<Document[]>([]);
  // Files attached to the journey's cards (the card sheet's paperclip). They
  // live in card_attachments, not documents, and belong here just the same.
  const [atts,    setAtts]    = useState<CardFile[]>([]);
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

  // Fetch both stores. Uploads through this sheet are documents; anything
  // added on a card is a card attachment. One list, newest first.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("documents").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
      supabase
        .from("card_attachments")
        .select("id, card_id, file_name, file_type, file_url, file_path, created_at, parse_status, cards(details, places(title))")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false }),
    ]).then(async ([d, a]) => {
      if (cancelled) return;
      setDocs((d.data ?? []) as Document[]);
      // card-attachments is a private bucket: the stored /object/public/ URL
      // never resolves ("Bucket not found" on the phone). Sign every path in
      // one call before the rows render, so each tap is a plain link — no
      // await in the gesture, which iOS Safari would block.
      const rowsRaw = (a.data ?? []) as unknown as {
        id: string; card_id: string; file_name: string; file_type: string | null; file_url: string | null; file_path: string | null; created_at: string; parse_status: string | null;
        cards: { details: Record<string, unknown> | null; places: { title: string } | null } | null;
      }[];
      const pathOf = (r: { file_path: string | null; file_url: string | null }) =>
        r.file_path ?? (r.file_url ? decodeURIComponent(r.file_url.split("/card-attachments/")[1] ?? "") : "") ?? "";
      const paths = rowsRaw.map(pathOf).filter(Boolean);
      const signed = new Map<string, string>();
      if (paths.length) {
        const { data: urls } = await supabase.storage.from("card-attachments").createSignedUrls(paths, 3600);
        for (const u of urls ?? []) if (u.signedUrl && u.path) signed.set(u.path, u.signedUrl);
      }
      if (cancelled) return;
      setAtts(
        rowsRaw.map((r) => ({
          id: r.id,
          cardId: r.card_id,
          fileName: r.file_name,
          fileType: r.file_type,
          fileUrl: signed.get(pathOf(r)) ?? null,
          createdAt: r.created_at,
          cardTitle: r.cards?.places?.title ?? (typeof r.cards?.details?.title === "string" ? (r.cards.details.title as string) : "a card"),
        })),
      );
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tripId, supabase]);


  // Checked, and undoable for six seconds — the row comes back under its
  // original id (the file itself was never touched).
  const handleDelete = useCallback(async (docId: string) => {
    setDeleting(docId);
    const { error } = await supabase.from("documents").delete().eq("id", docId);
    setDeleting(null);
    if (error) { toast({ message: "Couldn't delete that document. Try again." }); return; }
    let gone: Document | undefined;
    setDocs((prev) => { gone = prev.find((d) => d.id === docId); return prev.filter((d) => d.id !== docId); });
    toast({
      message: "Document deleted",
      undo: async () => {
        if (!gone) return;
        const g = gone;
        const { error: insErr } = await supabase.from("documents").insert({
          id: g.id, trip_id: g.trip_id, file_name: g.file_name, file_type: g.file_type,
          document_type: g.document_type, parsed_data: g.parsed_data, card_ids: g.card_ids,
          created_at: g.created_at,
        });
        if (insErr) { toast({ message: "Couldn't bring it back. Try again." }); return; }
        setDocs((prev) => (prev.some((d) => d.id === g.id) ? prev : [g, ...prev]));
      },
    });
  }, [supabase, toast]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" />

      <div
        ref={drag.sheetRef}
        onTouchStart={drag.onTouchStart}
        onTouchMove={drag.onTouchMove}
        onTouchEnd={drag.onTouchEnd}
        onTouchCancel={drag.onTouchCancel}
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
            <h3 className="text-[15px] font-bold text-gray-900">Bookings</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">Confirmations you’ve uploaded</p>
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

        {/* Upload — it used to be a separate menu row; the empty state below
            said "Upload…" while this sheet had no way to (UX audit, Sep 2026). */}
        {onImport && (
          <div className="px-5 pt-3 flex-shrink-0">
            <button
              type="button"
              onClick={onImport}
              className="w-full py-3 rounded-xl text-[14px] font-semibold"
              style={{ background: "#1A1A2E", color: "#F5F4F1" }}
            >
              Upload a booking
            </button>
            <p className="text-[11px] text-gray-400 mt-1.5 text-center">A flight or hotel confirmation becomes cards on the right day.</p>
          </div>
        )}

        {/* List */}
        <div ref={listRef} className="flex-1 overflow-y-auto pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-[13px] text-gray-400">Loading…</p>
            </div>
          ) : docs.length === 0 && atts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <p className="text-[13px] font-medium text-gray-500">No documents yet</p>
              <p className="text-[12px] text-gray-400 mt-1">
                {onImport ? "Upload a flight or hotel confirmation to get started." : "Nothing has been added to this journey yet."}
              </p>
            </div>
          ) : (
            <>
            {atts.map((f) => (
              <a
                key={f.id}
                href={f.fileUrl ?? undefined}
                target="_blank"
                rel="noopener"
                className="flex items-start gap-3 px-5 py-4 border-b border-gray-50"
              >
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-500 mt-0.5">
                  <DocTypeIcon type="document" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{f.fileName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[11px] font-medium text-gray-500 truncate">on {f.cardTitle}</span>
                    <span className="text-gray-200 text-[11px]">·</span>
                    <span className="text-[11px] text-gray-400">{fmtDate(f.createdAt)}</span>
                  </div>
                </div>
              </a>
            ))}
            {docs.map((doc) => (
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
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6" /><path d="M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
