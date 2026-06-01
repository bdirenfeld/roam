"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserCircle, Calendar, Columns, MapPin } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/lib/auth-actions";
import { isTripGuest } from "@/lib/trip-access-client";

const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.10)";
const CAPTION = "rgba(26,26,46,0.55)";
const CAPTION_SOFT = "rgba(26,26,46,0.35)";

type UserSummary = { name: string | null; email: string | null };

type TripContext = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  firstDayId: string | null;
};

// Module-level cache — survives client navigations and avoids re-hitting
// supabase.auth.getUser() on every masthead mount or dropdown open.
let USER_CACHE: UserSummary | null = null;

// Module-level cache — survives client navigations between Agenda / Plan / Map
// for the same trip. Matches the weather supplemental-data pattern in CLAUDE.md.
const TRIP_CACHE = new Map<string, TripContext>();

function formatDateRange(start: string, end: string): string {
  const fmt = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d)
      .toLocaleDateString("en-US", { month: "short", day: "numeric" })
      .toUpperCase();
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Desktop-only masthead. Renders at ≥768px above the (app) content area.
 */
export default function DesktopMasthead() {
  const pathname = usePathname() ?? "";
  const onJourneys = !pathname.startsWith("/trips/");

  // Derive trip ID + section segment from the current path. Matches
  // /trips/{id}, /trips/{id}/plan, /trips/{id}/days/{dayId}, /trips/{id}/map,
  // /trips/{id}/settings. Excludes /trips, /trips/new, and non-trip routes.
  const tripMatch = /^\/trips\/([^/]+)(?:\/(days|plan|map|settings))?/.exec(pathname);
  const currentTripId =
    tripMatch && tripMatch[1] !== "new" ? tripMatch[1] : null;
  const segment = (tripMatch?.[2] ?? null) as
    | "days" | "plan" | "map" | "settings" | null;
  const showTripStrip = !!currentTripId && segment !== "settings";

  const [user, setUser] = useState<UserSummary | null>(USER_CACHE);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [tripCtx, setTripCtx] = useState<TripContext | null>(
    () => (currentTripId ? TRIP_CACHE.get(currentTripId) ?? null : null),
  );

  // A guest doesn't get the Plan tab or the Trip settings entry (both
  // owner-only). The route guards enforce this; here we just don't offer it.
  const [guest, setGuest] = useState(false);
  useEffect(() => {
    if (!currentTripId) { setGuest(false); return; }
    let cancelled = false;
    isTripGuest(currentTripId).then((g) => { if (!cancelled) setGuest(g); });
    return () => { cancelled = true; };
  }, [currentTripId]);

  useEffect(() => {
    if (!showTripStrip || !currentTripId) return;
    const cached = TRIP_CACHE.get(currentTripId);
    if (cached) { setTripCtx(cached); return; }

    let cancelled = false;
    const supabase = createClient();
    (async () => {
      try {
        const [{ data: trip }, { data: days }] = await Promise.all([
          supabase
            .from("trips")
            .select("id, title, start_date, end_date")
            .eq("id", currentTripId)
            .single(),
          supabase
            .from("days")
            .select("id")
            .eq("trip_id", currentTripId)
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
        TRIP_CACHE.set(currentTripId, next);
        setTripCtx(next);
      } catch (err) {
        console.error("[DesktopMasthead] trip fetch failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [currentTripId, showTripStrip]);

  useEffect(() => {
    if (USER_CACHE) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (cancelled || !u) return;
      const meta = u.user_metadata ?? {};
      const next: UserSummary = {
        name:
          (meta.full_name as string | undefined) ??
          (meta.name as string | undefined) ??
          null,
        email: u.email ?? null,
      };
      USER_CACHE = next;
      setUser(next);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header
      className="hidden md:flex"
      style={{
        height: 64,
        paddingLeft: 28,
        paddingRight: 28,
        alignItems: "center",
        borderBottom: `1px solid ${RULE}`,
        background: "#FAF7F2",
        color: INK,
      }}
    >
      <Link
        href="/trips"
        className="font-display italic"
        style={{
          fontWeight: 500,
          fontSize: 24,
          letterSpacing: "-0.015em",
          color: INK,
          textDecoration: "none",
        }}
      >
        Roam
      </Link>

      <div
        style={{
          width: 1,
          height: 22,
          background: RULE,
          margin: "0 22px",
        }}
      />

      <nav style={{ display: "flex", alignItems: "center" }}>
        <Link
          href="/trips"
          className="font-display italic"
          style={{
            padding: "6px 2px",
            fontWeight: onJourneys ? 500 : 400,
            fontSize: 17,
            color: onJourneys ? INK : currentTripId ? CAPTION : INK,
            letterSpacing: "-0.005em",
            borderBottom: onJourneys ? `1px solid ${INK}` : "1px solid transparent",
            textDecoration: "none",
          }}
        >
          Journeys
        </Link>

        {showTripStrip && currentTripId && (
          <>
            <span
              className="font-display italic"
              style={{
                color: CAPTION_SOFT,
                padding: "0 10px",
                fontSize: 17,
              }}
            >
              ›
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 12,
                minWidth: 0,
              }}
            >
              <span
                className="font-display italic"
                style={{
                  fontWeight: 500,
                  fontSize: 17,
                  color: INK,
                  letterSpacing: "-0.005em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 360,
                }}
              >
                {tripCtx?.title ?? " "}
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
                {tripCtx ? formatDateRange(tripCtx.start_date, tripCtx.end_date) : " "}
              </span>
            </div>

            <div
              style={{
                width: 1,
                height: 22,
                background: RULE,
                margin: "0 22px",
                flexShrink: 0,
              }}
            />

            <TripTabs
              tripId={currentTripId}
              segment={segment}
              firstDayId={tripCtx?.firstDayId ?? null}
              guest={guest}
            />
          </>
        )}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Plan a journey — masthead-global new-trip entry, matches design canvas. */}
      <Link
        href="/trips/new"
        title="Plan a journey"
        aria-label="Plan a journey"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: CAPTION,
          padding: 8,
          marginRight: 6,
          textDecoration: "none",
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>

      {/* Profile dropdown — replaces the previous direct-link avatar. */}
      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Profile menu"
          aria-haspopup="menu"
          aria-expanded={open}
          style={{
            display: "inline-flex",
            alignItems: "center",
            color: INK,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <UserCircle size={30} weight="light" />
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 10px)",
              width: 224,
              background: "#fff",
              border: `1px solid ${RULE}`,
              borderRadius: 12,
              boxShadow: "0 6px 20px rgba(26,26,46,0.10)",
              overflow: "hidden",
              zIndex: 50,
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${RULE}` }}>
              <div
                className="font-display italic"
                style={{
                  fontWeight: 500,
                  fontSize: 15,
                  color: INK,
                  letterSpacing: "-0.005em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.name ?? "Signed in"}
              </div>
              {user?.email && (
                <div
                  style={{
                    fontSize: 11,
                    color: CAPTION,
                    letterSpacing: "0.06em",
                    marginTop: 3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user.email}
                </div>
              )}
            </div>
            {currentTripId && !guest && (
              <Link
                href={`/trips/${currentTripId}/settings`}
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "11px 16px",
                  fontSize: 13,
                  color: INK,
                  textDecoration: "none",
                }}
              >
                Trip settings
              </Link>
            )}
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                padding: "11px 16px",
                fontSize: 13,
                color: INK,
                textDecoration: "none",
              }}
            >
              Profile
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "11px 16px",
                  fontSize: 13,
                  color: INK,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}

function TripTabs({
  tripId,
  segment,
  firstDayId,
  guest = false,
}: {
  tripId: string;
  segment: "days" | "plan" | "map" | "settings" | null;
  firstDayId: string | null;
  guest?: boolean;
}) {
  const activeTab: "agenda" | "plan" | "map" =
    segment === "plan" ? "plan" : segment === "map" ? "map" : "agenda";

  const agendaHref = firstDayId
    ? `/trips/${tripId}/days/${firstDayId}`
    : `/trips/${tripId}`;

  const TABS = [
    { id: "agenda" as const, label: "Agenda", icon: Calendar, href: agendaHref },
    { id: "plan" as const, label: "Plan", icon: Columns, href: `/trips/${tripId}/plan` },
    { id: "map" as const, label: "Map", icon: MapPin, href: `/trips/${tripId}/map` },
  ].filter((t) => !(guest && t.id === "plan"));

  return (
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
  );
}
