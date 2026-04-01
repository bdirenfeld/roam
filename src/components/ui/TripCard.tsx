"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TripCover from "./TripCover";
import type { Trip, TripStatus } from "@/types/database";

interface Props {
  trip: Trip;
  firstDayId?: string;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil(
    (new Date(dateStr + "T00:00:00").getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

function formatDateRange(start: string, end: string): string {
  const fmt = (d: Date, year = false) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(year ? { year: "numeric" } : {}),
    });
  return `${fmt(new Date(start + "T00:00:00"))} – ${fmt(new Date(end + "T00:00:00"), true)}`;
}

function tripNights(start: string, end: string): number {
  return Math.round(
    (new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

const STATUS: Record<TripStatus, { label: string; dot: string; text: string }> = {
  planning:  { label: "Planning",  dot: "bg-blue-400",  text: "text-blue-600"  },
  active:    { label: "Active",    dot: "bg-green-400", text: "text-green-600" },
  completed: { label: "Completed", dot: "bg-gray-300",  text: "text-gray-400"  },
};

export default function TripCard({ trip, firstDayId }: Props) {
  const router   = useRouter();
  const supabase = createClient();

  const [menuOpen, setMenuOpen]             = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [coverUrl, setCoverUrl]             = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const tripHref = firstDayId ? `/trips/${trip.id}/days/${firstDayId}` : `/trips/${trip.id}`;
  const countdown = daysUntil(trip.start_date);
  const nights    = tripNights(trip.start_date, trip.end_date);
  const status    = STATUS[trip.status] ?? STATUS.planning;

  const countdownLabel =
    countdown > 1 ? `${countdown} days away` :
    countdown === 1 ? "Tomorrow" :
    countdown === 0 ? "Today" : null;

  // Unsplash cover photo — fetch once, cache in localStorage
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;
    if (!key) return;

    const cacheKey = `roam_trip_cover_${trip.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      setCoverUrl(cached);
      return;
    }

    const query = trip.destination.split(",")[0].trim();
    fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${key}` } },
    )
      .then((r) => r.json())
      .then((data) => {
        const url = data?.results?.[0]?.urls?.regular as string | undefined;
        if (url) {
          localStorage.setItem(cacheKey, url);
          setCoverUrl(url);
        }
      })
      .catch(() => {});
  }, [trip.id, trip.destination]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleArchive = useCallback(async () => {
    setMenuOpen(false);
    await supabase
      .from("trips")
      .update({
        archived:    !trip.archived,
        archived_at: trip.archived ? null : new Date().toISOString(),
      })
      .eq("id", trip.id);
    router.refresh();
  }, [trip.id, trip.archived, supabase, router]);

  const handleDelete = useCallback(async () => {
    await supabase.from("trips").delete().eq("id", trip.id);
    router.refresh();
  }, [trip.id, supabase, router]);

  return (
    <>
      <article
        className="rounded-2xl border border-gray-100 bg-white shadow-card hover:shadow-card-hover overflow-hidden transition-shadow duration-150 active:scale-[0.99] cursor-pointer"
        onClick={() => router.push(tripHref)}
      >
        {/* Cover image / gradient */}
        <div className="relative w-full h-32">
          {coverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={coverUrl}
                alt={trip.destination}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div
                className="absolute inset-0"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.45))" }}
              />
            </>
          ) : (
            <TripCover
              destination={trip.destination}
              coverImageUrl={trip.cover_image_url}
              className="absolute inset-0 w-full h-full"
            />
          )}

          {/* ··· context menu */}
          <div
            ref={menuRef}
            className="absolute top-2 right-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="w-7 h-7 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center hover:bg-black/40 transition-colors"
              aria-label="Trip options"
            >
              <svg width="14" height="4" viewBox="0 0 14 4" fill="white">
                <circle cx="2"  cy="2" r="1.5" />
                <circle cx="7"  cy="2" r="1.5" />
                <circle cx="12" cy="2" r="1.5" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute top-8 right-0 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden min-w-[140px] z-20">
                <button
                  onClick={handleArchive}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="21 8 21 21 3 21 3 8" />
                    <rect x="1" y="3" width="22" height="5" />
                    <line x1="10" y1="12" x2="14" y2="12" />
                  </svg>
                  {trip.archived ? "Unarchive" : "Archive"}
                </button>
                <div className="h-px bg-gray-100" />
                <button
                  onClick={() => { setMenuOpen(false); setShowDeleteConfirm(true); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2.5"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4h6v2" />
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-4 py-3.5">
          {/* Top row: title + status */}
          <div className="flex items-start justify-between gap-3">
            <h3 className={`text-sm font-bold leading-snug ${trip.archived ? "text-gray-400" : "text-gray-900"}`}>
              {trip.title}
            </h3>
            <div className={`flex items-center gap-1.5 shrink-0 ${status.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              <span className="text-[11px] font-semibold">{status.label}</span>
            </div>
          </div>

          {/* Destination */}
          <div className="flex items-center gap-1 mt-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className={`text-xs ${trip.archived ? "text-gray-300" : "text-gray-400"}`}>{trip.destination}</span>
          </div>

          {/* Bottom row: dates · nights · countdown */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className={`text-xs ${trip.archived ? "text-gray-300" : "text-gray-500"}`}>
              {formatDateRange(trip.start_date, trip.end_date)}
            </span>
            <span className="text-gray-200 text-xs">·</span>
            <span className={`text-xs ${trip.archived ? "text-gray-300" : "text-gray-400"}`}>{nights}n</span>

            {countdownLabel && !trip.archived && (
              <>
                <span className="text-gray-200 text-xs">·</span>
                <span className={`text-xs font-semibold ${countdown <= 3 && countdown >= 0 ? "text-activity" : "text-gray-400"}`}>
                  {countdownLabel}
                </span>
              </>
            )}

            {trip.party_size > 1 && (
              <>
                <span className="text-gray-200 text-xs">·</span>
                <span className={`text-xs flex items-center gap-0.5 ${trip.archived ? "text-gray-300" : "text-gray-400"}`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                  </svg>
                  {trip.party_size}
                </span>
              </>
            )}
          </div>
        </div>
      </article>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-[320px] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-bold text-gray-900 mb-1.5">Delete trip?</h3>
            <p className="text-[13px] text-gray-500 mb-5">
              &ldquo;{trip.title}&rdquo; and all its days and cards will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
