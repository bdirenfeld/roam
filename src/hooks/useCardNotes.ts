"use client";

import { useEffect, useRef } from "react";
import { cardsNeedingNotes } from "@/lib/plan/notes";

/**
 * Notes for cards that land on a day (29 Sep 2026, "whenever a place goes
 * onto a day"): each card's **Intent** and **Know before you go**, written
 * by api/plan/notes in the background. One module-wide record of what has
 * been asked for, so the week, the day, the phone board and Plan my trip
 * never ask twice for the same card.
 */
const asked = new Set<string>();

export async function requestNotes(tripId: string, cardIds: string[]): Promise<Record<string, string>> {
  const ids = cardIds.filter((id) => !asked.has(id));
  if (!ids.length) return {};
  ids.forEach((id) => asked.add(id));
  try {
    const res = await fetch("/api/plan/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId, cardIds: ids }) });
    const j = await res.json() as { notes?: Record<string, string> };
    // A failure (no credit, a hiccup) can be asked again on the next change.
    if (!res.ok) ids.forEach((id) => asked.delete(id));
    const notes = j.notes ?? {};
    // Every screen showing these cards folds them in (useCardNotes listens).
    if (Object.keys(notes).length) window.dispatchEvent(new CustomEvent("roam:notes", { detail: notes }));
    return notes;
  } catch {
    ids.forEach((id) => asked.delete(id));
    return {};
  }
}

/**
 * Write the notes for a journey's saved places ahead of time, into the shared
 * cache only (api/plan/notes, warm). A place dropped on a day then gets its
 * note in well under a second instead of waiting for Claude. Once per journey
 * per page load; places already written cost nothing.
 */
const warmed = new Set<string>();
export function warmNotes(tripId: string, savedCardIds: string[]): void {
  if (warmed.has(tripId) || savedCardIds.length === 0) return;
  warmed.add(tripId);
  void fetch("/api/plan/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId, cardIds: savedCardIds.slice(0, 80), warm: true }) })
    .then((r) => { if (!r.ok) warmed.delete(tripId); })
    .catch(() => warmed.delete(tripId));
}

type NoteCard = Parameters<typeof cardsNeedingNotes>[0][number];

/** Asks for notes for any card on a day that needs them, a moment after the cards settle. */
export function useCardNotes(tripId: string, cards: NoteCard[], enabled: boolean, onWritten: (notes: Record<string, string>) => void): void {
  const cb = useRef(onWritten); cb.current = onWritten;
  const need = enabled ? cardsNeedingNotes(cards).filter((id) => !asked.has(id)) : [];
  const key = need.join(",");
  useEffect(() => {
    const on = (e: Event) => cb.current((e as CustomEvent<Record<string, string>>).detail);
    window.addEventListener("roam:notes", on);
    return () => window.removeEventListener("roam:notes", on);
  }, []);
  useEffect(() => {
    if (!key) return;
    // Asked at once: a place dropped on a day wants its note now (30 Sep 2026;
    // it was a second and a half later, then Claude).
    const t = window.setTimeout(() => { void requestNotes(tripId, key.split(",")); }, 0);
    return () => window.clearTimeout(t);
  }, [tripId, key]);
}

/** Put written notes into a card's details (for a screen's own state). */
export function withNotes<T extends { id: string; details?: unknown }>(card: T, notes: Record<string, string>): T {
  const n = notes[card.id];
  return n ? { ...card, details: { ...((card.details as Record<string, unknown> | null) ?? {}), notes: n } } : card;
}

/** Tests only. */
export function _resetAsked(): void { asked.clear(); }
