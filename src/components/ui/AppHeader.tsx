import Link from "next/link";
import Image from "next/image";
import { SearchButton } from "@/components/search/GlobalSearch";
import { NewJourneyLink, ProfileLink } from "@/components/overlays/AppOverlays";

interface AppHeaderProps {
  avatarUrl?: string | null;
  subtitle?: string;
  showNewTrip?: boolean;
  /** Untriaged captures — shows as a dot beside Ideas. */
  ideaCount?: number;
}

export default function AppHeader({ avatarUrl, subtitle, showNewTrip, ideaCount = 0 }: AppHeaderProps) {
  return (
    <header className="flex md:hidden items-center justify-between px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-30">
      <div className="flex items-baseline gap-2.5 min-w-0">
        {/* No wordmark on a phone. You opened the app from its own icon;
            repeating the name spent about a third of a 360px row. Journeys is
            the page title and the nav at once. */}
        <Link href="/trips">
          <span className="font-display italic text-[20px] text-gray-900">
            Journeys
          </span>
        </Link>
        {/* Top-level, not a glyph: Ideas is somewhere you browse. */}
        <Link href="/ideas" className="relative">
          <span className="font-display italic text-[15px] text-gray-400">
            Ideas
          </span>
          {ideaCount > 0 && (
            <span
              className="absolute -top-0.5 -right-2 w-[6px] h-[6px] rounded-full"
              style={{ background: "#C4622D" }}
            />
          )}
        </Link>
        {subtitle && (
          <p className="text-xs text-gray-500 font-medium -mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Right side: search + optional + button + profile avatar */}
      <div className="flex items-center gap-2">
        {/* Search — opens the full-height search sheet. Bare glyph, same
            weight as the masthead's, so the two headers read as one app. */}
        <SearchButton
          className="w-8 h-8 flex items-center justify-center text-[rgba(26,26,46,0.55)]"
          size={18}
          strokeWidth={1.5}
        />

        {/* "+" and the avatar open their screens in place. Both stay real
            links to /trips/new and /profile, so ctrl/cmd-click still opens
            the page — see components/overlays/AppOverlays.tsx. */}
        {showNewTrip && (
          <NewJourneyLink title="Plan a journey" ariaLabel="Plan a journey">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#1A1A2E" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
          </NewJourneyLink>
        )}

        {/* Profile avatar */}
        <ProfileLink title="Profile" ariaLabel="Profile">
          <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200">
            {avatarUrl ? (
              <Image src={avatarUrl} alt="Profile" width={32} height={32} className="object-cover" />
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>
        </ProfileLink>
      </div>
    </header>
  );
}
