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
import { queuedDelete } from "@/lib/offline/queuedWrite";
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
  // The picked file rides along, so the cards it makes can keep it (27 Nov 2026).
  const ref = { name: file.name, type: file.type, blob: file };
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

export function useBookingUpload({ tripId, days, onAdded, onOpen }: {
  tripId: string;
  days: (Day | DayWithCards)[];
  onAdded: (cards: Card[], deletedIds: string[]) => void;
  /** The check-and-add sheet is opening (27 Nov 2026): Bookings stays open while
   *  the file is read, saying so, and the host closes it here, not before. */
  onOpen?: () => void;
}): { pick: () => void; addByHand: () => void; reading: boolean; readingLabel: string; element: ReactNode } {
  const { toast } = useToast();
  const [reading, setReading] = useState(0);
  const [parsed, setParsed] = useState<Combined | null>(null);
  // Nothing read (17 Nov 2026): a file that failed, or "Add one yourself". The
  // same sheet opens empty and each booking is added by hand.
  const [failedFile, setFailedFile] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const read = async (picked: File[]) => {
    const files = picked.slice(0, MAX_FILES);
    setReading(files.length);
    try {
      const reads = await inBatches(files, PARSE_AT_ONCE, readOne);
      const over: FileRead[] = picked.slice(MAX_FILES).map((f) => ({ file: { name: f.name, type: f.type }, reason: `Only ${MAX_FILES} at a time. Upload it next.` }));
      const all = combineReads([...reads, ...over]);
      if (!all.items.length) {
        // Not an error toast any more: the sheet opens empty to add them by hand.
        setFailedFile(picked.length === 1 ? picked[0].name : `${picked.length} files`);
        setParsed({ ...all, items: [], fileOf: [], failures: picked.length === 1 ? [] : all.failures });
        onOpen?.();
        return;
      }
      setFailedFile(null);
      setParsed(all);
      onOpen?.();
    } finally {
      setReading(0);
    }
  };

  // count: how many bookings the sheet added (a hand-added cruise is one booking, two cards).
  const added = (cards: Card[], deletedIds: string[], docIds: string[] = [], count?: number) => {
    const bookings = count ?? (parsed?.items.length || 1);
    setParsed(null);
    setFailedFile(null);
    onAdded(cards, deletedIds);
    const dateOf = new Map(days.map((d) => [d.id, d.date]));
    toast({
      message: addedMessage(bookings, cards.map((c) => (c.day_id ? dateOf.get(c.day_id) : null))),
      // Undo takes back every card the sheet added and the files' records with them.
      undo: async () => {
        const results = await Promise.all([
          ...cards.map((c) => queuedDelete("cards", { id: c.id })),
          ...docIds.map((id) => queuedDelete("documents", { id })),
        ]);
        if (results.some((r) => r.error)) { toast({ message: "Couldn't undo all of it. Try again." }); }
        onAdded([], cards.map((c) => c.id));
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
          failedFile={failedFile}
          days={days.map((d) => ({ ...d, cards: "cards" in d ? d.cards : ([] as Card[]) })) as DayWithCards[]}
          tripId={tripId}
          onClose={() => { setParsed(null); setFailedFile(null); }}
          onCardsCreated={added}
        />
      )}
    </>
  );
  const readingLabel = reading > 1 ? `Reading ${reading} bookings…` : "Reading your booking…";
  const addByHand = () => { setFailedFile(null); setParsed({ items: [], files: [], fileOf: [], failures: [] }); };
  return { pick: () => fileRef.current?.click(), addByHand, reading: reading > 0, readingLabel, element };
}
