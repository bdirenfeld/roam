"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, CircleNotch } from "@phosphor-icons/react";

export type BoardBg =
  | { type: "color"; value: string }
  | { type: "photo"; url: string; thumb: string };

interface UnsplashPhoto {
  id: string;
  urls: { regular: string; thumb: string; small: string };
  alt_description: string | null;
  user: { name: string };
}

const PRESET_COLORS: { label: string; value: string }[] = [
  { label: "White",      value: "#ffffff" },
  { label: "Cloud",      value: "#F1F2F4" },
  { label: "Slate",      value: "#E2E8F0" },
  { label: "Sky",        value: "#E0F2FE" },
  { label: "Sage",       value: "#DCFCE7" },
  { label: "Blush",      value: "#FCE7F3" },
  { label: "Sand",       value: "#FEF3C7" },
  { label: "Terracotta", value: "#FDE8E0" },
];

interface Props {
  current:  BoardBg;
  onSelect: (bg: BoardBg) => void;
  onClose:  () => void;
}

export default function BoardBgPicker({ current, onSelect, onClose }: Props) {
  const sheetRef  = useRef<HTMLDivElement>(null);
  const dragY     = useRef(0);
  const dragging  = useRef(false);

  const [query,    setQuery]    = useState("");
  const [photos,   setPhotos]   = useState<UnsplashPhoto[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);

  const unsplashKey = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;

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

  // Drag-to-dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragY.current = e.touches[0].clientY; dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - dragY.current);
    sheetRef.current.style.transform  = `translateY(${dy}px)`;
    sheetRef.current.style.transition = "none";
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragging.current || !sheetRef.current) return;
    dragging.current = false;
    const dy = e.changedTouches[0].clientY - dragY.current;
    if (dy > 120) {
      sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32,0.72,0,1)";
      sheetRef.current.style.transform  = "translateY(100%)";
      setTimeout(onClose, 240);
    } else {
      sheetRef.current.style.transition = "transform 300ms cubic-bezier(0.34,1.56,0.64,1)";
      sheetRef.current.style.transform  = "translateY(0)";
    }
  }, [onClose]);

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !unsplashKey) return;
    setLoading(true);
    setSearched(true);
    try {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query.trim())}&per_page=9&orientation=landscape`;
      const res  = await fetch(url, { headers: { Authorization: `Client-ID ${unsplashKey}` } });
      const data = await res.json() as { results: UnsplashPhoto[] };
      setPhotos(data.results ?? []);
    } catch {
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [query, unsplashKey]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" />

      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative w-full max-w-mobile mx-auto bg-white rounded-t-2xl shadow-sheet max-h-[80dvh] flex flex-col animate-in slide-in-from-bottom duration-300"
        style={{ willChange: "transform" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2.5 flex-shrink-0">
          <div className="w-9 h-[3px] rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-[15px] font-bold text-gray-900">Board Background</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <X size={13} weight="light" color="#6B7280" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto pb-8">
          {/* Color swatches */}
          <div className="px-5 pt-4 pb-3">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">Colors</p>
            <div className="grid grid-cols-8 gap-2">
              {PRESET_COLORS.map(({ label, value }) => {
                const isActive = current.type === "color" && current.value === value;
                return (
                  <button
                    key={value}
                    onClick={() => onSelect({ type: "color", value })}
                    title={label}
                    className={`w-full aspect-square rounded-lg border-2 transition-all ${
                      isActive ? "border-teal-500 scale-110" : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: value, boxShadow: value === "#ffffff" ? "inset 0 0 0 1px #E5E7EB" : undefined }}
                  />
                );
              })}
            </div>
          </div>

          {/* Unsplash photos — only shown when key is configured */}
          {unsplashKey && (
            <div className="px-5 pt-2">
              <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">Photos</p>

              {/* Search bar */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search Unsplash…"
                  className="flex-1 text-[13px] bg-gray-100 rounded-lg px-3 py-2 outline-none placeholder:text-gray-400"
                />
                <button
                  onClick={handleSearch}
                  disabled={!query.trim() || loading}
                  className="px-3 py-2 bg-teal-600 text-white text-[12px] font-semibold rounded-lg disabled:opacity-50 hover:bg-teal-700 transition-colors"
                >
                  {loading ? "…" : "Search"}
                </button>
              </div>

              {/* Photo grid */}
              {loading ? (
                <div className="flex justify-center py-6">
                  <CircleNotch size={20} weight="light" color="#9CA3AF" className="animate-spin" />
                </div>
              ) : searched && photos.length === 0 ? (
                <p className="text-[13px] text-gray-400 text-center py-4">No photos found</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo) => {
                    const isActive = current.type === "photo" && current.url === photo.urls.regular;
                    return (
                      <button
                        key={photo.id}
                        onClick={() => onSelect({ type: "photo", url: photo.urls.regular, thumb: photo.urls.small })}
                        className={`relative rounded-lg overflow-hidden aspect-video border-2 transition-all ${
                          isActive ? "border-teal-500" : "border-transparent hover:border-white/60"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.urls.thumb}
                          alt={photo.alt_description ?? ""}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
