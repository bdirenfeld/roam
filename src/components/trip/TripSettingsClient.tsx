"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { Trip, Day } from "@/types/database";

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

const TRIP_TYPES = ["Solo", "Couple", "Family", "Group"] as const;
const TRIP_PURPOSES = ["Leisure", "Business", "Mixed"] as const;

export default function TripSettingsClient({ trip, days }: Props) {
  const router = useRouter();

  // Form state
  const [title, setTitle] = useState(trip.title);
  const [destination, setDestination] = useState(trip.destination);
  const [startDate, setStartDate] = useState(trip.start_date);
  const [endDate, setEndDate] = useState(trip.end_date);
  const [partySize, setPartySize] = useState(trip.party_size);
  const [tripType, setTripType] = useState(trip.trip_type ?? "");
  const [tripPurpose, setTripPurpose] = useState(trip.trip_purpose ?? "");

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dayCount = countDays(startDate, endDate);
  const nightCount = dayCount - 1;
  const dateRangeDisplay = `${fmtDate(startDate)} → ${fmtDate(endDate)}`;
  const dateSummary = `${dayCount} day${dayCount !== 1 ? "s" : ""} · ${nightCount} night${nightCount !== 1 ? "s" : ""}`;

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

      // Update trips table
      const { error: tripError } = await supabase
        .from("trips")
        .update({
          title: title.trim(),
          destination: destination.trim(),
          start_date: startDate,
          end_date: endDate,
          party_size: partySize,
          trip_type: tripType || null,
          trip_purpose: tripPurpose || null,
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

      // Insert new days if end_date increased
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
    if (!confirm("Archive this trip? It will be marked as completed.")) return;
    const supabase = createClient();
    await supabase.from("trips").update({ status: "completed" }).eq("id", trip.id);
    router.push("/");
  };

  return (
    <div className="flex flex-col min-h-dvh bg-white">
      {/* Header */}
      <div className="flex items-center h-11 border-b border-gray-100 flex-shrink-0 relative bg-white sticky top-0 z-10">
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Back"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="absolute left-0 right-0 text-center text-[16px] font-semibold text-gray-900 pointer-events-none">
          Trip settings
        </span>
        <button
          onClick={handleSave}
          disabled={saving}
          className="absolute right-4 text-[15px] text-[#1A1A2E] disabled:opacity-40 transition-opacity"
          style={{ fontWeight: 600 }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {/* Alerts */}
      {warning && (
        <div className="mx-4 mt-3 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-xl">
          <p className="text-[13px] text-amber-700 font-medium">{warning}</p>
        </div>
      )}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2.5 bg-red-50 border border-red-100 rounded-xl">
          <p className="text-[13px] text-red-600 font-medium">{error}</p>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-6 pb-24 space-y-8">

          {/* ── TRIP DETAILS ──────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Trip details
            </p>
            <div className="space-y-4">

              {/* Cover photo */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-[14px] text-gray-700">Cover photo</span>
                <div className="flex items-center gap-2.5">
                  {trip.cover_image_url ? (
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                      <Image
                        src={trip.cover_image_url}
                        alt="Cover"
                        width={40}
                        height={40}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0" />
                  )}
                  <span className="text-[13px] text-gray-400">Change</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#D1D5DB"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-3 text-[15px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:bg-white transition-colors"
                />
              </div>

              {/* Destination */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Destination
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className="w-full px-3.5 py-3 text-[15px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:bg-white transition-colors"
                />
              </div>

              {/* Dates */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Dates
                </label>
                <button
                  onClick={() => setShowDatePicker(true)}
                  className="w-full px-3.5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-left flex items-center justify-between hover:border-gray-300 transition-colors"
                >
                  <div>
                    <p className="text-[15px] text-gray-900">{dateRangeDisplay}</p>
                    <p className="text-[12px] text-gray-400 mt-0.5">{dateSummary}</p>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#D1D5DB"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>

            </div>
          </section>

          {/* ── GROUP ─────────────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Group
            </p>
            <div className="space-y-5">

              {/* Travellers stepper */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Travellers
                </label>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setPartySize((v) => Math.max(1, v - 1))}
                    disabled={partySize <= 1}
                    className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-[20px] font-medium text-gray-600 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-30"
                    aria-label="Decrease travellers"
                  >
                    −
                  </button>
                  <span className="text-[20px] font-bold text-gray-900 w-6 text-center tabular-nums">
                    {partySize}
                  </span>
                  <button
                    onClick={() => setPartySize((v) => v + 1)}
                    className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-[20px] font-medium text-gray-600 hover:bg-gray-200 active:scale-95 transition-all"
                    aria-label="Increase travellers"
                  >
                    +
                  </button>
                  <span className="text-[13px] text-gray-400">
                    {partySize === 1 ? "traveller" : "travellers"}
                  </span>
                </div>
              </div>

              {/* Type pills */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {TRIP_TYPES.map((t) => {
                    const val = t.toLowerCase();
                    const active = tripType === val;
                    return (
                      <button
                        key={t}
                        onClick={() => setTripType(active ? "" : val)}
                        className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all ${
                          active
                            ? "bg-[#1A1A2E] text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Purpose pills */}
              <div>
                <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Purpose
                </label>
                <div className="flex flex-wrap gap-2">
                  {TRIP_PURPOSES.map((p) => {
                    const val = p.toLowerCase();
                    const active = tripPurpose === val;
                    return (
                      <button
                        key={p}
                        onClick={() => setTripPurpose(active ? "" : val)}
                        className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all ${
                          active
                            ? "bg-[#1A1A2E] text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </section>

          {/* ── DANGER ZONE ───────────────────────────────────── */}
          <section>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Danger zone
            </p>
            <button
              onClick={handleArchive}
              className="w-full py-3 px-4 rounded-xl bg-red-50 border border-red-100 text-[14px] font-medium text-red-600 text-left flex items-center justify-between hover:bg-red-100 transition-colors active:scale-[0.99]"
            >
              Archive trip
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </section>

        </div>
      </div>

      {/* Date range picker bottom sheet */}
      {showDatePicker && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-[60]"
            onClick={() => setShowDatePicker(false)}
          />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-[60] max-w-mobile mx-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 bg-gray-200 rounded-full" />
            </div>
            <div className="px-4 pt-2 pb-8">
              <p className="text-[15px] font-semibold text-gray-900 mb-4">Change dates</p>
              <div className="flex items-end gap-3 mb-3">
                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-gray-400 mb-1.5">
                    Start date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (endDate && e.target.value > endDate) setEndDate(e.target.value);
                    }}
                    className="w-full px-3 py-2.5 text-[14px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:bg-white transition-colors"
                  />
                </div>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="flex-shrink-0 mb-3"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
                <div className="flex-1">
                  <label className="block text-[11px] font-medium text-gray-400 mb-1.5">
                    End date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-[14px] bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-gray-400 focus:bg-white transition-colors"
                  />
                </div>
              </div>
              {startDate && endDate && (
                <p className="text-[12px] text-gray-400 mb-4">
                  {countDays(startDate, endDate)} days ·{" "}
                  {countDays(startDate, endDate) - 1} nights
                </p>
              )}
              <button
                onClick={() => setShowDatePicker(false)}
                className="w-full py-3 rounded-xl bg-[#1A1A2E] text-white text-[14px] font-semibold hover:opacity-90 transition-opacity"
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
