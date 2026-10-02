"use client";

// ── Upload a booking, from anywhere (1 Oct 2026) ──────────────────────────
// Settings' Bookings row and a new journey's "Upload a booking" do the same
// thing: pick a confirmation, read it (/api/confirmations/parse), and show
// Bookings' own check-and-add sheet. One copy, so the two never drift.
// `element` holds the hidden file input and the sheet; render it once.

import { useRef, useState, type ReactNode } from "react";
import type { Card, Day, DayWithCards } from "@/types/database";
import { useToast } from "@/components/ui/Toast";
import type { ParsedConfirmation } from "@/lib/confirmations/toCards";
import ConfirmationPreviewSheet from "@/components/plan/ConfirmationPreviewSheet";

export function useBookingUpload({ tripId, days, onAdded }: {
  tripId: string;
  days: (Day | DayWithCards)[];
  onAdded: (cards: Card[], deletedIds: string[]) => void;
}): { pick: () => void; reading: boolean; element: ReactNode } {
  const { toast } = useToast();
  const [reading, setReading] = useState(false);
  const [parsed, setParsed] = useState<{ items: ParsedConfirmation[]; fileName: string; fileType: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const element = (
    <>
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="hidden" aria-label="Booking confirmation"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.currentTarget.value = ""; }} />
      {parsed && (
        <ConfirmationPreviewSheet
          items={parsed.items}
          fileName={parsed.fileName}
          fileType={parsed.fileType}
          days={days.map((d) => ({ ...d, cards: "cards" in d ? d.cards : ([] as Card[]) })) as DayWithCards[]}
          tripId={tripId}
          onClose={() => setParsed(null)}
          onCardsCreated={(cards, deletedIds) => { setParsed(null); onAdded(cards, deletedIds); toast({ message: "Added to your days" }); }}
        />
      )}
    </>
  );
  return { pick: () => fileRef.current?.click(), reading, element };
}
