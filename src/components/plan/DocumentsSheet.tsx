"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Document } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { useSheetDrag } from "@/hooks/useSheetDrag";
import FileViewer, { type ViewableFile } from "@/components/ui/FileViewer";
import { cardLabel, documentLabel, rowForCard, rowForDocument, type BookingFile } from "@/lib/booking/files";
import ToBookSection from "./ToBookSection";

// Bookings (6 Oct 2026 redesign, mock approved): for the owner, the three
// booking rows with each upload inside its own row (ToBookSection); for anyone
// else, the files they could always see, as a plain list. Two stores feed it:
// `documents` (uploaded through the sheet — a record, no file kept) and
// `card_attachments` (a real file on a card, opened in the viewer).

interface Props {
  tripId:  string;
  onClose: () => void;
  /** Opens the host's file picker — the same parse → preview → cards flow. */
  onImport?: () => void;
}

// The kind an upload record names, for a file that matches no booking row.
const DOC_LABEL: Record<string, string> = {
  flight:     "Flight",
  hotel:      "Hotel",
  car_rental: "Car",
  restaurant: "Restaurant",
  activity:   "Activity",
};

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const RULE = "rgba(26,26,46,0.10)";

type AttachmentRow = {
  id: string; card_id: string; file_name: string; file_type: string | null; file_url: string | null; file_path: string | null; created_at: string;
  cards: { details: Record<string, unknown> | null; places: { title: string | null; sub_type: string | null } | null } | null;
};

export default function DocumentsSheet({ tripId, onClose, onImport }: Props) {
  const supabase = createClient();
  const { toast } = useToast();
  const listRef  = useRef<HTMLDivElement>(null);
  const drag     = useSheetDrag(onClose, listRef);

  const [docs,    setDocs]    = useState<Document[]>([]);
  // Files attached to the journey's cards (the card sheet's paperclip), each
  // placed in its booking row by its card.
  const [atts,    setAtts]    = useState<BookingFile[]>([]);
  const [viewing, setViewing] = useState<ViewableFile | null>(null);
  const [loading, setLoading] = useState(true);
  // Owner (the booking rows) or not (the plain list); null until known.
  const [owner,   setOwner]   = useState<boolean | null>(null);

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

  // Fetch both stores, newest first.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("documents").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
      supabase
        .from("card_attachments")
        .select("id, card_id, file_name, file_type, file_url, file_path, created_at, parse_status, cards(details, places(title, sub_type))")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false }),
    ]).then(async ([d, a]) => {
      if (cancelled) return;
      setDocs((d.data ?? []) as Document[]);
      // card-attachments is a private bucket: the stored /object/public/ URL
      // never resolves ("Bucket not found" on the phone). Sign every path in
      // one call before the rows render, so each tap is a plain link — no
      // await in the gesture, which iOS Safari would block.
      const rowsRaw = (a.data ?? []) as unknown as AttachmentRow[];
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
        rowsRaw.map((r) => {
          const card = r.cards ? { details: r.cards.details, place: r.cards.places } : null;
          return {
            id: r.id,
            source: "attachment" as const,
            fileName: r.file_name,
            url: signed.get(pathOf(r)) ?? null,
            type: r.file_type,
            row: rowForCard(card),
            label: cardLabel(card),
            detail: `on ${cardLabel(card) ?? "a card"}`,
            createdAt: r.created_at,
          };
        }),
      );
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tripId, supabase]);

  // An upload record goes in its row too: it names the booking, holds no file.
  const files: BookingFile[] = [
    ...atts,
    ...docs.map((doc) => ({
      id: doc.id,
      source: "document" as const,
      fileName: doc.file_name,
      url: null,
      type: doc.file_type,
      row: rowForDocument(doc.document_type),
      label: documentLabel(doc.parsed_data),
      detail: DOC_LABEL[doc.document_type] ?? doc.document_type,
      createdAt: doc.created_at,
    })),
  ];
  const open = useCallback((f: BookingFile) => { if (f.url) setViewing({ url: f.url, name: f.fileName, type: f.type }); }, []);

  // Undoable for six seconds — the record comes back under its original id
  // (the cards it made were never touched).
  const removeDocument = useCallback(async (docId: string) => {
    const { error } = await supabase.from("documents").delete().eq("id", docId);
    if (error) { toast({ message: "Couldn't remove that upload. Try again." }); return; }
    let gone: Document | undefined;
    setDocs((prev) => { gone = prev.find((d) => d.id === docId); return prev.filter((d) => d.id !== docId); });
    toast({
      message: "Upload removed",
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

        {/* The title, and a close for the computer. */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2 flex-shrink-0">
          <h3 className="text-[17px] font-semibold" style={{ color: INK }}>Bookings</h3>
          <button
            onClick={onClose}
            className="relative w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            {/* 44px to the finger (7 Oct 2026, phone harness): 8px out, inside
                the header's side padding and its 8px above the list. */}
            <span aria-hidden="true" data-testid="bookings-close-target" className="absolute -inset-2" />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto pb-6">
          {/* The owner's three rows, with the uploads inside them. Renders
              nothing for anyone else, and says which it is. */}
          <ToBookSection
            tripId={tripId}
            onLeave={onClose}
            files={loading ? [] : files}
            onOpenFile={open}
            onImport={onImport}
            onRemoveDocument={removeDocument}
            onOwner={setOwner}
          />
          {/* Everyone else: the files they always saw, as a plain list. */}
          {owner === false && !loading && (
            <div className="px-5" data-testid="bookings-files">
              {files.length === 0 ? (
                <p className="text-[13px] py-3" style={{ color: CAPTION }}>Nothing has been added yet.</p>
              ) : files.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={!f.url}
                  onClick={() => open(f)}
                  className="w-full text-left py-3 active:opacity-70"
                  style={{ borderTop: `1px solid ${RULE}` }}
                >
                  <span className="block text-[14px] font-medium truncate" style={{ color: INK }}>{f.fileName}</span>
                  <span className="block text-[12px] truncate" style={{ color: CAPTION }}>{f.detail}</span>
                </button>
              ))}
              {onImport && (
                <div className="text-center pt-3">
                  <button type="button" onClick={onImport} className="relative text-[13px] underline underline-offset-[3px] py-1.5" style={{ color: CAPTION }}>
                    <span aria-hidden="true" className="absolute -inset-y-1.5 inset-x-0" />
                    Upload a confirmation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {viewing && <FileViewer file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
