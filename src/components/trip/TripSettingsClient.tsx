"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { deleteJourney } from "@/lib/deleteJourney";
import { useToast } from "@/components/ui/Toast";
import { setTripArchived } from "@/lib/tripArchive";
import TravellersSection, { type Person } from "@/components/trip/TravellersSection";
import EntrySection from "./EntrySection";
import { createShareLink, revokeShareLink, removeGuest, loadShareState } from "@/lib/share-actions";

/** A guest on a shared journey, as the Settings page loads it server-side. */
export interface ShareGuest {
  userId: string;
  name: string | null;
  email: string | null;
}
import { NESTED_SHEET_ATTR } from "@/components/ui/Overlay";
import { TRAVELLERS_ENABLED } from "@/lib/featureFlags";
import type { Trip, Day } from "@/types/database";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface Props {
  trip: Trip;
  days: Day[];
  initialPeople: Person[];
  initialShareToken: string | null;
  initialGuests: ShareGuest[];
  // False when SUPABASE_SERVICE_ROLE_KEY is absent from the environment —
  // sharing can't work without it, so the section is hidden entirely.
  shareAvailable: boolean;
  /**
   * Chrome only. "page" is the standalone screen — full height, desktop
   * reading measure, back chevron. "overlay" hands the frame to the host and
   * swaps the chevron for a close cross. The form itself is identical.
   */
  variant?: "page" | "overlay";
  /** Back / close. Defaults to router.back(). */
  onDismiss?: () => void;
  /** Settings saved. Defaults to router.back(); the overlay refreshes and closes. */
  onSaved?: () => void;
  /** The journey is gone (archived, restored or deleted) — nothing to return to. */
  onLeft?: () => void;
  /** Section to bring into view on open — the Plan menu's #share deep link. */
  scrollTo?: "share" | "notes" | "entry" | null;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function countDays(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

function buildCalendarDays(year: number, month: number): Array<string | null> {
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  return cells;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function TripSettingsClient({
  trip,
  days,
  initialPeople,
  initialShareToken,
  initialGuests,
  shareAvailable,
  variant = "page",
  onDismiss,
  onSaved,
  onLeft,
  scrollTo = null,
}: Props) {
  const router = useRouter();
  const overlay = variant === "overlay";
  const scrollerRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    if (onDismiss) onDismiss();
    else router.back();
  }, [onDismiss, router]);

  // Archive / restore / delete all end the same way: there is no longer a
  // sensible "back" for this journey, so land on the journeys list.
  const leave = useCallback(() => {
    if (onLeft) onLeft();
    else {
      router.push("/trips");
      router.refresh();
    }
  }, [onLeft, router]);

  // The Plan board's "Share itinerary" carries #share. On the page the browser
  // resolves the hash itself; inside the overlay the section lives in this
  // component's own scroller, so bring it into view by hand. Scoped to that
  // scroller — never document.getElementById, which would find the page's copy
  // if both were ever mounted.
  useEffect(() => {
    if (!scrollTo) return;
    const node = scrollerRef.current?.querySelector(`#${scrollTo}`);
    node?.scrollIntoView({ block: "start" });
  }, [scrollTo]);

  // Form state
  const [title, setTitle] = useState(trip.title);
  // Sharing, all of it, right here: email + Send, the link + Copy, who has
  // it. It used to be a row that opened a sheet with the same fields one tap
  // further away (Brennan, from his phone, Sep 2026).
  const [shareEmail, setShareEmail] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [shareSentTo, setShareSentTo] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [guests, setGuests] = useState<ShareGuest[]>(initialGuests);
  const [linkBusy, setLinkBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const shareUrl = shareToken && typeof window !== "undefined" ? `${window.location.origin}/journey/${shareToken}` : null;
  const refreshShare = useCallback(() => {
    if (!shareAvailable) return;
    loadShareState(trip.id)
      .then((s) => { setShareToken(s.shareToken); setGuests(s.guests); })
      .catch(() => { /* the server-rendered state stands */ });
  }, [shareAvailable, trip.id]);
  useEffect(() => { refreshShare(); }, [refreshShare]);
  const [destination, setDestination] = useState(trip.destination);
  const [startDate, setStartDate] = useState(trip.start_date);
  const [endDate, setEndDate] = useState(trip.end_date);
  const [partySize, setPartySize] = useState(trip.party_size);

  // Cover image — tracked locally so hero updates immediately after save
  const [currentCoverUrl, setCurrentCoverUrl] = useState<string | null>(trip.cover_image_url ?? null);
  const [coverError, setCoverError] = useState(false);

  // Cover URL sheet
  const [showCoverSheet, setShowCoverSheet] = useState(false);
  const [coverUrlInput, setCoverUrlInput] = useState("");
  const [coverPreviewError, setCoverPreviewError] = useState(false);
  const [savingCover, setSavingCover] = useState(false);

  // UI state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Calendar picker state (isolated — only committed on Done)
  const [calYear, setCalYear] = useState(
    () => new Date(trip.start_date + "T00:00:00").getFullYear()
  );
  const [calMonth, setCalMonth] = useState(
    () => new Date(trip.start_date + "T00:00:00").getMonth()
  );
  const [pickStart, setPickStart] = useState<string | null>(trip.start_date);
  const [pickEnd, setPickEnd] = useState<string | null>(trip.end_date);
  const [pickPhase, setPickPhase] = useState<"start" | "end">("start");

  // Derived
  const nightCount = Math.max(0, countDays(startDate, endDate) - 1);
  const dateRangeDisplay = `${fmtDate(startDate)} → ${fmtDate(endDate)}`;

  // Cover source — derived from local state so it updates immediately on save
  const coverSrc =
    currentCoverUrl && !coverError
      ? currentCoverUrl
      : MAPBOX_TOKEN && trip.destination_lat != null && trip.destination_lng != null
      ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/${trip.destination_lng},${trip.destination_lat},12,0/800x200@2x?access_token=${MAPBOX_TOKEN}`
      : null;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleChangeCover = () => {
    setCoverUrlInput(currentCoverUrl ?? "");
    setCoverPreviewError(false);
    setShowCoverSheet(true);
  };

  const handleSaveCover = async () => {
    if (savingCover) return;
    setSavingCover(true);
    const supabase = createClient();
    const url = coverUrlInput.trim() || null;
    await supabase.from("trips").update({ cover_image_url: url }).eq("id", trip.id);
    setCurrentCoverUrl(url);
    setCoverError(false);
    setSavingCover(false);
    setShowCoverSheet(false);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim()) { setError("Journey name is required."); return; }

    setSaving(true);
    setWarning(null);
    setError(null);

    const supabase = createClient();

    try {
      const sortedDays = [...days].sort((a, b) => a.day_number - b.day_number);
      const oldDayCount = sortedDays.length;
      const newDayCount = countDays(startDate, endDate);

      // Block save if shortening would remove days that have cards
      if (newDayCount < oldDayCount) {
        const daysToRemove = sortedDays.slice(newDayCount);
        const dayIds = daysToRemove.map((d) => d.id);
        const { count } = await supabase
          .from("cards")
          .select("id", { count: "exact", head: true })
          .in("day_id", dayIds);

        if (count && count > 0) {
          const firstRemoved = daysToRemove[0];
          const cardLabel = count === 1 ? "1 card" : `${count} cards`;
          setWarning(
            `Day ${firstRemoved.day_number} has ${cardLabel} — move them before shortening the trip.`
          );
          setSaving(false);
          return;
        }
      }

      // Update trips table — title, destination, dates, party_size only
      const { error: tripError } = await supabase
        .from("trips")
        .update({
          title: title.trim(),
          destination: destination.trim(),
          start_date: startDate,
          end_date: endDate,
          party_size: partySize,
        })
        .eq("id", trip.id);

      if (tripError) {
        setError("Failed to save trip settings. Please try again.");
        setSaving(false);
        return;
      }

      // Delete removed days (safe — checked above)
      if (newDayCount < oldDayCount) {
        const daysToRemove = sortedDays.slice(newDayCount);
        await supabase
          .from("days")
          .delete()
          .in("id", daysToRemove.map((d) => d.id));
      }

      // Recalculate existing day dates if start_date changed or day count changed
      if (startDate !== trip.start_date || newDayCount !== oldDayCount) {
        const newStart = new Date(startDate + "T00:00:00");
        const daysToUpdate = sortedDays.slice(0, Math.min(oldDayCount, newDayCount));
        for (let i = 0; i < daysToUpdate.length; i++) {
          const day = daysToUpdate[i];
          const newDate = new Date(newStart);
          newDate.setDate(newDate.getDate() + i);
          await supabase
            .from("days")
            .update({ date: newDate.toISOString().slice(0, 10) })
            .eq("id", day.id);
        }
      }

      // Insert new days if end_date extended
      if (newDayCount > oldDayCount) {
        const newStart = new Date(startDate + "T00:00:00");
        const newDaysToInsert = [];
        for (let i = oldDayCount; i < newDayCount; i++) {
          const dayDate = new Date(newStart);
          dayDate.setDate(dayDate.getDate() + i);
          newDaysToInsert.push({
            id: crypto.randomUUID(),
            trip_id: trip.id,
            date: dayDate.toISOString().slice(0, 10),
            day_number: i + 1,
            day_name: `Day ${i + 1}`,
          });
        }
        await supabase.from("days").insert(newDaysToInsert);
      }

      // Saved. On the page that means going back the way you came; in an
      // overlay the host refreshes the screen underneath and closes.
      if (onSaved) onSaved();
      else router.back();
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    const supabase = createClient();
    const failure = await setTripArchived(supabase, trip.id, true);
    if (failure) {
      console.error("Failed to archive journey:", failure);
      setError("Couldn't archive this journey — please try again.");
      return;
    }
    leave();
  };

  const handleRestore = async () => {
    const supabase = createClient();
    const failure = await setTripArchived(supabase, trip.id, false);
    if (failure) {
      console.error("Failed to restore journey:", failure);
      setError("Couldn't restore this journey — please try again.");
      return;
    }
    leave();
  };

  const { toast } = useToast();

  const sendShare = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = shareEmail.trim();
    if (!to || shareSending) return;
    setShareSending(true);
    try {
      const res = await fetch("/api/share/send-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: trip.id, email: to }),
      });
      const data = (await res.json()) as { sent?: boolean; reason?: string; url?: string; detail?: string; error?: string };
      if (data.sent) {
        setShareSentTo(to);
        setShareEmail("");
        refreshShare();
        toast({ message: `Sent to ${to}` });
        return;
      }
      if (data.error) { toast({ message: data.error }); return; }
      if (data.reason === "provider-error") { toast({ message: data.detail ?? "The mail provider refused it." }); return; }
      const link = data.url ?? shareUrl;
      if (link) {
        const subject = encodeURIComponent(`Join me on ${trip.title ?? "this journey"}`);
        const body = encodeURIComponent(`Here's the plan — open this to see it:\n\n${link}\n`);
        window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
      } else {
        toast({ message: "Couldn't send that. Try the link instead." });
      }
    } catch {
      toast({ message: "Couldn't send that. Your connection may be down." });
    } finally {
      setShareSending(false);
    }
  };

  const createLink = async () => {
    if (linkBusy) return;
    setLinkBusy(true);
    try {
      const token = await createShareLink(trip.id);
      setShareToken(token);
    } catch {
      toast({ message: "Couldn't create the link. Try again." });
    } finally {
      setLinkBusy(false);
    }
  };
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({ message: "Link copied" });
    } catch {
      toast({ message: "Couldn't copy. Long-press the link to copy it." });
    }
  };
  const revokeLink = async () => {
    if (linkBusy) return;
    setLinkBusy(true);
    try {
      await revokeShareLink(trip.id);
      setShareToken(null);
      setGuests([]);
      setConfirmRevoke(false);
      toast({ message: "Link revoked. Nobody can open it now." });
    } catch {
      toast({ message: "Couldn't revoke the link. Try again." });
    } finally {
      setLinkBusy(false);
    }
  };
  const dropGuest = async (userId: string) => {
    const gone = guests.find((g) => g.userId === userId);
    setGuests((prev) => prev.filter((g) => g.userId !== userId));
    setConfirmRemove(null);
    try {
      await removeGuest(trip.id, userId);
      toast({ message: `Removed ${gone?.name ?? gone?.email ?? "them"}` });
    } catch {
      if (gone) setGuests((prev) => [...prev, gone]);
      toast({ message: "Couldn't remove them. Try again." });
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const failure = await deleteJourney(createClient(), trip.id);
    if (failure) {
      setDeleting(false);
      toast({ message: failure });
      return;
    }
    leave();
  };

  // ── Calendar picker helpers ─────────────────────────────────────────────────

  const openDatePicker = () => {
    const d = new Date(startDate + "T00:00:00");
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
    setPickStart(startDate);
    setPickEnd(endDate);
    setPickPhase("start");
    setShowDatePicker(true);
  };

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  };

  const handleDayClick = (dateStr: string) => {
    if (pickPhase === "start") {
      setPickStart(dateStr);
      setPickEnd(null);
      setPickPhase("end");
    } else {
      if (pickStart && dateStr < pickStart) {
        setPickStart(dateStr);
        setPickEnd(null);
        // stay in end phase
      } else {
        setPickEnd(dateStr);
        setPickPhase("start");
      }
    }
  };

  const handleDateDone = () => {
    if (pickStart) setStartDate(pickStart);
    if (pickEnd) setEndDate(pickEnd);
    else if (pickStart) setEndDate(pickStart);
    setShowDatePicker(false);
  };

  // Escape closes the innermost thing first. Inside an overlay this listener
  // runs alongside the shell's, which skips Escape while a nested sheet is
  // marked open — so one keypress backs out of the picker, not the screen.
  useEffect(() => {
    if (!showDatePicker && !showCoverSheet && !showDeleteConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShowDatePicker(false);
      setShowCoverSheet(false);
      setShowDeleteConfirm(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showDatePicker, showCoverSheet, showDeleteConfirm]);

  const calCells = buildCalendarDays(calYear, calMonth);

  const calNights =
    pickStart && pickEnd ? Math.max(0, countDays(pickStart, pickEnd) - 1) : null;
  const calSummary =
    pickStart && pickEnd
      ? `${fmtDate(pickStart)} → ${fmtDate(pickEnd)} · ${calNights} night${calNights !== 1 ? "s" : ""}`
      : pickStart
      ? `${fmtDate(pickStart)} → …`
      : "Select start date";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={overlay ? "flex flex-col h-full min-h-0 bg-white" : "flex flex-col min-h-dvh bg-white"}>
      {/* Sticky header. Same row in both hosts; only the dismiss glyph
          changes — a back chevron on the page, a close cross in the overlay. */}
      <div className="flex items-center h-11 border-b border-gray-100 flex-shrink-0 relative bg-white sticky top-0 z-10">
        <button
          onClick={dismiss}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label={overlay ? "Close" : "Back"}
        >
          {overlay ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          )}
        </button>
        <span className="absolute left-0 right-0 text-center text-[16px] font-semibold text-gray-900 pointer-events-none">
          Settings
        </span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="absolute right-1 px-3 h-11 text-[15px] font-semibold text-[#1A1A2E] disabled:opacity-40 transition-opacity"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Scrollable content. pb-24 in the overlay is the phone keyboard's room
          to scroll the last field clear of itself. */}
      <div
        ref={scrollerRef}
        className={
          overlay
            ? "flex-1 min-h-0 overflow-y-auto w-full pb-24 scroll-pb-24"
            : "flex-1 min-h-0 overflow-y-auto md:max-w-[880px] md:mx-auto md:w-full md:px-10 md:pt-12 md:pb-16"
        }
      >

        {/* ── Cover hero ── */}
        <button
          onClick={handleChangeCover}
          className="relative w-full h-[100px] block overflow-hidden flex-shrink-0"
          aria-label="Change cover photo"
        >
          {coverSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverSrc}
              alt="Cover"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setCoverError(true)}
            />
          ) : (
            <div className="absolute inset-0" style={{ background: "#E8E3DA" }} />
          )}
          {/* Scrim + label */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1"
            style={{ background: "rgba(0,0,0,0.25)" }}
          >
            <Camera size={14} weight="light" color="white" />
            <span className="text-white text-[11px] font-medium tracking-wide">
              Change cover
            </span>
          </div>
        </button>

        {/* ── Alerts ── */}
        {warning && (
          <div className="mx-5 mt-3 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
            <p className="text-[13px] text-amber-700 font-medium">{warning}</p>
          </div>
        )}
        {error && (
          <div className="mx-5 mt-3 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-[13px] text-red-600 font-medium">{error}</p>
          </div>
        )}

        {/* ── Inline fields ── */}
        <div className="mt-2">

          {/* Name */}
          <div className="flex items-center px-5 py-[14px] border-b border-black/5">
            <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0">
              Name
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 text-[14px] text-[#1A1A2E] bg-transparent outline-none placeholder:text-gray-300"
              placeholder="Journey name"
            />
          </div>

          {/* Destination */}
          <div className="flex items-center px-5 py-[14px] border-b border-black/5">
            <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0">
              Destination
            </span>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="flex-1 text-[14px] text-[#1A1A2E] bg-transparent outline-none placeholder:text-gray-300"
              placeholder="City, Country"
            />
          </div>

          {/* Dates */}
          <button
            onClick={openDatePicker}
            className="w-full flex items-center px-5 py-[14px] border-b border-black/5 text-left"
          >
            <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0">
              Dates
            </span>
            <span className="flex-1 text-[14px] text-[#1A1A2E]">{dateRangeDisplay}</span>
            <span className="text-[11px] text-gray-400 flex-shrink-0">
              {nightCount} night{nightCount !== 1 ? "s" : ""}
            </span>
          </button>

          {/* Travellers */}
          <div className="flex items-center px-5 py-[14px] border-b border-black/5">
            <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0">
              Travellers
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPartySize((v) => Math.max(1, v - 1))}
                disabled={partySize <= 1}
                className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[14px] leading-none disabled:opacity-30 active:scale-90 transition-transform"
                aria-label="Decrease"
              >
                −
              </button>
              <span className="text-[14px] text-[#1A1A2E] tabular-nums w-4 text-center">
                {partySize}
              </span>
              <button
                onClick={() => setPartySize((v) => v + 1)}
                className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[14px] leading-none active:scale-90 transition-transform"
                aria-label="Increase"
              >
                +
              </button>
            </div>
          </div>

        </div>

        {/* ── Travellers — who's on this journey ── */}
        {TRAVELLERS_ENABLED && (
          <TravellersSection tripId={trip.id} initialPeople={initialPeople} />
        )}

        {/* ── Entry requirements — what the passports need to get in. One row
            under the people it applies to; opens in place. Arriving from the
            Agenda line opens it. ── */}
        <EntrySection
          tripId={trip.id}
          destination={trip.destination}
          startDate={trip.start_date}
          defaultOpen={scrollTo === "entry"}
        />

        {/* ── Notes — the journey facts that belong to no single day. This is
            the always-available home; the Day and Plan ··· menus open the same
            notes in a sheet. ── */}
        {/* Notes used to live here. They're journey CONTENT — the gate code,
            what to pack — not configuration, so they moved to the note glyph
            beside the journey's tabs, reachable from any screen without
            leaving it. */}

        {/* ── Share this journey — guest sharing ── */}
        {/* id anchors the Plan menu's "Share itinerary" deep link (#share) */}
        {/* One sharing flow: this row opens the same sheet as the menu and the
            faces. The full section it replaced was the third copy of the
            invite, with its own words (simplification audit). */}
        {shareAvailable && (
          <div id="share" className="flex px-5 py-[14px] border-b border-black/5" style={{ scrollMarginTop: 24 }}>
            {/* One row for one idea: the label once, then a short stack —
                email, caption, link, who has it. Four separate rows read as
                three sections (Brennan, Sep 2026). */}
            <span className="text-[10px] uppercase tracking-widest text-gray-400 w-20 flex-shrink-0 pt-[3px]">
              Share
            </span>
            <div className="flex-1 min-w-0">
              <form onSubmit={sendShare} className="flex items-center">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  placeholder="Their email address"
                  aria-label="Their email address"
                  className="flex-1 min-w-0 text-[14px] text-[#1A1A2E] bg-transparent outline-none placeholder:text-gray-300"
                />
                <button
                  type="submit"
                  disabled={shareSending || !shareEmail.trim()}
                  className="text-[13px] flex-shrink-0 ml-3 disabled:opacity-30"
                  style={{ color: "#1A1A2E" }}
                >
                  {shareSending ? "Sending…" : "Send"}
                </button>
              </form>
              {shareSentTo && (
                <p className="text-[11.5px] mt-1" style={{ color: "rgba(26,26,46,0.62)" }}>
                  Sent to {shareSentTo} · read-only
                </p>
              )}

              {/* The link line: the action, who has it, the way out. One line;
                  the address itself said nothing once truncated. */}
              <div className="mt-2.5 text-[13px] flex flex-wrap items-center gap-x-1.5 gap-y-1" style={{ color: "rgba(26,26,46,0.62)" }}>
                {shareUrl ? (
                  <button type="button" onClick={copyLink} className="text-[#1A1A2E]">Copy link</button>
                ) : (
                  <button type="button" onClick={createLink} disabled={linkBusy} className="text-[#1A1A2E] disabled:opacity-40">
                    {linkBusy ? "Making a link…" : "Make a link"}
                  </button>
                )}
                {shareUrl && (
                  <>
                    <span aria-hidden="true">·</span>
                    {guests.length === 0 ? (
                      <span>Nobody has opened it yet</span>
                    ) : (
                      guests.map((g, i) => (
                        <span key={g.userId} className="inline-flex items-center gap-1">
                          {confirmRemove === g.userId ? (
                            <>
                              <span className="text-[#1A1A2E]">{g.name ?? g.email}</span>
                              <button type="button" onClick={() => dropGuest(g.userId)} style={{ color: "#A8372B" }}>remove</button>
                              <button type="button" onClick={() => setConfirmRemove(null)}>keep</button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRemove(g.userId)}
                              title={g.email ?? undefined}
                              aria-label={`Remove ${g.name ?? g.email ?? "this guest"}`}
                              className="text-[#1A1A2E]"
                            >
                              {g.name ?? g.email}
                            </button>
                          )}
                          {i < guests.length - 1 && <span aria-hidden="true">,</span>}
                        </span>
                      ))
                    )}
                    <span aria-hidden="true">·</span>
                    {confirmRevoke ? (
                      <>
                        <span>Everyone loses access.</span>
                        <button type="button" onClick={revokeLink} disabled={linkBusy} style={{ color: "#A8372B" }}>Revoke</button>
                        <button type="button" onClick={() => setConfirmRevoke(false)}>Keep</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmRevoke(true)} className="underline underline-offset-2">Revoke</button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Manage journey — quiet text links. An archived journey offers
            Restore in place of Archive; both write through setTripArchived. ── */}
        <div className="py-8 flex items-center justify-center gap-3">
          <button
            onClick={trip.archived ? handleRestore : handleArchive}
            className="text-[12px] text-gray-400 italic cursor-pointer active:opacity-60 transition-opacity px-3 py-3"
            style={{ fontFamily: "inherit" }}
          >
            {trip.archived ? "Restore this journey" : "Archive this journey"}
          </button>
          <span className="text-gray-300 text-[12px]">·</span>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[12px] text-red-300 cursor-pointer active:opacity-60 transition-opacity px-3 py-3"
          >
            Delete permanently
          </button>
        </div>

      </div>{/* end scrollable */}

      {/* ── Cover photo URL sheet ──
          z-[90] clears the overlay shell at z-[80]; on the page route nothing
          sits above it either way. NESTED_SHEET_ATTR tells that shell to leave
          Escape alone while this is up. */}
      {showCoverSheet && (
        <div {...NESTED_SHEET_ATTR}>
          <div
            className="fixed inset-0 bg-black/40 z-[90]"
            onClick={() => setShowCoverSheet(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[90] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "85%" }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-3 pb-2">
              <p className="text-center font-display italic text-base text-gray-900 mb-5">
                Change cover
              </p>
              <input
                type="url"
                value={coverUrlInput}
                onChange={(e) => {
                  setCoverUrlInput(e.target.value);
                  setCoverPreviewError(false);
                }}
                placeholder="Paste an image URL…"
                autoFocus
                className="w-full text-[14px] border-b border-black/10 py-3 outline-none bg-transparent placeholder:text-gray-300 text-[#1A1A2E]"
              />
              {/* Live preview */}
              <div
                className="mt-4 w-full h-[100px] rounded-xl overflow-hidden"
                style={{ background: "#E8E3DA" }}
              >
                {coverUrlInput.trim() && !coverPreviewError && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrlInput.trim()}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    onError={() => setCoverPreviewError(true)}
                  />
                )}
              </div>
            </div>
            <div className="flex-shrink-0 px-5 pt-4 pb-10 space-y-3">
              <button
                onClick={handleSaveCover}
                disabled={savingCover || !coverUrlInput.trim()}
                className="w-full py-3 bg-[#1A1A2E] text-white text-[14px] font-semibold rounded-full disabled:opacity-40 active:scale-[0.99] transition-all"
              >
                {savingCover ? "Saving…" : "Save"}
              </button>
              <button
                onClick={() => setShowCoverSheet(false)}
                className="w-full text-center text-[13px] text-gray-400 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation sheet ── */}
      {showDeleteConfirm && (
        <div {...NESTED_SHEET_ATTR}>
          <div
            className="fixed inset-0 bg-black/40 z-[90]"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[90] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "85%" }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-3">
              <h2 className="text-[22px] text-gray-900 mb-2 font-display italic">
                Delete &ldquo;{trip.title}&rdquo;?
              </h2>
              <p className="text-[14px] text-gray-500 leading-relaxed">
                This will permanently remove the journey and all its cards. This cannot be undone.
              </p>
            </div>
            <div className="flex-shrink-0 px-5 pt-4 pb-10 space-y-2.5">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="w-full py-3.5 rounded-xl bg-[#1A1A2E] text-white text-[15px] font-semibold disabled:opacity-50 active:scale-[0.99] transition-all"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full py-3.5 rounded-xl text-[15px] font-medium text-gray-500 active:scale-[0.99] transition-all"
                style={{ background: "white", border: "0.5px solid rgba(0,0,0,0.10)" }}
              >
                Keep this journey
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Date range picker sheet ── */}
      {showDatePicker && (
        <div {...NESTED_SHEET_ATTR}>
          <div
            className="fixed inset-0 bg-black/40 z-[90]"
            onClick={() => setShowDatePicker(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[90] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "90%" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Sheet title */}
            <p className="text-center font-display italic text-base text-gray-900 pb-3 flex-shrink-0">
              Select dates
            </p>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-2">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="text-[14px] font-semibold text-gray-800">
                  {MONTHS[calMonth]} {calYear}
                </span>
                <button
                  onClick={nextMonth}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 mb-1">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div
                    key={i}
                    className="h-7 flex items-center justify-center text-[9px] text-gray-400 uppercase"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {calCells.map((dateStr, i) => {
                  if (!dateStr) return <div key={`e-${i}`} className="h-9" />;
                  const dayNum = parseInt(dateStr.split("-")[2]);
                  const isStartSel = dateStr === pickStart;
                  const isEndSel = dateStr === pickEnd;
                  const isSelected = isStartSel || isEndSel;
                  const inRange =
                    !!(pickStart && pickEnd && dateStr > pickStart && dateStr < pickEnd);
                  return (
                    <div
                      key={dateStr}
                      className={`relative h-9 flex items-center justify-center ${
                        inRange ? "bg-[#1A1A2E]/10" : ""
                      }`}
                    >
                      <button
                        onClick={() => handleDayClick(dateStr)}
                        className={`w-8 h-8 flex items-center justify-center text-[13px] transition-colors ${
                          isSelected
                            ? "bg-[#1A1A2E] text-white rounded-md"
                            : "text-gray-800 hover:bg-gray-100 rounded-md"
                        }`}
                      >
                        {dayNum}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer — summary + Done */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-t border-gray-50">
              <p className="font-display italic text-[12px] text-gray-400 flex-1 pr-3">
                {calSummary}
              </p>
              <button
                onClick={handleDateDone}
                disabled={!pickStart || !pickEnd}
                className="bg-[#1A1A2E] text-white text-xs font-semibold rounded-full px-5 py-2 disabled:opacity-40 active:scale-95 transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
