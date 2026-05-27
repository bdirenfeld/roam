"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Columns, MapPin, DotsThree } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";

const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.10)";
const CAPTION = "rgba(26,26,46,0.55)";

type TripContext = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  firstDayId: string | null;
};

// Module-level cache — survives client navigations between Agenda / Plan / Map
// for the same trip. Matches the weather supplemental-data pattern in CLAUDE.md.
const CACHE = new Map<string, TripContext>();

function formatDateRange(start: string, end: string): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d)
      .toLocaleDateString("en-US", { month: "short", day: "numeric" })
      .toUpperCase();
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

export default function TripSubBar() {
  const pathname = usePathname() ?? "";
  const match = pathname.match(/^\/trips\/([^/]+)(?:\/(days|plan|map|settings))?/);
  const tripId = match?.[1] ?? null;
  const segment = (match?.[2] ?? null) as "days" | "plan" | "map" | "settings" | null;

  const [ctx, setCtx] = useState<TripContext | null>(
    () => (tripId ? CACHE.get(tripId) ?? null : null),
  );

  useEffect(() => {
    if (!tripId || segment === "settings") return;
    const cached = CACHE.get(tripId);
    if (cached) { setCtx(cached); return; }

    let cancelled = false;
    const supabase = createClient();
    (async () => {
      try {
        const [{ data: trip }, { data: days }] = await Promise.all([
          supabase
            .from("trips")
            .select("id, title, start_date, end_date")
            .eq("id", tripId)
            .single(),
          supabase
            .from("days")
            .select("id")
            .eq("trip_id", tripId)
            .order("day_number", { ascending: true })
            .limit(1),
        ]);
        if (cancelled || !trip) return;
        const next: TripContext = {
          id: trip.id,
          title: trip.title,
          start_date: trip.start_date,
          end_date: trip.end_date,
          firstDayId: days?.[0]?.id ?? null,
        };
        CACHE.set(tripId, next);
        setCtx(next);
      } catch (err) {
        console.error("[TripSubBar] trip fetch failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [tripId, segment]);

  // Hide outside trip routes, on settings (its own header), and while loading
  if (!tripId || segment === "settings" || !ctx) return null;

  const activeTab: "agenda" | "plan" | "map" =
    segment === "plan" ? "plan" : segment === "map" ? "map" : "agenda";

  const agendaHref = ctx.firstDayId
    ? `/trips/${tripId}/days/${ctx.firstDayId}`
    : `/trips/${tripId}`;

  const TABS = [
    { id: "agenda" as const, label: "Agenda", icon: Calendar, href: agendaHref },
    { id: "plan" as const, label: "Plan", icon: Columns, href: `/trips/${tripId}/plan` },
    { id: "map" as const, label: "Map", icon: MapPin, href: `/trips/${tripId}/map` },
  ];

  return (
    <div
      className="hidden md:flex"
      style={{
        height: 56,
        paddingLeft: 28,
        paddingRight: 28,
        alignItems: "center",
        gap: 20,
        borderBottom: `1px solid ${RULE}`,
        background: "#FAF7F2",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
        <span
          className="font-display italic"
          style={{
            fontWeight: 500,
            fontSize: 19,
            color: INK,
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 360,
          }}
        >
          {ctx.title}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: CAPTION,
            letterSpacing: "0.14em",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {formatDateRange(ctx.start_date, ctx.end_date)}
        </span>
      </div>

      <div style={{ width: 1, height: 22, background: RULE, flexShrink: 0 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        {TABS.map((t) => {
          const on = t.id === activeTab;
          const Icon = t.icon;
          return (
            <Link
              key={t.id}
              href={t.href}
              style={{
                background: on ? "#fff" : "transparent",
                padding: "8px 14px",
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                gap: 7,
                fontWeight: on ? 600 : 500,
                fontSize: 13,
                color: on ? INK : CAPTION,
                boxShadow: on
                  ? `0 0 0 1px ${RULE}, 0 1px 2px rgba(26,26,46,0.05)`
                  : "none",
                letterSpacing: "-0.005em",
                textDecoration: "none",
              }}
            >
              <Icon size={14} weight="light" color={on ? INK : CAPTION} />
              {t.label}
            </Link>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <Link
        href={`/trips/${tripId}/settings`}
        aria-label="Trip settings"
        className="flex items-center justify-center w-9 h-9 transition-colors hover:text-[color:var(--color-activity)]"
        style={{ color: CAPTION, flexShrink: 0 }}
      >
        <DotsThree size={20} weight="light" />
      </Link>
    </div>
  );
}
