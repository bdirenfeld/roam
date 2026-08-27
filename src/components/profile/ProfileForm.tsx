"use client";

// ── Profile ───────────────────────────────────────────────────────────────
// The whole Profile screen body — identity block, editable travel profile,
// and the mobile-only guide/sign-out row. /profile renders it as a page with
// server-fetched data; the Profile overlay renders the same component and
// lets it read its own row through the browser client.
//
// Host contract (components/ui/Overlay.tsx): flex column, flex-shrink-0
// header, `flex-1 min-h-0 overflow-y-auto` body carrying every input.

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import ProfileClient from "@/components/profile/ProfileClient";
import { signOut } from "@/lib/auth-actions";

export interface ProfileData {
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  homeAirport: string | null;
  homeCountry: string | null;
  passportCountry: string | null;
}

interface Props {
  /**
   * Server-fetched profile. Omit it (the overlay case) and the component
   * reads the same row client-side behind a small loading state, so opening
   * never waits on a round trip.
   */
  initial?: ProfileData | null;
  /** Chrome only. "overlay" adds the title/close row the page gets from AppHeader. */
  variant?: "page" | "overlay";
  onDismiss?: () => void;
}

export default function ProfileForm({ initial = null, variant = "page", onDismiss }: Props) {
  const overlay = variant === "overlay";
  const [data, setData] = useState<ProfileData | null>(initial);
  // Only the self-fetching host ever shows a spinner; with `initial` in hand
  // the first paint is already complete.
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setLoading(false);
        return;
      }
      // RLS scopes this to the signed-in traveller's own row. A missing row is
      // not an error — a first-time traveller has no `users` row yet, and the
      // travel-profile fields simply start empty.
      const { data: profile } = await supabase
        .from("users")
        .select("name, avatar_url, home_airport, home_country, passport_country")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const meta = user.user_metadata ?? {};
      setData({
        userId: user.id,
        email: user.email ?? null,
        displayName:
          profile?.name ??
          (meta.full_name as string | undefined) ??
          user.email ??
          "Guest",
        avatarUrl: profile?.avatar_url ?? (meta.avatar_url as string | undefined) ?? null,
        homeAirport: profile?.home_airport ?? null,
        homeCountry: profile?.home_country ?? null,
        passportCountry: profile?.passport_country ?? null,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [initial]);

  const body = (
    <div
      className={
        overlay
          ? "px-5 pt-5 pb-24"
          : "px-4 pt-6 pb-8 md:max-w-[880px] md:mx-auto md:px-10 md:pt-12 md:pb-16"
      }
    >
      {loading || !data ? (
        // Reserve the identity block's height so the arriving data causes no
        // layout shift — the same rule the weather strip follows.
        <div className="flex items-center gap-4 mb-8" aria-busy={loading}>
          <div className="w-16 h-16 rounded-full bg-gray-100 border border-gray-200 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] text-gray-400">
              {loading ? "Loading…" : "Not signed in"}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Avatar + name — display only, pulled from Google OAuth.
              At md:+ the avatar grows to 72×72, name becomes Playfair italic 30,
              and a hairline rule closes the identity block. */}
          <div
            className={
              overlay
                ? "flex items-center gap-4 mb-7 pb-6 border-b border-[rgba(26,26,46,0.12)]"
                : "flex items-center gap-4 mb-8 md:gap-[22px] md:mb-0 md:pb-7 md:border-b md:border-[rgba(26,26,46,0.12)]"
            }
          >
            <div
              className={`rounded-full bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200 flex-shrink-0 ${
                overlay ? "w-16 h-16" : "w-16 h-16 md:w-[72px] md:h-[72px]"
              }`}
            >
              {data.avatarUrl ? (
                <Image
                  src={data.avatarUrl}
                  alt={data.displayName}
                  width={72}
                  height={72}
                  className="object-cover w-full h-full"
                />
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <p
                className={
                  overlay
                    ? "font-display italic text-[24px] text-[#1A1A2E] leading-tight tracking-[-0.01em] truncate"
                    : "text-base font-bold text-gray-900 md:font-display md:italic md:font-medium md:text-[30px] md:font-normal md:text-[#1A1A2E] md:leading-tight md:tracking-[-0.01em]"
                }
              >
                {data.displayName}
              </p>
              <p
                className={
                  overlay
                    ? "text-[13px] text-[rgba(26,26,46,0.55)] mt-1 truncate"
                    : "text-sm text-gray-400 mt-0.5 md:text-[14px] md:text-[rgba(26,26,46,0.55)] md:mt-1 md:tracking-[-0.005em]"
                }
              >
                {data.email}
              </p>
            </div>
          </div>

          {/* Editable travel profile + save */}
          <ProfileClient
            userId={data.userId}
            initialHomeAirport={data.homeAirport}
            initialHomeCountry={data.homeCountry}
            initialPassportCountry={data.passportCountry}
          />

          {/* Guide + sign out. On the page these are mobile-only — at md:+ the
              DesktopMasthead dropdown carries them. In the overlay they always
              show: the overlay is reachable from a phone, where there is no
              dropdown at all. */}
          <div
            className={`flex items-center gap-6 ${
              overlay
                ? "mt-8 pt-4 border-t border-gray-100 md:hidden"
                : "mt-10 pt-4 border-t border-gray-100 md:hidden"
            }`}
          >
            <a
              href="/guide.html"
              target="_blank"
              rel="noopener"
              className="text-sm font-semibold text-gray-400 hover:text-gray-500 transition-colors"
            >
              How Roam works
            </a>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm font-semibold text-gray-400 hover:text-gray-500 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );

  if (!overlay) return body;

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex items-center h-11 border-b border-gray-100 flex-shrink-0 relative bg-white">
        <button
          onClick={onDismiss}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <span className="absolute left-0 right-0 text-center text-[16px] font-display italic text-gray-900 pointer-events-none">
          Profile
        </span>
      </div>
      {/* scroll-pb-24 belongs on the scroller, not the content: it is what
          lets a focused field near the bottom be scrolled clear of a phone
          keyboard rather than pinned behind it. */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-pb-24">{body}</div>
    </div>
  );
}
