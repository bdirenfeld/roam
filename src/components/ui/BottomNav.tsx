"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export default function BottomNav() {
  const pathname = usePathname();
  const { tripId, dayId } = useTripContext();

  // Only show inside a trip route (/trips/[uuid]/*)
  const insideTrip = !!tripId && UUID_RE.test(tripId);
  if (!insideTrip) return null;

  // Resolve tab destinations based on context
  const daysHref  = dayId && tripId ? `/trips/${tripId}/days/${dayId}` : tripId ? `/trips/${tripId}` : "/trips";
  const mapHref   = tripId ? `/trips/${tripId}/map` : "/map";
  const planHref  = tripId ? `/trips/${tripId}/plan` : "/trips";

  const tabs = [
    {
      key: "days",
      href: daysHref,
      label: "Agenda",
      active: pathname.includes("/days/"),
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={active ? "#0D9488" : "#9CA3AF"} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      key: "trips",
      href: planHref,
      label: "Plan",
      active: pathname.includes("/plan") || (pathname.startsWith("/trips") && !pathname.includes("/days/") && !pathname.endsWith("/map") && !pathname.includes("/plan")),
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={active ? "#0D9488" : "#9CA3AF"} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      ),
    },
    {
      key: "map",
      href: mapHref,
      label: "Map",
      active: pathname.endsWith("/map") || pathname === "/map",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
          stroke={active ? "#0D9488" : "#9CA3AF"} strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round">
          <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
          <line x1="9" y1="3" x2="9" y2="18" />
          <line x1="15" y1="6" x2="15" y2="21" />
        </svg>
      ),
    },
  ];

  const isFullWidthPage = pathname?.endsWith("/plan");

  return (
    <nav className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full ${isFullWidthPage ? "md:max-w-full" : "max-w-mobile"} bg-white/95 backdrop-blur-sm border-t border-gray-100 z-50`}>
      <div className="flex items-center justify-around py-2 pb-safe">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className="flex flex-col items-center gap-0.5 py-1.5 px-5"
          >
            {tab.icon(tab.active)}
            <span className={`text-[10px] font-semibold transition-colors ${tab.active ? "text-activity" : "text-gray-400"}`}>
              {tab.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
