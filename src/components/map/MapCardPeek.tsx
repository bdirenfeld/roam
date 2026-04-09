"use client";

import Link from "next/link";
import type { Card, Day, CardDetails } from "@/types/database";
import { PIN_COLORS, getIconSVG } from "@/lib/mapPins";
import { CaretRight } from "@phosphor-icons/react";

interface Props {
  card: Card;
  day: Day | undefined;
  tripId: string;
  onClose: () => void;
}

function fmt(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const p = h >= 12 ? "PM" : "AM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${p}`;
}

function durStr(mins: number | undefined): string {
  if (!mins) return "";
  return mins >= 60
    ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`
    : `${mins}m`;
}

/** One-line smart description pulled from the most useful field per sub-type. */
function smartDesc(card: Card): string {
  const d  = card.details as CardDetails;
  const t0 = fmt(card.start_time);

  switch (card.sub_type) {
    case "flight_arrival":
      return [d.airline, d.arrival_time ? fmt(d.arrival_time) : t0].filter(Boolean).join(" · ");
    case "flight_departure":
      return [d.airline, d.departure_time ? fmt(d.departure_time) : t0].filter(Boolean).join(" · ");
    case "hotel":
      return d.estimated_accommodation_arrival
        ? `Check-in ${fmt(d.estimated_accommodation_arrival)}`
        : t0 ? `Check-in ${t0}` : (card.address ?? "");
    case "restaurant": {
      const res = d.reservation_status;
      const rt  = d.reservation_time ? fmt(d.reservation_time) : t0;
      if (res === "reserved" || res === "booked") return `Reserved${rt ? ` · ${rt}` : ""}`;
      return rt ? `Walk-in · ${rt}` : "Walk-in";
    }
    case "coffee_dessert":
    case "drinks":
      return [card.address, t0].filter(Boolean).join(" · ");
    case "hosted":
      return [d.supplier, d.meeting_time ? fmt(d.meeting_time) : t0].filter(Boolean).join(" · ");
    case "self_directed": {
      const dur    = durStr(d.duration_minutes);
      const energy = d.ai_enriched?.energy_level;
      return [dur, energy ? `${energy} energy` : ""].filter(Boolean).join(" · ");
    }
    case "wellness": {
      const dur = durStr(d.duration_minutes);
      return [dur, d.treatment_type].filter(Boolean).join(" · ");
    }
    case "street_food":
      return [card.address, t0].filter(Boolean).join(" · ");
    case "transportation":
    case "transfer":
      return t0 || card.address || "";
    default: {
      // Fall back to the first short string value in details
      for (const v of Object.values(d as Record<string, unknown>)) {
        if (typeof v === "string" && v.length > 0 && v.length < 80) return v;
      }
      return card.address ?? t0;
    }
  }
}

export default function MapCardPeek({ card, day, tripId, onClose }: Props) {
  const color = PIN_COLORS[card.type] ?? "#64748B";
  const desc  = smartDesc(card);
  const href  = day
    ? `/trips/${tripId}/days/${day.id}`
    : `/trips/${tripId}`;

  return (
    /* Slides up 130px from the bottom edge — no rounded top, no shadow */
    <div className="absolute bottom-0 left-0 right-0 animate-in slide-in-from-bottom-[130px] duration-200" style={{ zIndex: 10 }}>
      {/* Hairline top rule */}
      <div className="h-px w-full" style={{ background: "#E5E7EB" }} />

      <div className="bg-white">
        <Link
          href={href}
          className="flex items-start gap-3 px-4 py-4 active:bg-gray-50 transition-colors"
          onClick={onClose}
        >
          {/* Sub-type icon */}
          <div
            className="flex-shrink-0 mt-0.5"
            dangerouslySetInnerHTML={{ __html: getIconSVG(card.sub_type, color, 16) }}
          />

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-gray-900 leading-snug truncate">
              {card.title}
            </p>
            {desc && (
              <p className="text-[12px] mt-0.5 truncate" style={{ color: "#64748B" }}>
                {desc}
              </p>
            )}
          </div>

          {/* Arrow */}
          <CaretRight size={16} weight="light" color="#9CA3AF" className="flex-shrink-0 mt-0.5" />
        </Link>
      </div>
    </div>
  );
}
