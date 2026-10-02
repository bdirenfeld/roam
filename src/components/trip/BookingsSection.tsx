"use client";

// ── Bookings, in Journey settings (1 Oct 2026) ────────────────────────────
// One row: what is booked — flights, hotels, a rental car, one line each
// (lib/bookings/summary) — or, with nothing yet, an Upload button. Brennan:
// "in settings you should have the ability to enter your hotel and flight",
// and when you haven't, "the best way is to upload the document later and the
// app will populate the cards for you". Upload reads the confirmation and
// shows Bookings' own check-and-add sheet; tapping a booked row opens
// Bookings. Reads its own cards, so the page needs no new plumbing.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, Day, DayWithCards } from "@/types/database";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { bookingLines, type BookingCard, type BookingLine } from "@/lib/bookings/summary";
import type { ParsedConfirmation } from "@/lib/confirmations/toCards";
import ConfirmationPreviewSheet from "@/components/plan/ConfirmationPreviewSheet";
import DocumentsSheet from "@/components/plan/DocumentsSheet";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.62)";
const FAINT = "rgba(26,26,46,0.5)";

export default function BookingsSection({ tripId, days, endDate }: { tripId: string; days: Day[]; endDate: string }) {
  const { toast } = useToast();
  const [lines, setLines] = useState<BookingLine[] | null>(null);
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<{ items: ParsedConfirmation[]; fileName: string; fileType: string } | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("cards")
      .select("id, day_id, place_id, status, start_time, details, place:places(sub_type, title, address)")
      .eq("trip_id", tripId)
      .not("day_id", "is", null);
    setLines(bookingLines(days.map((d) => ({ id: d.id, date: d.date })), (data ?? []) as unknown as BookingCard[], endDate));
  }, [tripId, days, endDate]);
  useEffect(() => { void load(); }, [load]);

  const read = async (file: File) => {
    setReading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/confirmations/parse", { method: "POST", body: fd });
      const j = await res.json() as { parsed?: ParsedConfirmation[]; error?: string };
      if (!res.ok || !j.parsed?.length) throw new Error(j.error || "Couldn't read that file.");
      setParsed({ items: j.parsed, fileName: file.name, fileType: file.type });
    } catch (e) {
      toast({ message: e instanceof Error ? e.message : "Couldn't read that file." });
    } finally {
      setReading(false);
    }
  };

  const empty = lines !== null && lines.length === 0;
  return (
    <div id="bookings">
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" aria-label="Booking confirmation"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.currentTarget.value = ""; }} />
      <div
        role={empty ? undefined : "button"}
        tabIndex={empty ? undefined : 0}
        onClick={empty ? undefined : () => setShowDocs(true)}
        onKeyDown={empty ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowDocs(true); } }}
        className={`w-full flex items-center px-5 py-[14px] border-b border-black/5 text-left ${empty ? "" : "cursor-pointer"}`}
        data-testid="bookings-row"
      >
        <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0 self-start mt-[3px]">Bookings</span>
        <span className="flex-1 min-w-0">
          {lines === null ? <span className="text-[14px]" style={{ color: FAINT }}> </span>
            : empty ? (
              <>
                <span className="block text-[14px]" style={{ color: INK }}>No flight or hotel yet</span>
                <span className="block text-[12.5px] mt-0.5" style={{ color: CAPTION }}>Upload a confirmation and Roam puts them on your days.</span>
              </>
            ) : lines.map((l) => (
              <span key={l.kind} className="block text-[14px] leading-snug" style={{ color: INK }}>
                <span className="font-semibold">{l.kind}</span> · {l.text}
              </span>
            ))}
        </span>
        {empty ? (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={reading}
            className="ml-3 flex-shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold text-white disabled:opacity-60" style={{ background: INK }}>
            {reading ? "Reading…" : "Upload"}
          </button>
        ) : lines !== null && <span aria-hidden="true" className="text-[14px] flex-shrink-0 ml-2" style={{ color: FAINT }}>›</span>}
      </div>
      {showDocs && <DocumentsSheet tripId={tripId} onClose={() => setShowDocs(false)} onImport={() => { setShowDocs(false); fileRef.current?.click(); }} />}
      {parsed && (
        <ConfirmationPreviewSheet
          items={parsed.items}
          fileName={parsed.fileName}
          fileType={parsed.fileType}
          days={days.map((d) => ({ ...d, cards: [] as Card[] })) as DayWithCards[]}
          tripId={tripId}
          onClose={() => setParsed(null)}
          onCardsCreated={() => { setParsed(null); void load(); toast({ message: "Added to your days" }); }}
        />
      )}
    </div>
  );
}
