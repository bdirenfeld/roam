import Link from "next/link";
import Image from "next/image";
import { User } from "@phosphor-icons/react";

interface AppHeaderProps {
  avatarUrl?: string | null;
  subtitle?: string;
}

export default function AppHeader({ avatarUrl, subtitle }: AppHeaderProps) {
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

      {/* Profile avatar */}
      <Link href="/profile">
        <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200">
          {avatarUrl ? (
            <Image src={avatarUrl} alt="Profile" width={32} height={32} className="object-cover" />
          ) : (
            <User size={16} weight="light" color="#9CA3AF" />
          )}
        </div>
      </Link>
    </header>
  );
}
