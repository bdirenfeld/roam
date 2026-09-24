"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarBlank, MapTrifold } from "@phosphor-icons/react";

/**
 * Extract /trips/[tripId]/days/[dayId] segments from the current path.
 * Returns null for segments that aren't present.
 */
function useTripContext(): { tripId: string | null; dayId: string | null } {
  const pathname = usePathname();
  const match = pathname.match(/^\/trips\/([^/]+)(?:\/days\/([^/]+))?/);
  return {
    tripId: match?.[1] ?? null,
    dayId:  match?.[2] ?? null,
  };
}

// UUID v4 pattern (loose match)
const UUID_RE = /^[0-9a-f-]{36}$/i;

// Two tabs on the phone: Agenda (the day) and Map (where). The Plan board is
// a desktop screen — at 148px a column it answered neither question well, and
// guests never had it (Brennan, 24 Sep 2026). /plan still resolves on a phone.
export default function BottomNav() {
  const pathname = usePathname();
  const { tripId, dayId } = useTripContext();

  // Only show inside a trip route (/trips/[uuid]/*)
  const insideTrip = !!tripId && UUID_RE.test(tripId);
  // Hide on trip settings and the estimate — both have their own back header,
  // and the estimate's save button sits where the nav would.
  const isSettingsPage =
    pathname?.endsWith("/settings") || pathname?.endsWith("/estimate");

  if (!insideTrip || isSettingsPage) return null;

  // Resolve tab destinations based on context
  const daysHref  = dayId && tripId ? `/trips/${tripId}/days/${dayId}` : tripId ? `/trips/${tripId}` : "/trips";
  const mapHref   = tripId ? `/trips/${tripId}/map` : "/map";

  const tabs = [
    {
      key: "days",
      href: daysHref,
      label: "Agenda",
      // The journey root redirects to a day, so it counts as Agenda too.
      active: !pathname.endsWith("/map") && !pathname.includes("/plan"),
      icon: (active: boolean) => (
        <CalendarBlank size={22} weight="light" color={active ? "#1A1A2E" : "rgba(26, 26, 46, 0.4)"} />
      ),
    },
    {
      key: "map",
      href: mapHref,
      label: "Map",
      active: pathname.endsWith("/map") || pathname === "/map",
      icon: (active: boolean) => (
        <MapTrifold size={22} weight="light" color={active ? "#1A1A2E" : "rgba(26, 26, 46, 0.4)"} />
      ),
    },
  ];

  return (
    <nav className="fixed bottom-0 left-[calc(50vw-195px)] w-full max-w-mobile bg-white/95 backdrop-blur-sm border-t border-gray-100 z-50 md:hidden">
      <div className="flex items-center justify-around py-2 pb-safe">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className="flex flex-col items-center gap-0.5 py-1.5 px-5"
          >
            {tab.icon(tab.active)}
            <span
              className="text-[10px] font-semibold transition-colors"
              style={{ color: tab.active ? "#1A1A2E" : "rgba(26, 26, 46, 0.4)" }}
            >
              {tab.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
