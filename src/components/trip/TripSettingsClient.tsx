"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import type { Trip, Day } from "@/types/database";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface Props {
  trip: Trip;
  days: Day[];
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

export default function TripSettingsClient({ trip, days }: Props) {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState(trip.title);
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
    if (!title.trim()) { setError("Trip name is required."); return; }

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

      router.back();
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    const supabase = createClient();
    await supabase.from("trips").update({ status: "completed" }).eq("id", trip.id);
    router.push("/");
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from("cards").delete().eq("trip_id", trip.id);
    await supabase.from("days").delete().eq("trip_id", trip.id);
    await supabase.from("trips").delete().eq("id", trip.id);
    router.push("/");
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
    <div className="flex flex-col min-h-dvh bg-white">
      {/* Sticky header */}
      <div className="flex items-center h-11 border-b border-gray-100 flex-shrink-0 relative bg-white sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="absolute left-0 right-0 text-center text-[16px] font-semibold text-gray-900 pointer-events-none">
          Trip settings
        </span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="absolute right-4 text-[15px] font-semibold text-[#1A1A2E] disabled:opacity-40 transition-opacity"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

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
              placeholder="Trip name"
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

        {/* ── Manage journey — quiet text links ── */}
        <div className="py-8 flex items-center justify-center gap-3">
          <button
            onClick={handleArchive}
            className="text-[12px] text-gray-400 italic cursor-pointer active:opacity-60 transition-opacity"
            style={{ fontFamily: "inherit" }}
          >
            Archive this journey
          </button>
          <span className="text-gray-300 text-[12px]">·</span>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-[12px] text-red-300 cursor-pointer active:opacity-60 transition-opacity"
          >
            Delete permanently
          </button>
        </div>

      </div>{/* end scrollable */}

      {/* ── Cover photo URL sheet ── */}
      {showCoverSheet && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => setShowCoverSheet(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[60] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "85vh" }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 pt-3 pb-2">
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
        </>
      )}

      {/* ── Delete confirmation sheet ── */}
      {showDeleteConfirm && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => setShowDeleteConfirm(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[60] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "85vh" }}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="flex-1 overflow-y-auto px-5 pt-3">
              <h2 className="text-[22px] text-gray-900 mb-2 font-display italic">
                Delete &ldquo;{trip.title}&rdquo;?
              </h2>
              <p className="text-[14px] text-gray-500 leading-relaxed">
                This will permanently remove the trip and all its cards. This cannot be undone.
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
        </>
      )}

      {/* ── Date range picker sheet ── */}
      {showDatePicker && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => setShowDatePicker(false)}
          />
          <div
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[60] max-w-mobile mx-auto flex flex-col"
            style={{ maxHeight: "90vh" }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Sheet title */}
            <p className="text-center font-display italic text-base text-gray-900 pb-3 flex-shrink-0">
              Select dates
            </p>

            <div className="flex-1 overflow-y-auto px-4 pb-2">
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
        </>
      )}
    </div>
  );
}
