"use client";

import type { Card } from "@/types/database";

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width="12" height="12" viewBox="0 0 24 24"
          fill={rating >= i - 0.25 ? "#F59E0B" : "none"}
          stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

const SUB_TYPE_LABEL: Record<string, string> = {
  restaurant:     "Restaurant",
  fine_dining:    "Fine Dining",
  street_food:    "Street Food",
  coffee:         "Coffee",
  coffee_dessert: "Coffee & Pastry",
  cocktail_bar:   "Cocktail Bar",
  drinks:         "Bar",
  guided:         "Guided",
  wellness:       "Wellness",
  hotel:          "Hotel",
};

const POPUP_W  = 300;
const PIN_R    = 14; // pin radius px
const ARROW_H  = 8;  // triangle height px
const GAP      = 4;  // gap between arrow tip and pin top

interface Props {
  card: Card;
  anchorPos?: { x: number; y: number } | null;
  onClose: () => void;
}

export default function MapPinPopup({ card, anchorPos, onClose }: Props) {
  const details          = card.details as Record<string, unknown> | null;
  const phone            = details?.phone as string | undefined;
  const rating           = details?.rating as number | undefined;
  const userRatingsTotal = details?.userRatingsTotal as number | undefined;
  const subTypeLabel     = card.sub_type ? (SUB_TYPE_LABEL[card.sub_type] ?? card.sub_type) : null;
  const hasPhoto         = !!card.cover_image_url;

  if (anchorPos) {
    const vw      = typeof window !== "undefined" ? window.innerWidth : 800;
    const rawLeft = anchorPos.x - POPUP_W / 2;
    const left    = Math.max(8, Math.min(rawLeft, vw - POPUP_W - 8));
    // Arrow offset from popup left so it points at the pin
    const arrowLeft = Math.max(16, Math.min(POPUP_W - 16, anchorPos.x - left));
    // Bottom of popup (before arrow) sits PIN_R + GAP above pin centre
    const bottomY = anchorPos.y - PIN_R - GAP;

    return (
      <div
        style={{
          position: "fixed",
          left,
          top: bottomY,
          transform: "translateY(-100%)",
          width: POPUP_W,
          zIndex: 50,
          paddingBottom: ARROW_H,
          pointerEvents: "auto",
        }}
      >
        {/* Card */}
        <div
          className="bg-white rounded-2xl overflow-hidden flex flex-col"
          style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.20)", maxHeight: "60vh" }}
        >
          {/* Cover photo */}
          {hasPhoto ? (
            <div className="w-full h-36 flex-shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.cover_image_url!} alt={card.title} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div
              className="w-full h-16 flex-shrink-0 flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)" }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#86EFAC" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"
            style={{ backdropFilter: "blur(8px)" }}
            aria-label="Close"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* Content */}
          <div className="px-4 pt-3 pb-4 overflow-y-auto flex-1">
            {subTypeLabel && (
              <span className="inline-block text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mb-1.5">
                {subTypeLabel}
              </span>
            )}
            <h2 className="text-[15px] font-bold text-gray-900 leading-snug">{card.title}</h2>
            {rating !== undefined && (
              <div className="flex items-center gap-2 mt-1">
                <StarRating rating={rating} />
                <span className="text-[12px] font-semibold text-gray-700">{rating.toFixed(1)}</span>
                {userRatingsTotal && (
                  <span className="text-[11px] text-gray-400">({userRatingsTotal.toLocaleString()})</span>
                )}
              </div>
            )}
            {card.address && (
              <p className="text-[12px] text-gray-500 mt-1.5 leading-snug">{card.address}</p>
            )}
            {phone && (
              <a href={`tel:${phone}`} className="block text-[12px] text-blue-500 mt-1 hover:underline">{phone}</a>
            )}
            <div className="flex gap-2 mt-3">
              {card.lat != null && card.lng != null && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${card.lat},${card.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 border border-blue-100 text-[11px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                    <circle cx="12" cy="9" r="2.5" />
                  </svg>
                  Google Maps
                </a>
              )}
              {card.source_url && (
                <a
                  href={card.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-50 border border-gray-100 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Website
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Downward triangle arrow pointing at pin */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: arrowLeft,
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: `${ARROW_H}px solid transparent`,
            borderRight: `${ARROW_H}px solid transparent`,
            borderTop: `${ARROW_H}px solid white`,
          }}
        />
      </div>
    );
  }

  // Fallback: centered modal when anchorPos not available
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/30 animate-in fade-in duration-150" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl overflow-hidden w-full max-w-sm animate-in zoom-in-95 duration-200 max-h-[85dvh] flex flex-col"
        style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
      >
        {hasPhoto ? (
          <div className="w-full h-48 flex-shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.cover_image_url!} alt={card.title} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div
            className="w-full h-24 flex-shrink-0 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)" }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#86EFAC" strokeWidth="1.5" strokeLinecap="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
        )}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center backdrop-blur-sm hover:bg-black/60 transition-colors"
          aria-label="Close"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="px-5 pt-4 pb-5 overflow-y-auto flex-1">
          {subTypeLabel && (
            <span className="inline-block text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mb-2">
              {subTypeLabel}
            </span>
          )}
          <h2 className="text-[18px] font-bold text-gray-900 leading-snug">{card.title}</h2>
          {rating !== undefined && (
            <div className="flex items-center gap-2 mt-1.5">
              <StarRating rating={rating} />
              <span className="text-[13px] font-semibold text-gray-700">{rating.toFixed(1)}</span>
              {userRatingsTotal && (
                <span className="text-[12px] text-gray-400">({userRatingsTotal.toLocaleString()} reviews)</span>
              )}
            </div>
          )}
          {card.address && (
            <p className="text-[13px] text-gray-500 mt-2 leading-snug">{card.address}</p>
          )}
          {phone && (
            <a href={`tel:${phone}`} className="block text-[13px] text-blue-500 mt-1.5 hover:underline">{phone}</a>
          )}
          <div className="flex gap-2 mt-4">
            {card.lat != null && card.lng != null && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${card.lat},${card.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-50 border border-blue-100 text-[12px] font-semibold text-blue-600 hover:bg-blue-100 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
                  <circle cx="12" cy="9" r="2.5" />
                </svg>
                Google Maps
              </a>
            )}
            {card.source_url && (
              <a
                href={card.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-[12px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                Website
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
