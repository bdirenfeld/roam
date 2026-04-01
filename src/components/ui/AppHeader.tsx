import Link from "next/link";
import Image from "next/image";

interface AppHeaderProps {
  avatarUrl?: string | null;
  subtitle?: string;
  showHomeButton?: boolean;
}

export default function AppHeader({ avatarUrl, subtitle, showHomeButton }: AppHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white sticky top-0 z-30">
      <div className="flex items-center gap-2">
        {showHomeButton && (
          <Link
            href="/trips"
            className="w-7 h-7 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="All trips"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </Link>
        )}
        <div>
          <Link href="/trips">
            <span className="text-xl font-bold tracking-tight text-gray-900">
              Roam
            </span>
          </Link>
          {subtitle && (
            <p className="text-xs text-gray-500 font-medium -mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

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
    </header>
  );
}
