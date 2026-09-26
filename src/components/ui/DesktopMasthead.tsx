"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserCircle, Calendar, Columns, MapPin, Plus, Files } from "@phosphor-icons/react";
import SharedWithFaces from "@/components/trip/SharedWithFaces";
import AppMenu from "@/components/ui/AppMenu";
import {
  NewJourneyLink,
  ProfileLink,
} from "@/components/overlays/AppOverlays";
import { createClient } from "@/lib/supabase/client";
import { resolveDefaultDay } from "@/lib/resolveDefaultDay";
import { signOut } from "@/lib/auth-actions";
import { isTripGuest } from "@/lib/trip-access-client";
import { groupTrips, type SwitcherTrip } from "@/lib/tripSwitcher";

const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.10)";
const CAPTION = "rgba(26,26,46,0.62)";
const CAPTION_SOFT = "rgba(26,26,46,0.35)";

type UserSummary = { name: string | null; email: string | null; avatarUrl: string | null };

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
  const tripMatch = /^\/trips\/([^/]+)(?:\/(days|plan|map|settings|estimate))?/.exec(pathname);
  const currentTripId =
    tripMatch && tripMatch[1] !== "new" ? tripMatch[1] : null;
  const segment = (tripMatch?.[2] ?? null) as
    | "days" | "plan" | "map" | "settings" | "estimate" | null;
  // Settings and Estimate are standalone screens with their own back header —
  // the journey strip would be a second, competing chrome.
  const ownHeader = segment === "settings" || segment === "estimate";
  const showTripStrip = !!currentTripId && !ownHeader;

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
            .select("id, date")
            .eq("trip_id", currentTripId)
            .order("day_number", { ascending: true }),
        ]);
        if (cancelled || !trip) return;
        const next: TripContext = {
          id: trip.id,
          title: trip.title,
          start_date: trip.start_date,
          end_date: trip.end_date,
          // Mid-trip, the Agenda tab should land on today, not Day 1
          firstDayId: resolveDefaultDay(days ?? [])?.id ?? null,
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
        // Google returns the photo on the session; users.avatar_url holds the
        // same value, so no extra round trip is needed to show a face.
        avatarUrl:
          (meta.avatar_url as string | undefined) ??
          (meta.picture as string | undefined) ??
          null,
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
        // Stays put while the page scrolls (Brennan, 25 Sep 2026).
        position: "sticky",
        top: 0,
        zIndex: 40,
        height: 64,
        paddingLeft: 28,
        paddingRight: 28,
        alignItems: "center",
        borderBottom: `1px solid ${RULE}`,
        background: "#F5F4F1",
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
              <TripSwitcher currentTripId={currentTripId} title={tripCtx?.title ?? " "} />
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

            {/* One screen (26 Sep 2026): the owner's Agenda / Plan switch is
                gone on desktop. The week is home; a day header opens that day,
                and "‹ Week" is the way back. Guests have no week, so they keep
                their Agenda / Map tabs. */}
            {(guest || segment !== "plan") && (
              <div
                style={{
                  width: 1,
                  height: 22,
                  background: RULE,
                  margin: "0 22px",
                  flexShrink: 0,
                }}
              />
            )}

            {guest ? (
              <TripTabs
                tripId={currentTripId}
                segment={segment}
                firstDayId={tripCtx?.firstDayId ?? null}
                guest={guest}
              />
            ) : segment !== "plan" ? (
              <Link
                href={`/trips/${currentTripId}/plan`}
                data-testid="back-to-week"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 14px 6px 10px",
                  borderRadius: 999,
                  background: "rgba(26,26,46,0.05)",
                  boxShadow: `inset 0 0 0 1px ${RULE}`,
                  fontWeight: 600,
                  fontSize: 13,
                  color: INK,
                  textDecoration: "none",
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
                Week
              </Link>
            ) : null}
          </>
        )}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Who this journey is shared with — faces, not a settings screen. */}
      {showTripStrip && currentTripId && !guest && (
        <div style={{ marginRight: 14 }}>
          <SharedWithFaces tripId={currentTripId} tripTitle={tripCtx?.title ?? null} />
        </div>
      )}

      {/* Plan a journey — the app's first action, as a button on the pages
          where it belongs (Journeys, Ideas). On a desktop it lived only in the
          ⋯ menu while the phone header carried a "+" and the guide said "tap
          the +" (UX audit, Sep 2026, finding 3). Inside a journey the menu
          row is enough. */}
      {!showTripStrip && (
        <NewJourneyLink
          title="Plan a journey"
          ariaLabel="Plan a journey"
          style={{
            display: "inline-flex", alignItems: "center", gap: 7, height: 33,
            padding: "0 13px 0 11px", marginRight: 8, borderRadius: 8,
            background: INK, color: "#F5F4F1", fontSize: 13, fontWeight: 500,
            letterSpacing: "-0.005em", border: "none", cursor: "pointer",
          }}
        >
          <Plus size={13} weight="bold" />
          Plan a journey
        </NewJourneyLink>
      )}

      {/* No Search and no "?" here since 25 Sep 2026 (Brennan): the map has
          its own search and the Journeys page finds a journey; the guide is
          a long page nobody reads and will come back as short recordings.
          "/" and ⌘/Ctrl-K still open search from anywhere. */}
      {/* Everything reached occasionally, named, in one menu — including Plan
          a journey, which is why this renders off a journey as well as on one.
          The phone has shown this list all along; this is it at desktop width. */}
      {/* On a journey only: off one there is nothing left to put in it. */}
      {currentTripId && (
      <AppMenu
        variant="desktop"
        tripId={currentTripId}
        guest={guest}
        // Bookings, as on the phone. The sheet belongs to the open screen
        // (Agenda, Plan, Map); this row only asks for it.
        extra={showTripStrip && !guest ? [
          { key: "bookings", title: "Bookings", sub: "", icon: <Files size={15} weight="light" />, onClick: () => window.dispatchEvent(new CustomEvent("roam:open-bookings")) },
        ] : undefined}
        triggerClassName="inline-flex items-center justify-center w-[33px] h-[33px] rounded-lg text-[rgba(26,26,46,0.62)] hover:bg-[rgba(26,26,46,0.06)] transition-colors"
      />
      )}

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
          {/* Your own Google photo — it's stored at sign-in, so the generic
              glyph is only ever a fallback for an account without one (or a
              rotated Google URL that no longer resolves). */}
          {user?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              width={30}
              height={30}
              onError={() => setUser((u) => (u ? { ...u, avatarUrl: null } : u))}
              style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }}
            />
          ) : (
            <UserCircle size={30} weight="light" />
          )}
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
            {/* Journey settings used to sit here, which put the same screen
                behind two different doors depending on the width — this menu on
                desktop, the day view's menu on a phone. It lives with the rest
                of the journey now, in AppMenu. This dropdown is yours: your
                profile, your session. */}
            <ProfileLink
              role="menuitem"
              onBeforeOpen={() => setOpen(false)}
              style={{
                display: "block",
                padding: "11px 16px",
                fontSize: 13,
                color: INK,
                textDecoration: "none",
              }}
            >
              Profile
            </ProfileLink>
            {/* "How Roam works" moved to the always-visible "?" in the masthead */}
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

// The journeys for the switcher, fetched once per session on first open.
let SWITCHER_CACHE: SwitcherTrip[] | null = null;

/**
 * "Tuscany ▾" (26 Sep 2026): the journey's name opens a list of the others,
 * so switching journeys does not mean going back to Journeys first. A row
 * goes to /trips/{id}, which lands on that journey's current day.
 */
function TripSwitcher({ currentTripId, title }: { currentTripId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [trips, setTrips] = useState<SwitcherTrip[] | null>(SWITCHER_CACHE);
  const ref = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => {
    if (!open || SWITCHER_CACHE) return;
    let cancelled = false;
    createClient()
      .from("trips")
      .select("id, title, start_date, end_date, archived")
      .then(({ data, error }) => {
        if (error) { console.error("[TripSwitcher] trips fetch failed:", error); return; }
        SWITCHER_CACHE = (data ?? []) as SwitcherTrip[];
        if (!cancelled) setTrips(SWITCHER_CACHE);
      });
    return () => { cancelled = true; };
  }, [open]);

  const today = new Date().toLocaleDateString("en-CA");
  const groups = trips ? groupTrips(trips, today) : null;

  const row = (t: SwitcherTrip) => {
    const on = t.id === currentTripId;
    return (
      <Link
        key={t.id}
        href={`/trips/${t.id}`}
        onClick={() => setOpen(false)}
        role="menuitem"
        aria-current={on ? "page" : undefined}
        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[#F3EFE4]"
        style={{ textDecoration: "none", color: INK, background: on ? "#F3EFE4" : undefined }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 14, fontWeight: on ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
          <span style={{ display: "block", fontSize: 10, letterSpacing: "0.12em", color: CAPTION, marginTop: 1 }}>{formatDateRange(t.start_date, t.end_date)}</span>
        </span>
        {on && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12l5 5 9-10" /></svg>
        )}
      </Link>
    );
  };
  const heading = (label: string) => (
    <div style={{ padding: "10px 12px 4px", fontSize: 10, fontWeight: 600, letterSpacing: "0.12em", color: CAPTION }}>{label}</div>
  );

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch journey"
        className="font-display italic hover:bg-[rgba(26,26,46,0.05)]"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          margin: "-4px -8px",
          padding: "4px 8px",
          borderRadius: 8,
          border: 0,
          background: open ? "rgba(26,26,46,0.05)" : "transparent",
          cursor: "pointer",
          fontWeight: 500,
          fontSize: 17,
          color: INK,
          letterSpacing: "-0.005em",
          whiteSpace: "nowrap",
          maxWidth: 380,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{title}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={CAPTION} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <div
          role="menu"
          data-testid="trip-switcher"
          className="absolute z-[70] bg-white rounded-[14px] p-1.5"
          style={{ left: -8, top: 34, width: 300, maxHeight: "70vh", overflowY: "auto", border: `1px solid ${RULE}`, boxShadow: "0 16px 34px rgba(26,26,46,0.17)", fontStyle: "normal" }}
        >
          {!groups && <div style={{ padding: 12, fontSize: 13, color: CAPTION }}>Loading…</div>}
          {groups && groups.upcoming.length > 0 && heading("UPCOMING")}
          {groups?.upcoming.map(row)}
          {groups && groups.past.length > 0 && heading("PAST")}
          {groups?.past.map(row)}
          <div style={{ height: 1, background: RULE, margin: "6px 4px" }} />
          <Link href="/trips/new" onClick={() => setOpen(false)} role="menuitem" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[#F3EFE4]" style={{ textDecoration: "none", color: INK, fontSize: 14, fontWeight: 600 }}>
            <Plus size={14} weight="bold" /> Plan a journey
          </Link>
        </div>
      )}
    </div>
  );
}

function TripTabs({
  tripId,
  segment,
  firstDayId,
  guest = false,
}: {
  tripId: string;
  segment: "days" | "plan" | "map" | "settings" | "estimate" | null;
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
    // Owners: the map lives inside Plan since 24 Sep 2026 (beside the week,
    // with a disc that widens it); the tab would be a second door to less.
    // Guests have no Plan, so they keep the Map tab.
  ].filter((t) => !(guest && t.id === "plan") && !(!guest && t.id === "map"));

  // One segmented control, not two floating pills (Brennan, 25 Sep 2026): a
  // binary view switch reads as one thing. The thumb slides between the
  // segments; it is measured from the links so the labels stay real text.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const measure = () => {
      const on = wrap.querySelector<HTMLElement>("[data-on='1']");
      if (!on) { setThumb(null); return; }
      setThumb({ left: on.offsetLeft, width: on.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure); ro.observe(wrap);
    return () => ro.disconnect();
  }, [activeTab, TABS.length]);

  return (
    <div
      ref={wrapRef}
      role="tablist"
      style={{ position: "relative", display: "inline-flex", alignItems: "center", padding: 3, borderRadius: 999, background: "rgba(26,26,46,0.05)", boxShadow: `inset 0 0 0 1px ${RULE}`, flexShrink: 0 }}
    >
      {thumb && (
        <span
          aria-hidden
          style={{ position: "absolute", top: 3, bottom: 3, left: thumb.left, width: thumb.width, borderRadius: 999, background: "#fff", boxShadow: "0 1px 2px rgba(26,26,46,0.08)", transition: "left 160ms ease, width 160ms ease" }}
        />
      )}
      {TABS.map((t) => {
        const on = t.id === activeTab;
        const Icon = t.icon;
        return (
          <Link
            key={t.id}
            href={t.href}
            role="tab"
            aria-selected={on}
            data-on={on ? "1" : undefined}
            style={{
              position: "relative",
              padding: "6px 14px",
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              gap: 7,
              fontWeight: on ? 600 : 500,
              fontSize: 13,
              color: on ? INK : CAPTION,
              letterSpacing: "-0.005em",
              textDecoration: "none",
              transition: "color 160ms",
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
