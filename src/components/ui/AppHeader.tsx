import Link from "next/link";
import Image from "next/image";

interface AppHeaderProps {
  avatarUrl?: string | null;
  subtitle?: string;
  showNewTrip?: boolean;
}

export default function AppHeader({ avatarUrl, subtitle, showNewTrip }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-30">
      <div>
        <Link href="/">
          <span className="font-display italic text-xl text-gray-900">
            Roam
          </span>
        </Link>
        {subtitle && (
          <p className="text-xs text-gray-500 font-medium -mt-0.5">{subtitle}</p>
        )}
      </div>

      {/* Right side: optional + button + profile avatar */}
      <div className="flex items-center gap-2">
        {showNewTrip && (
          <Link href="/trips/new">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#1A1A2E" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
          </Link>
        )}

        {/* Profile avatar */}
        <Link href="/profile">
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
        </Link>
      </div>
    </header>
  );
}
