"use client";

// ── Upload a booking, from anywhere (1 Oct 2026) ──────────────────────────
// Settings' Bookings row, a new journey's "Upload a booking", and since 6 Oct
// 2026 the phone's day, the Map tab and the Plan board's Bookings door do the same
// thing: pick a confirmation, read it (/api/confirmations/parse), and show
// Bookings' own check-and-add sheet. One copy, so the two never drift.
// `element` holds the hidden file input and the sheet; render it once.
//
// Several at once (6 Oct 2026, taps audit): the picker takes many files. Each
// is read through the same route, three at a time (lib/confirmations/batch),
// and ONE sheet lists every booking found; a file that can't be read is listed
// with its reason. The toast after says how many and which days, with Undo.

import { useRef, useState, type ReactNode } from "react";
import type { Card, Day, DayWithCards } from "@/types/database";
import { useToast } from "@/components/ui/Toast";
import { queuedDelete, queuedUpdate } from "@/lib/offline/queuedWrite";
import type { ParsedConfirmation } from "@/lib/confirmations/toCards";
import { friendlyReadError, READ_FAILED } from "@/lib/confirmations/readError";
import { inBatches, combineReads, addedMessage, PARSE_AT_ONCE, MAX_FILES, type Combined, type FileRead } from "@/lib/confirmations/batch";
import dynamic from "next/dynamic";
import { reloadOnStale } from "@/lib/chunkReload";

// Every upload door uses this hook now (6 Oct 2026), the phone's day among
// them, so the sheet loads when a file has been read, not with the page
// (lazySheets.test: the day page keeps its booking sheets out of its bundle).
const ConfirmationPreviewSheet = dynamic(reloadOnStale(() => import("@/components/plan/ConfirmationPreviewSheet")), { ssr: false });

async function readOne(file: File): Promise<FileRead> {
  const ref = { name: file.name, type: file.type };
  try {
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch("/api/confirmations/parse", { method: "POST", body: fd });
    const j = await res.json() as { parsed?: ParsedConfirmation[]; error?: string };
    // Never the raw server text in a toast (6 Oct 2026): only the route's plain lines pass through.
    if (!res.ok || !j.parsed?.length) return { file: ref, reason: friendlyReadError(j.error) };
    return { file: ref, items: j.parsed };
  } catch {
    return { file: ref, reason: READ_FAILED };
  }
}

export function useBookingUpload({ tripId, days, onAdded }: {
  tripId: string;
  days: (Day | DayWithCards)[];
  onAdded: (cards: Card[], deletedIds: string[]) => void;
}): { pick: () => void; reading: boolean; readingLabel: string; element: ReactNode } {
  const { toast } = useToast();
  const [reading, setReading] = useState(0);
  const [parsed, setParsed] = useState<Combined | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const read = async (picked: File[]) => {
    const files = picked.slice(0, MAX_FILES);
    setReading(files.length);
    try {
      const reads = await inBatches(files, PARSE_AT_ONCE, readOne);
      const over: FileRead[] = picked.slice(MAX_FILES).map((f) => ({ file: { name: f.name, type: f.type }, reason: `Only ${MAX_FILES} at a time. Upload it next.` }));
      const all = combineReads([...reads, ...over]);
      if (!all.items.length) {
        toast({ message: picked.length === 1 ? all.failures[0]?.reason ?? READ_FAILED : `Couldn't read any of those ${picked.length} files.` });
        return;
      }
      setParsed(all);
    } finally {
      setReading(0);
    }
  };

  // restored: cards that were already on the days and that the upload marked
  // Booked (6 Oct 2026), as they were before. Undo puts them back, never deletes them.
  const added = (cards: Card[], deletedIds: string[], docIds: string[] = [], restored: Card[] = []) => {
    const bookings = parsed?.items.length ?? 1;
    setParsed(null);
    onAdded(cards, deletedIds);
    const dateOf = new Map(days.map((d) => [d.id, d.date]));
    toast({
      message: addedMessage(bookings, cards.map((c) => (c.day_id ? dateOf.get(c.day_id) : null))),
      // Undo takes back every card the sheet added and the files' records with them.
      undo: async () => {
        const kept = new Set(restored.map((c) => c.id));
        const results = await Promise.all([
          ...cards.filter((c) => !kept.has(c.id)).map((c) => queuedDelete("cards", { id: c.id })),
          ...restored.map((c) => queuedUpdate("cards", { id: c.id }, { confirmed: c.confirmed, start_time: c.start_time, end_time: c.end_time, details: c.details })),
          ...docIds.map((id) => queuedDelete("documents", { id })),
        ]);
        if (results.some((r) => r.error)) { toast({ message: "Couldn't undo all of it. Try again." }); }
        onAdded(restored, cards.map((c) => c.id));
      },
    });
  };

  const element = (
    <>
      <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" className="hidden" aria-label="Booking confirmation"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void read(fs); e.currentTarget.value = ""; }} />
      {parsed && (
        <ConfirmationPreviewSheet
          items={parsed.items}
          fileName={parsed.files[0]?.name ?? ""}
          fileType={parsed.files[0]?.type ?? ""}
          files={parsed.files}
          fileOf={parsed.fileOf}
          failures={parsed.failures}
          days={days.map((d) => ({ ...d, cards: "cards" in d ? d.cards : ([] as Card[]) })) as DayWithCards[]}
          tripId={tripId}
          onClose={() => setParsed(null)}
          onCardsCreated={added}
        />
      )}
    </>
  );
  const readingLabel = reading > 1 ? `Reading ${reading} bookings…` : "Reading your booking…";
  return { pick: () => fileRef.current?.click(), reading: reading > 0, readingLabel, element };
}
